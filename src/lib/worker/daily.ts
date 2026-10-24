import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { adminDb, withTenant, type Tx } from "@/db";
import {
  appointments, carePlans, items, jobs, messageLog, patientScheduleItems, stockBatches, tenants, users, visits,
} from "@/db/schema";
import { addDays, dateOnly, dayRange, localDay, zonedToUtc } from "@/lib/format";
import { queuePatientMessage } from "@/lib/messaging";
import { accessLevel } from "@/lib/plans";

type QueueOpts = Parameters<typeof queuePatientMessage>[1] & { dedupeKey: string };

/** queuePatientMessage, but skips entirely (no duplicate log row) when the dedupe job already exists. */
export async function queueOnce(t: Tx, o: QueueOpts) {
  const [dup] = await t.select({ id: jobs.id }).from(jobs).where(eq(jobs.dedupeKey, o.dedupeKey)).limit(1);
  return dup ? null : queuePatientMessage(t, o);
}

/** Per-tenant daily sweep. Idempotent: each message has a dedupe key and state changes are guarded. */
export async function dailyTenant(tenantId: string) {
  const [tenant] = await adminDb().select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return;
  const tz = tenant.timezone;
  const today = localDay(tz);
  const tomorrow = addDays(today, 1);
  const now = new Date();

  await withTenant(tenantId, async (t) => {
    // 1. Follow-ups due tomorrow with nothing booked.
    const due = await t.select({ id: visits.id, patientId: visits.patientId }).from(visits)
      .where(and(eq(visits.tenantId, tenantId), eq(visits.followUpDate, tomorrow)));
    for (const v of due) {
      const [booked] = await t.select({ id: appointments.id }).from(appointments)
        .where(and(eq(appointments.patientId, v.patientId), inArray(appointments.status, ["scheduled", "confirmed"]), gte(appointments.startsAt, now))).limit(1);
      if (booked) continue;
      await queueOnce(t, { tenantId, patientId: v.patientId, templateKey: "follow_up", purpose: "follow_up", vars: { date: dateOnly(`${tomorrow}T12:00:00Z`, tz) }, dedupeKey: `followup:${v.id}:${tomorrow}` });
    }

    // 2. Immunization / antenatal items due within 3 days; missed after 14 days overdue.
    const sched = await t.select().from(patientScheduleItems).where(and(
      eq(patientScheduleItems.tenantId, tenantId), eq(patientScheduleItems.status, "due"), isNull(patientScheduleItems.remindedAt),
      gte(patientScheduleItems.dueDate, today), lte(patientScheduleItems.dueDate, addDays(today, 3)),
    ));
    for (const s of sched) {
      await queueOnce(t, { tenantId, patientId: s.patientId, templateKey: "schedule_due", purpose: "reminder", vars: { item: s.name, date: dateOnly(`${s.dueDate}T12:00:00Z`, tz) }, dedupeKey: `sched:${s.id}` });
      await t.update(patientScheduleItems).set({ remindedAt: now }).where(eq(patientScheduleItems.id, s.id));
    }
    await t.update(patientScheduleItems).set({ status: "missed" })
      .where(and(eq(patientScheduleItems.tenantId, tenantId), eq(patientScheduleItems.status, "due"), lt(patientScheduleItems.dueDate, addDays(today, -14))));

    // 3. Care plan check-ups due; 4. daily medication nudges.
    const plans = await t.select().from(carePlans).where(and(eq(carePlans.tenantId, tenantId), eq(carePlans.active, true)));
    for (const p of plans) {
      if (p.nextDueAt && p.nextDueAt <= today) {
        await queueOnce(t, { tenantId, patientId: p.patientId, templateKey: "care_check", purpose: "care", vars: { condition: p.condition }, dedupeKey: `care:${p.id}:${p.nextDueAt}` });
        await t.update(carePlans).set({ nextDueAt: addDays(today, p.intervalDays) }).where(eq(carePlans.id, p.id));
      }
      if (p.adherenceNudges && p.nudgeTime && /^\d{2}:\d{2}$/.test(p.nudgeTime)) {
        const at = zonedToUtc(today, p.nudgeTime, tz);
        await queueOnce(t, { tenantId, patientId: p.patientId, templateKey: "med_nudge", purpose: "care", vars: {}, runAt: at > now ? at : now, dedupeKey: `nudge:${p.id}:${today}` });
      }
    }

    // 5. Low-stock and expiring-stock summary to the owner.
    const low = await t.select({ name: items.name, onHand: sql<number>`coalesce(sum(${stockBatches.qtyOnHand}), 0)::int`, reorder: items.reorderLevel })
      .from(items).leftJoin(stockBatches, eq(stockBatches.itemId, items.id))
      .where(and(eq(items.tenantId, tenantId), eq(items.active, true), sql`${items.reorderLevel} > 0`))
      .groupBy(items.id).having(sql`coalesce(sum(${stockBatches.qtyOnHand}), 0) <= ${items.reorderLevel}`);
    const expiring = await t.select({ name: items.name, batchNo: stockBatches.batchNo, expiry: stockBatches.expiry, qty: stockBatches.qtyOnHand })
      .from(stockBatches).innerJoin(items, eq(items.id, stockBatches.itemId))
      .where(and(eq(stockBatches.tenantId, tenantId), sql`${stockBatches.qtyOnHand} > 0`, isNotNull(stockBatches.expiry), lte(stockBatches.expiry, addDays(today, 60))))
      .orderBy(asc(stockBatches.expiry)).limit(30);
    if (low.length || expiring.length) {
      const [owner] = await t.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.role, "owner"), eq(users.active, true))).orderBy(asc(users.createdAt)).limit(1);
      const to = owner?.email ?? owner?.phone;
      const key = `stock:${tenantId}:${today}`;
      const [dup] = await t.select({ id: jobs.id }).from(jobs).where(eq(jobs.dedupeKey, key)).limit(1);
      if (to && !dup) {
        const body = [
          `${tenant.name} stock alert (${today})`,
          ...(low.length ? ["Low stock:", ...low.map((l) => `- ${l.name}: ${l.onHand} left (reorder at ${l.reorder})`)] : []),
          ...(expiring.length ? ["Expiring within 60 days:", ...expiring.map((e) => `- ${e.name}${e.batchNo ? ` (batch ${e.batchNo})` : ""}: ${e.qty} expire ${e.expiry}`)] : []),
        ].join("\n");
        const [log] = await t.insert(messageLog).values({ tenantId, channel: owner!.email ? "email" : "sms", to, templateKey: "stock_summary", purpose: "operations", body }).returning({ id: messageLog.id });
        await t.insert(jobs).values({ tenantId, type: "message.send", payload: { messageId: log.id }, dedupeKey: key }).onConflictDoNothing();
      }
    }

    // 6. Appointments from before today never checked in → no-show.
    await t.update(appointments).set({ status: "no_show" })
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.status, "scheduled"), lt(appointments.startsAt, dayRange(today, tz).start)));
  });
}

