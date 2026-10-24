"use server";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Tx } from "@/db";
import {
  appointments, diagnoses, icd10Codes, invoiceLines, invoices, items, labOrderItems, labOrders, labTests, prescriptionItems,
  prescriptions, queueTickets, referrals, scribeSessions, services, visitRevisions, visits, vitals,
} from "@/db/schema";
import { formObject, run, UserError, zBool, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx, type Ctx } from "@/lib/auth";
import { addLine, ensureVisitInvoice } from "@/lib/billing";
import { drugLabel, TEMPLATE_KEYS } from "@/lib/clinical-templates";
import { emit } from "@/lib/events";
import { addDays, dateOnly, dateTime, zonedToUtc } from "@/lib/format";
import { queuePatientMessage } from "@/lib/messaging";
import { applyVisitNote, NOTE_FIELDS } from "@/lib/visits";

const zId = z.string().uuid();
const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-24");

async function getVisit(t: Tx, id: string, opts: { open?: boolean } = {}) {
  const [v] = await t.select().from(visits).where(eq(visits.id, id)).for("update");
  if (!v) throw new UserError("Consultation not found");
  if (opts.open && v.status === "signed") throw new UserError("This note is signed and locked.");
  return v;
}

async function bill(t: Tx, ctx: Ctx, v: typeof visits.$inferSelect, line: { serviceId: string; quantity?: number }) {
  const inv = await ensureVisitInvoice(t, ctx, { patientId: v.patientId, visitId: v.id, branchId: v.branchId });
  await addLine(t, inv.id, line);
  return inv;
}

// ---------- Start ----------

export async function startVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ ticketId: zId.optional(), patientId: zId.optional(), template: z.enum(TEMPLATE_KEYS).default("general") }).parse(formObject(fd));
    if (!o.ticketId && !o.patientId) throw new UserError("Choose a patient");
    const id = await tx(ctx, async (t) => {
      const [ticket] = o.ticketId ? await t.select().from(queueTickets).where(eq(queueTickets.id, o.ticketId)).for("update") : [];
      if (o.ticketId && !ticket) throw new UserError("Queue ticket not found");
      if (ticket?.visitId) return ticket.visitId; // already started: open it
      const patientId = ticket?.patientId ?? o.patientId!;
      const [v] = await t.insert(visits).values({
        tenantId: ctx.tenant.id, branchId: ctx.branchId, patientId, template: o.template,
        practitionerId: ctx.user.isPractitioner ? ctx.user.id : (ticket?.practitionerId ?? null),
        appointmentId: ticket?.appointmentId ?? null,
      }).returning({ id: visits.id });
      if (ticket) {
        await t.update(queueTickets).set({
          visitId: v.id, status: "with_doctor", calledAt: ticket.calledAt ?? new Date(),
          practitionerId: ticket.practitionerId ?? (ctx.user.isPractitioner ? ctx.user.id : null),
        }).where(eq(queueTickets.id, ticket.id));
      }
      await audit(t, ctx, "create", "visit", v.id, { patientId, details: { ticketId: ticket?.id ?? null } });
      return v.id;
    });
    revalidatePath("/visits");
    redirect(`/visits/${id}`);
  });
}

// ---------- Note ----------

/** Autosave + explicit save. Returns the new version in `id` so the editor can send it as the next baseVersion. */
export async function saveNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const f = formObject(fd);
    const visitId = zId.parse(f.visitId);
    const baseVersion = z.coerce.number().int().parse(f.baseVersion);
    const note: Record<string, string> = {};
    for (const k of NOTE_FIELDS) if (fd.has(k)) note[k] = String(fd.get(k) ?? "");
    const extra: Record<string, string> = {};
    for (const [k, val] of fd.entries()) if (k.startsWith("extra_") && typeof val === "string") extra[k.slice(6)] = val;
    const updated = await tx(ctx, (t) => applyVisitNote(t, ctx, { visitId, baseVersion, note: { ...note, extra } }));
    if (f.explicit) revalidatePath(`/visits/${visitId}`);
    return { ok: true, id: String(updated.version), message: "Saved" };
  });
}

export async function setTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ visitId: zId, template: z.enum(TEMPLATE_KEYS) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId, { open: true });
      await t.update(visits).set({ template: o.template, updatedAt: new Date() }).where(eq(visits.id, v.id));
      await audit(t, ctx, "update", "visit", v.id, { patientId: v.patientId, details: { template: o.template } });
    });
    revalidatePath(`/visits/${o.visitId}`);
  });
}

