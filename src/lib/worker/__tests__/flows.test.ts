import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { adminDb } from "@/db";
import { appointments, branches, carePlans, consents, jobs, messageLog, patients, tenants, visits, vitals } from "@/db/schema";
import { addDays, localDay } from "@/lib/format";
import { dailyTenant, scheduleRecurring } from "../daily";
import { handleInbound } from "../inbound";

let tenantId: string, patientId: string, apptId: string;
const phone = `+23320${String(Date.now()).slice(-7)}`;

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {}); // dev-log "sends"
  const db = adminDb();
  const [t] = await db.insert(tenants).values({ name: "Flow test", slug: `flow-test-${Date.now()}` }).returning();
  tenantId = t.id;
  const [b] = await db.insert(branches).values({ tenantId, name: "Main", isMain: true }).returning();
  const [p] = await db.insert(patients).values({ tenantId, patientNo: "P-000001", firstName: "Ama", lastName: "Owusu", phone }).returning();
  patientId = p.id;
  const [a] = await db.insert(appointments).values({ tenantId, branchId: b.id, patientId, startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 86400_000 + 900_000) }).returning();
  apptId = a.id;
  await db.insert(carePlans).values({ tenantId, patientId, condition: "hypertension", targets: { bpSys: 140, bpDia: 90 }, nextDueAt: localDay("Africa/Accra"), nudgeTime: "23:59" });
  await db.insert(visits).values({ tenantId, branchId: b.id, patientId, followUpDate: addDays(localDay("Africa/Accra"), 1) });
  await db.insert(appointments).values({ tenantId, branchId: b.id, patientId, startsAt: new Date(Date.now() - 3 * 86400_000), endsAt: new Date(Date.now() - 3 * 86400_000 + 900_000) });
});
afterAll(async () => {
  await adminDb().delete(tenants).where(eq(tenants.id, tenantId));
  await adminDb().delete(jobs).where(and(eq(jobs.type, "billing.sweep"), eq(jobs.status, "pending")));
  vi.restoreAllMocks();
});

describe("inbound commands", () => {
  it("confirms the next appointment", async () => {
    expect(await handleInbound({ channel: "sms", from: phone, text: "1", provider: "test", providerId: `in-${Date.now()}` })).toMatchObject({ status: "ok", command: "confirm" });
    const [a] = await adminDb().select().from(appointments).where(eq(appointments.id, apptId));
    expect(a.status).toBe("confirmed");
  });
  it("records a reading and flags it for review only", async () => {
    await handleInbound({ channel: "whatsapp", from: phone.slice(1), text: "BP 150/95", provider: "test" });
    const [v] = await adminDb().select().from(vitals).where(eq(vitals.patientId, patientId));
    expect(v).toMatchObject({ bpSys: 150, bpDia: 95, source: "patient" });
    const replies = await adminDb().select().from(messageLog).where(and(eq(messageLog.patientId, patientId), eq(messageLog.direction, "out")));
    expect(replies.some((r) => r.body.includes("Your clinic will review this reading"))).toBe(true);
  });
  it("STOP records an opt-out", async () => {
    await handleInbound({ channel: "sms", from: phone, text: "STOP", provider: "test" });
    const [c] = await adminDb().select().from(consents).where(eq(consents.patientId, patientId));
    expect(c).toMatchObject({ type: "messaging", granted: false, method: "sms" });
    expect(await handleInbound({ channel: "sms", from: "+10000000000", text: "1", provider: "test" })).toEqual({ status: "unknown_sender" });
  });
});

describe("daily sweep", () => {
  it("is idempotent and marks no-shows", async () => {
    await adminDb().insert(consents).values({ tenantId, patientId, type: "messaging", granted: true, method: "verbal" }); // re-subscribe
    await dailyTenant(tenantId);
    await dailyTenant(tenantId);
    const queued = await adminDb().select().from(messageLog).where(and(eq(messageLog.tenantId, tenantId), eq(messageLog.status, "queued")));
    const keys = queued.map((m) => m.templateKey).sort();
    expect(keys).toEqual(["care_check", "med_nudge"]); // follow-up skipped: an appointment is booked
    const statuses = (await adminDb().select().from(appointments).where(eq(appointments.tenantId, tenantId))).map((a) => a.status).sort();
    expect(statuses).toEqual(["confirmed", "no_show"]);
    await scheduleRecurring();
    await scheduleRecurring();
    expect((await adminDb().select().from(jobs).where(and(eq(jobs.tenantId, tenantId), eq(jobs.type, "daily.tenant")))).length).toBe(1);
  });
});