/** Platform-wide: unpaid past grace → read_only; trials past their end → past_due. */
export async function billingSweep(now = new Date()) {
  const db = adminDb();
  const all = await db.select().from(tenants).where(ne(tenants.planStatus, "cancelled"));
  for (const t of all) {
    if (t.planStatus !== "read_only" && accessLevel(t, now) === "read_only") {
      await db.update(tenants).set({ planStatus: "read_only" }).where(eq(tenants.id, t.id));
    } else if (t.planStatus === "trialing" && t.trialEndsAt && t.trialEndsAt < now) {
      // accessLevel() measures grace from currentPeriodEnd once out of trial, so carry the trial end over.
      await db.update(tenants).set({ planStatus: "past_due", currentPeriodEnd: t.currentPeriodEnd ?? t.trialEndsAt }).where(eq(tenants.id, t.id));
    }
  }
}

/** Enqueues daily.tenant at ~06:00 tenant-local and billing.sweep hourly. Safe to call often (dedupe keys). */
export async function scheduleRecurring(now = new Date()) {
  const db = adminDb();
  const hour = now.toISOString().slice(0, 13);
  const rows: (typeof jobs.$inferInsert)[] = [{ tenantId: null, type: "billing.sweep", payload: {}, runAt: now, dedupeKey: `billing:${hour}` }];
  for (const t of await db.select({ id: tenants.id, tz: tenants.timezone }).from(tenants).where(ne(tenants.planStatus, "cancelled"))) {
    const day = localDay(t.tz, now);
    rows.push({ tenantId: t.id, type: "daily.tenant", payload: {}, runAt: zonedToUtc(day, "06:00", t.tz), dedupeKey: `daily:${t.id}:${day}` });
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(jobs).values(rows.slice(i, i + 500)).onConflictDoNothing();
}