// ---------- Vitals ----------

const num = (min: number, max: number) => z.coerce.number().min(min).max(max).optional();
const vitalsSchema = z.object({
  visitId: zId, tempC: num(30, 45), pulse: num(20, 250), respRate: num(4, 80), bpSys: num(50, 260), bpDia: num(20, 180),
  spo2: num(40, 100), weightKg: num(0.3, 400), heightCm: num(20, 250), glucose: num(0.5, 50),
});

export async function saveVitalsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("vitals.write");
    const { visitId, ...v } = vitalsSchema.parse(formObject(fd));
    if (Object.values(v).every((x) => x === undefined)) throw new UserError("Enter at least one measurement");
    const round = (x?: number) => (x === undefined ? null : Math.round(x));
    await tx(ctx, async (t) => {
      const visit = await getVisit(t, visitId, { open: true });
      await t.insert(vitals).values({
        tenantId: ctx.tenant.id, patientId: visit.patientId, visitId, recordedBy: ctx.user.id,
        tempC: v.tempC ?? null, pulse: round(v.pulse), respRate: round(v.respRate), bpSys: round(v.bpSys), bpDia: round(v.bpDia),
        spo2: round(v.spo2), weightKg: v.weightKg ?? null, heightCm: v.heightCm ?? null, glucose: v.glucose ?? null,
      });
      await audit(t, ctx, "create", "vitals", visitId, { patientId: visit.patientId });
    });
    revalidatePath(`/visits/${visitId}`);
  });
}

// ---------- Diagnoses ----------

export async function addDiagnosisAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ visitId: zId, icd10Code: z.string().max(10).optional(), description: z.string().max(300).optional(), isPrimary: zBool }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId, { open: true });
      let description = o.description;
      if (o.icd10Code && !description) {
        const [c] = await t.select().from(icd10Codes).where(eq(icd10Codes.code, o.icd10Code));
        if (!c) throw new UserError("Unknown ICD-10 code");
        description = c.description;
      }
      if (!description) throw new UserError("Enter a diagnosis or pick an ICD-10 code");
      const existing = await t.select({ id: diagnoses.id }).from(diagnoses).where(eq(diagnoses.visitId, v.id));
      const isPrimary = o.isPrimary || existing.length === 0;
      if (isPrimary) await t.update(diagnoses).set({ isPrimary: false }).where(eq(diagnoses.visitId, v.id));
      await t.insert(diagnoses).values({ tenantId: ctx.tenant.id, visitId: v.id, patientId: v.patientId, icd10Code: o.icd10Code ?? null, description, isPrimary });
      await audit(t, ctx, "create", "diagnosis", v.id, { patientId: v.patientId, details: { code: o.icd10Code ?? null } });
    });
    revalidatePath(`/visits/${o.visitId}`);
  });
}

export async function updateDiagnosisAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ id: zId, visitId: zId, op: z.enum(["primary", "remove"]) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId, { open: true });
      if (o.op === "remove") await t.delete(diagnoses).where(and(eq(diagnoses.id, o.id), eq(diagnoses.visitId, v.id)));
      else {
        await t.update(diagnoses).set({ isPrimary: false }).where(eq(diagnoses.visitId, v.id));
        await t.update(diagnoses).set({ isPrimary: true }).where(and(eq(diagnoses.id, o.id), eq(diagnoses.visitId, v.id)));
      }
      await audit(t, ctx, o.op === "remove" ? "delete" : "update", "diagnosis", o.id, { patientId: v.patientId });
    });
    revalidatePath(`/visits/${o.visitId}`);
  });
}

// ---------- Prescriptions ----------

const rxLine = z.object({
  drugName: z.string().min(1).max(200), dose: z.string().optional(), route: z.string().optional(), frequency: z.string().optional(),
  duration: z.string().optional(), quantity: z.coerce.number().int().min(1).max(10000).default(1), instructions: z.string().optional(),
});

export async function addPrescriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const f = formObject(fd);
    const visitId = zId.parse(f.visitId);
    const lines: z.infer<typeof rxLine>[] = [];
    for (let i = 0; i < 30; i++) {
      if (!f[`drugName_${i}`]) continue;
      lines.push(rxLine.parse(Object.fromEntries(Object.keys(rxLine.shape).map((k) => [k, f[`${k}_${i}`]]))));
    }
    if (!lines.length) throw new UserError("Add at least one drug");
    const id = await tx(ctx, async (t) => {
      const v = await getVisit(t, visitId, { open: true });
      const drugs = await t.select().from(items).where(and(eq(items.isDrug, true), eq(items.active, true)));
      const byLabel = new Map(drugs.map((d) => [drugLabel(d).toLowerCase(), d.id]));
      const [rx] = await t.insert(prescriptions).values({ tenantId: ctx.tenant.id, visitId, patientId: v.patientId, prescriberId: ctx.user.id, notes: f.notes ?? null }).returning({ id: prescriptions.id });
      await t.insert(prescriptionItems).values(lines.map((l) => ({
        ...l, tenantId: ctx.tenant.id, prescriptionId: rx.id, itemId: byLabel.get(l.drugName.toLowerCase()) ?? null,
        dose: l.dose ?? null, route: l.route ?? null, frequency: l.frequency ?? null, duration: l.duration ?? null, instructions: l.instructions ?? null,
      })));
      await audit(t, ctx, "create", "prescription", rx.id, { patientId: v.patientId, details: { lines: lines.length } });
      return rx.id;
    });
    revalidatePath(`/visits/${visitId}`);
    return { ok: true, id };
  });
}

// ---------- Referrals ----------

export async function addReferralAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({
      visitId: zId, toName: z.string().optional(), toFacility: z.string().min(1, "Facility is required"), specialty: z.string().optional(),
      reason: z.string().min(1, "Reason is required"), letter: z.string().optional(), urgency: z.enum(["routine", "urgent", "emergency"]).default("routine"),
    }).parse(formObject(fd));
    const id = await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId);
      const [r] = await t.insert(referrals).values({
        tenantId: ctx.tenant.id, visitId: v.id, patientId: v.patientId, toName: o.toName ?? null, toFacility: o.toFacility,
        specialty: o.specialty ?? null, reason: o.reason, letter: o.letter ?? null, urgency: o.urgency, createdBy: ctx.user.id,
      }).returning({ id: referrals.id });
      await audit(t, ctx, "create", "referral", r.id, { patientId: v.patientId });
      return r.id;
    });
    revalidatePath(`/visits/${o.visitId}`);
    return { ok: true, id };
  });
}

// ---------- Lab / imaging orders ----------

export async function orderLabsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.order");
    const o = z.object({ visitId: zId, notes: z.string().optional(), externalLab: z.string().optional() }).parse(formObject(fd));
    const testIds = z.array(zId).min(1, "Choose at least one test").parse(fd.getAll("testId"));
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId, { open: true });
      const tests = await t.select().from(labTests).where(and(inArray(labTests.id, testIds), eq(labTests.active, true)));
      if (!tests.length) throw new UserError("Choose at least one test");
      const [order] = await t.insert(labOrders).values({
        tenantId: ctx.tenant.id, branchId: v.branchId, visitId: v.id, patientId: v.patientId, orderedBy: ctx.user.id,
        notes: o.notes ?? null, externalLab: o.externalLab ?? null,
      }).returning({ id: labOrders.id });
      await t.insert(labOrderItems).values(tests.map((x) => ({ tenantId: ctx.tenant.id, orderId: order.id, testId: x.id, name: x.name, unit: x.unit, refRange: x.refRange })));
      for (const x of tests) if (x.serviceId) await bill(t, ctx, v, { serviceId: x.serviceId });
      await audit(t, ctx, "create", "lab_order", order.id, { patientId: v.patientId, details: { tests: tests.map((x) => x.name) } });
    });
    revalidatePath(`/visits/${o.visitId}`);
  });
}

// ---------- Charges ----------

export async function addChargeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ visitId: zId, serviceId: zId, quantity: z.coerce.number().int().min(1).max(100).default(1) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId);
      const inv = await bill(t, ctx, v, { serviceId: o.serviceId, quantity: o.quantity });
      await audit(t, ctx, "charge", "invoice", inv.id, { patientId: v.patientId, details: { serviceId: o.serviceId, quantity: o.quantity } });
    });
    revalidatePath(`/visits/${o.visitId}`);
  });
}

/** Adds the consultation fee on sign when nothing in the consultation category has been billed for this visit yet. */
async function ensureConsultationCharge(t: Tx, ctx: Ctx, v: typeof visits.$inferSelect) {
  const [billed] = await t.select({ id: invoiceLines.id }).from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId)).innerJoin(services, eq(services.id, invoiceLines.serviceId))
    .where(and(eq(invoices.visitId, v.id), ne(invoices.status, "void"), eq(services.category, "consultation"))).limit(1);
  if (billed) return;
  let serviceId: string | null = null;
  if (v.appointmentId) {
    const [a] = await t.select({ s: services.id }).from(appointments).innerJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(appointments.id, v.appointmentId), eq(services.category, "consultation"), eq(services.active, true)));
    serviceId = a?.s ?? null;
  }
  if (!serviceId) {
    const [s] = await t.select({ id: services.id }).from(services)
      .where(and(eq(services.category, "consultation"), eq(services.active, true))).orderBy(asc(services.createdAt)).limit(1);
    serviceId = s?.id ?? null;
  }
  if (serviceId) await bill(t, ctx, v, { serviceId });
}

// ---------- Sign / addendum ----------

export async function signVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.sign");
    const o = z.object({ visitId: zId, followUpDate: zDay.optional() }).parse(formObject(fd));
    const tz = ctx.tenant.timezone;
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId, { open: true });
      if (!v.complaint && !v.assessment && !v.plan) throw new UserError("Write the note (at least complaint, assessment or plan) before signing.");
      const now = new Date();
      await t.update(visits).set({ status: "signed", signedAt: now, signedBy: ctx.user.id, followUpDate: o.followUpDate ?? v.followUpDate, updatedAt: now }).where(eq(visits.id, v.id));
      await ensureConsultationCharge(t, ctx, v);
      await t.update(queueTickets).set({ status: "billing" })
        .where(and(eq(queueTickets.visitId, v.id), inArray(queueTickets.status, ["waiting", "with_doctor", "lab"])));
      const followUp = o.followUpDate ?? v.followUpDate;
      if (followUp) {
        const runAt = zonedToUtc(addDays(followUp, -1), "09:00", tz);
        await queuePatientMessage(t, {
          tenantId: ctx.tenant.id, patientId: v.patientId, templateKey: "follow_up", purpose: "follow_up",
          vars: { date: dateOnly(followUp, "UTC") }, runAt: runAt < now ? now : runAt, dedupeKey: `follow_up:${v.id}`,
        });
      }
      await audit(t, ctx, "sign", "visit", v.id, { patientId: v.patientId, details: { followUpDate: followUp ?? null } });
      await emit(t, ctx.tenant.id, "visit.signed", { id: v.id, patientId: v.patientId, practitionerId: v.practitionerId, signedAt: now.toISOString() });
    });
    revalidatePath(`/visits/${o.visitId}`);
    revalidatePath("/visits");
  });
}

export async function addAddendumAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ visitId: zId, text: z.string().min(1, "Write the addendum").max(5000) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const v = await getVisit(t, o.visitId);
      if (v.status !== "signed") throw new UserError("The note isn't signed yet; edit it directly.");
      await t.insert(visitRevisions).values({
        tenantId: ctx.tenant.id, visitId: v.id, version: v.version, editedBy: ctx.user.id,
        snapshot: JSON.stringify({ ...Object.fromEntries(NOTE_FIELDS.map((k) => [k, v[k]])), extra: v.extra }),
      });
      const stamp = `--- Addendum ${dateTime(new Date(), ctx.tenant.timezone)} · ${ctx.user.title ? ctx.user.title + " " : ""}${ctx.user.name} ---`;
      await t.update(visits).set({ plan: [v.plan, stamp, o.text].filter(Boolean).join("\n"), version: v.version + 1, updatedAt: new Date() }).where(eq(visits.id, v.id));
      await audit(t, ctx, "addendum", "visit", v.id, { patientId: v.patientId });
    });
    revalidatePath(`/visits/${o.visitId}`);
  });
}

// ---------- Scribe ----------

export async function acceptScribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("scribe.use");
    const sessionId = zId.parse(fd.get("sessionId"));
    await tx(ctx, async (t) => {
      const [s] = await t.update(scribeSessions).set({ status: "accepted", acceptedAt: new Date() })
        .where(and(eq(scribeSessions.id, sessionId), eq(scribeSessions.practitionerId, ctx.user.id))).returning();
      if (!s) throw new UserError("Scribe draft not found");
      const [v] = await t.select({ patientId: visits.patientId }).from(visits).where(eq(visits.id, s.visitId));
      await audit(t, ctx, "accept", "scribe_session", s.id, { patientId: v?.patientId });
    });
  });
}
