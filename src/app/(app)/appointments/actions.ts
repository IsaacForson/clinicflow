"use server";
import { and, eq, gt, lt, ne, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Tx } from "@/db";
import { allergies, appointments, consents, intakeForms, invoices, patients, services, users } from "@/db/schema";
import { formObject, run, UserError, zBool, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx, type Ctx } from "@/lib/auth";
import { addLine, createInvoice, issueInvoice } from "@/lib/billing";
import { randomToken, sha256 } from "@/lib/crypto";
import { emit } from "@/lib/events";
import { dateOnly, e164, fullName, localDay, money, timeOnly, zonedToUtc } from "@/lib/format";
import { queuePatientMessage } from "@/lib/messaging";
import { initializePayment } from "@/lib/paystack";
import { can } from "@/lib/permissions";
import { scheduleAppointmentReminders } from "@/lib/reminders";
import { intakeSchema, parseAllergies } from "@/app/intake/schema";
import { createTicket } from "../queue/tickets";
import { canReschedule, canTransition, practitionerName, type ApptStatus } from "./lib";

type Appt = typeof appointments.$inferSelect;
const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";
const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");

const refresh = (id?: string) => { revalidatePath("/appointments"); if (id) revalidatePath(`/appointments/${id}`); };

async function getPractitioner(t: Tx, id: string) {
  const [u] = await t.select({ id: users.id, name: users.name, title: users.title }).from(users)
    .where(and(eq(users.id, id), eq(users.isPractitioner, true), eq(users.active, true)));
  if (!u) throw new UserError("Choose a practitioner");
  return u;
}

/** Throws when the practitioner has a non-cancelled appointment overlapping [start, end). Serialised per practitioner. */
async function assertFree(t: Tx, ctx: Ctx, practitioner: { id: string; name: string; title: string | null }, start: Date, end: Date, exceptId?: string) {
  await t.execute(sql`select pg_advisory_xact_lock(hashtext(${"appt:" + practitioner.id}))`);
  const [c] = await t.select({ startsAt: appointments.startsAt, firstName: patients.firstName, lastName: patients.lastName })
    .from(appointments).innerJoin(patients, eq(patients.id, appointments.patientId)).where(and(
      eq(appointments.practitionerId, practitioner.id), notInArray(appointments.status, ["cancelled", "no_show"]),
      lt(appointments.startsAt, end), gt(appointments.endsAt, start), exceptId ? ne(appointments.id, exceptId) : undefined,
    )).limit(1);
  if (c) throw new UserError(`${practitionerName(practitioner)} already has ${c.firstName} ${c.lastName} at ${timeOnly(c.startsAt, ctx.tenant.timezone)}. Pick another time or tick "Book anyway".`);
}

async function notifyBooked(t: Tx, ctx: Ctx, appt: Appt, practitioner: { name: string; title: string | null } | null) {
  const tz = ctx.tenant.timezone;
  await scheduleAppointmentReminders(t, ctx.tenant, appt);
  await queuePatientMessage(t, {
    tenantId: ctx.tenant.id, patientId: appt.patientId, templateKey: "appointment_booked", purpose: "reminder",
    vars: { date: dateOnly(appt.startsAt, tz), time: timeOnly(appt.startsAt, tz), with: practitioner ? ` with ${practitionerName(practitioner)}` : "" },
  });
}

const createSchema = z.object({
  patientId: z.string().uuid("Choose a patient"),
  practitionerId: z.string().uuid("Choose a practitioner"),
  serviceId: z.string().uuid().optional(),
  date: zDay, time: zTime,
  reason: z.string().max(500).optional(),
  telehealth: zBool, prepay: zBool, force: zBool,
});

export async function createAppointmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("appointments.manage");
    const o = createSchema.parse(formObject(fd));
    if (o.prepay && !o.serviceId) throw new UserError("Choose a service so we know what to charge before the consult");
    if (o.prepay && !can(ctx.user.role, "billing.write")) throw new UserError("You don't have permission to create invoices");
    const id = await tx(ctx, async (t) => {
      const [p] = await t.select({ id: patients.id }).from(patients).where(eq(patients.id, o.patientId));
      if (!p) throw new UserError("Patient not found");
      const doc = await getPractitioner(t, o.practitionerId);
      const [svc] = o.serviceId ? await t.select().from(services).where(and(eq(services.id, o.serviceId), eq(services.active, true))) : [];
      if (o.serviceId && !svc) throw new UserError("Service not found");
      const startsAt = zonedToUtc(o.date, o.time, ctx.tenant.timezone);
      const endsAt = new Date(startsAt.getTime() + (svc?.durationMin ?? 15) * 60_000);
      if (!o.force) await assertFree(t, ctx, doc, startsAt, endsAt);
      let prepaidInvoiceId: string | null = null;
      if (o.prepay && svc) {
        const inv = await createInvoice(t, ctx, { patientId: p.id });
        await addLine(t, inv.id, { serviceId: svc.id });
        await issueInvoice(t, ctx, inv.id);
        prepaidInvoiceId = inv.id;
      }
      const [appt] = await t.insert(appointments).values({
        tenantId: ctx.tenant.id, branchId: ctx.branchId, patientId: p.id, practitionerId: doc.id, serviceId: svc?.id ?? null,
        startsAt, endsAt, reason: o.reason ?? null, telehealth: o.telehealth,
        telehealthUrl: o.telehealth ? `https://meet.jit.si/clinicflow-${randomToken(10)}` : null,
        prepaidInvoiceId, createdBy: ctx.user.id,
      }).returning();
      await notifyBooked(t, ctx, appt, doc);
      await audit(t, ctx, "create", "appointment", appt.id, { patientId: p.id });
      await emit(t, ctx.tenant.id, "appointment.created", { id: appt.id, patientId: p.id, practitionerId: doc.id, startsAt: startsAt.toISOString(), status: appt.status });
      return appt.id;
    });
    refresh();
    return { ok: true, id };
  });
}

export async function rescheduleAppointmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("appointments.manage");
    const o = z.object({ id: z.string().uuid(), practitionerId: z.string().uuid("Choose a practitioner"), date: zDay, time: zTime, force: zBool }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [a] = await t.select().from(appointments).where(eq(appointments.id, o.id)).for("update");
      if (!a) throw new UserError("Appointment not found");
      if (!canReschedule(a.status)) throw new UserError("Only scheduled or confirmed appointments can be rescheduled. Book a new one instead.");
      const doc = await getPractitioner(t, o.practitionerId);
      const startsAt = zonedToUtc(o.date, o.time, ctx.tenant.timezone);
      const endsAt = new Date(startsAt.getTime() + (a.endsAt.getTime() - a.startsAt.getTime()));
      if (!o.force) await assertFree(t, ctx, doc, startsAt, endsAt, a.id);
      const [appt] = await t.update(appointments).set({ startsAt, endsAt, practitionerId: doc.id, status: "scheduled" }).where(eq(appointments.id, a.id)).returning();
      await notifyBooked(t, ctx, appt, doc);
      await audit(t, ctx, "update", "appointment", a.id, { patientId: a.patientId, details: { rescheduledFrom: a.startsAt.toISOString(), to: startsAt.toISOString() } });
      await emit(t, ctx.tenant.id, "appointment.updated", { id: a.id, patientId: a.patientId, practitionerId: doc.id, startsAt: startsAt.toISOString(), status: appt.status });
    });
    refresh(o.id);
    return { ok: true, message: "Rescheduled. The patient has been notified." };
  });
}

export async function setAppointmentStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("appointments.manage");
    const o = z.object({ id: z.string().uuid(), status: z.enum(["scheduled", "confirmed", "arrived", "completed", "cancelled", "no_show"]) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [a] = await t.select().from(appointments).where(eq(appointments.id, o.id)).for("update");
      if (!a) throw new UserError("Appointment not found");
      if (!canTransition(a.status, o.status as ApptStatus)) throw new UserError(`Can't change a ${a.status.replace("_", "-")} appointment to ${o.status.replace("_", "-")}`);
      await t.update(appointments).set({ status: o.status }).where(eq(appointments.id, a.id));
      if (o.status === "arrived") {
        try {
          await createTicket(t, ctx, { patientId: a.patientId, appointmentId: a.id, practitionerId: a.practitionerId });
        } catch (e) {
          if (!(e instanceof UserError)) throw e; // already in today's queue: keep their existing ticket
        }
        revalidatePath("/queue");
      }
      await audit(t, ctx, "update", "appointment", a.id, { patientId: a.patientId, details: { status: o.status } });
      await emit(t, ctx.tenant.id, "appointment.updated", { id: a.id, patientId: a.patientId, practitionerId: a.practitionerId, startsAt: a.startsAt.toISOString(), status: o.status });
    });
    refresh(o.id);
  });
}

async function loadForSend(t: Tx, id: string) {
  const [row] = await t.select({ a: appointments, p: patients }).from(appointments).innerJoin(patients, eq(patients.id, appointments.patientId)).where(eq(appointments.id, id));
  if (!row) throw new UserError("Appointment not found");
  const [inv] = row.a.prepaidInvoiceId ? await t.select().from(invoices).where(eq(invoices.id, row.a.prepaidInvoiceId)) : [];
  return { ...row, inv };
}

export async function sendPaymentLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("payments.receive");
    const id = z.string().uuid().parse(fd.get("id"));
    const { p, inv } = await tx(ctx, (t) => loadForSend(t, id));
    if (!inv) throw new UserError("This appointment has no prepaid invoice");
    const due = inv.patientPortionMinor - inv.paidMinor;
    if (inv.status === "paid" || due <= 0) throw new UserError("Already paid");
    // shortcut: Paystack requires an email; patients without one get a per-patient placeholder. Upgrade if Paystack starts rejecting it.
    const pay = await initializePayment({
      tenantId: ctx.tenant.id, email: p.email ?? `${p.patientNo.toLowerCase()}.${ctx.tenant.slug}@patients.clinicflow.app`,
      amountMinor: due, currency: ctx.tenant.currency,
      metadata: { kind: "patient_payment", tenantId: ctx.tenant.id, invoiceId: inv.id, patientId: p.id },
    });
    if (!pay) throw new UserError("Online payments aren't set up. Add Paystack in Settings → Integrations.");
    const sent = await tx(ctx, async (t) => {
      const msg = await queuePatientMessage(t, { tenantId: ctx.tenant.id, patientId: p.id, templateKey: "payment_link", purpose: "billing", vars: { amount: money(due, ctx.tenant.currency), link: pay.url } });
      await audit(t, ctx, "send", "payment_link", inv.id, { patientId: p.id, details: { reference: pay.reference } });
      return msg;
    });
    return { ok: true, message: sent ? `Payment link sent to ${fullName(p)}.` : `No contact on file — share this link: ${pay.url}` };
  });
}

export async function sendJoinLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("appointments.manage");
    const o = z.object({ id: z.string().uuid(), override: zBool }).parse(formObject(fd));
    const sent = await tx(ctx, async (t) => {
      const { a, p, inv } = await loadForSend(t, o.id);
      if (!a.telehealthUrl) throw new UserError("This is not a video appointment");
      if (inv && inv.status !== "paid" && !(o.override && ctx.user.role === "owner")) throw new UserError("Payment is required before the join link can be sent");
      const tz = ctx.tenant.timezone;
      const msg = await queuePatientMessage(t, {
        tenantId: ctx.tenant.id, patientId: p.id, templateKey: "telehealth", purpose: "reminder",
        vars: { date: dateOnly(a.startsAt, tz), time: timeOnly(a.startsAt, tz), link: a.telehealthUrl },
      });
      await audit(t, ctx, "send", "telehealth_link", a.id, { patientId: p.id, details: { override: !!(inv && inv.status !== "paid") } });
      return msg;
    });
    return { ok: true, message: sent ? "Join link sent." : "Not sent (no contact on file or messaging opt-out). Share the link shown above." };
  });
}

export async function sendIntakeFormAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("appointments.manage");
    const id = z.string().uuid().parse(fd.get("id"));
    const token = randomToken(24);
    const link = `${APP_URL()}/intake/${token}`;
    const sent = await tx(ctx, async (t) => {
      const { a, p } = await loadForSend(t, id);
      const [f] = await t.insert(intakeForms).values({
        tenantId: ctx.tenant.id, tokenHash: sha256(token), patientId: p.id, appointmentId: a.id, expiresAt: new Date(Date.now() + 7 * 86400_000),
      }).returning({ id: intakeForms.id });
      const msg = await queuePatientMessage(t, { tenantId: ctx.tenant.id, patientId: p.id, templateKey: "intake", purpose: "reminder", vars: { link } });
      await audit(t, ctx, "send", "intake_form", f.id, { patientId: p.id });
      return msg;
    });
    refresh(id);
    return { ok: true, message: sent ? "Intake form sent (link valid 7 days)." : `Not sent automatically — share this link with the patient: ${link}` };
  });
}

/** Copies reviewed intake answers onto the patient record: demographics, allergies, notes, signed consents. */
export async function applyIntakeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("patients.write");
    const id = z.string().uuid().parse(fd.get("id"));
    const patientId = await tx(ctx, async (t) => {
      const [f] = await t.select().from(intakeForms).where(eq(intakeForms.id, id)).for("update");
      if (!f || !f.patientId) throw new UserError("Intake form not found");
      if (f.status !== "submitted" || !f.data) throw new UserError(f.status === "reviewed" ? "Already applied" : "The patient hasn't submitted this form yet");
      const d = intakeSchema.parse(JSON.parse(f.data));
      const [p] = await t.select().from(patients).where(eq(patients.id, f.patientId));
      if (!p) throw new UserError("Patient not found");
      const country = ctx.tenant.country;
      const extra = [d.medications && `Current medications: ${d.medications}`, d.history && `Medical history: ${d.history}`].filter(Boolean).join("\n");
      await t.update(patients).set({
        firstName: d.firstName, lastName: d.lastName, otherNames: d.otherNames ?? p.otherNames,
        sex: d.sex !== "unknown" ? d.sex : p.sex, dob: d.dob ?? p.dob, phone: e164(d.phone, country) ?? p.phone, email: d.email ?? p.email,
        address: d.address ?? p.address, occupation: d.occupation ?? p.occupation,
        emergencyName: d.emergencyName ?? p.emergencyName, emergencyPhone: e164(d.emergencyPhone, country) ?? p.emergencyPhone,
        notes: extra ? [p.notes, `Intake form ${localDay(ctx.tenant.timezone)}:\n${extra}`].filter(Boolean).join("\n\n") : p.notes,
        updatedAt: new Date(),
      }).where(eq(patients.id, p.id));
      const existing = new Set((await t.select({ s: allergies.substance }).from(allergies).where(eq(allergies.patientId, p.id))).map((r) => r.s.toLowerCase()));
      for (const al of parseAllergies(d.allergies).filter((x) => !existing.has(x.substance.toLowerCase()))) {
        await t.insert(allergies).values({ tenantId: ctx.tenant.id, patientId: p.id, substance: al.substance, reaction: al.reaction });
      }
      for (const [type, granted] of [["messaging", d.consentMessaging], ["data_processing", d.consentDataProcessing], ["treatment", d.consentTreatment]] as const) {
        await t.insert(consents).values({ tenantId: ctx.tenant.id, patientId: p.id, type, granted, method: "signature", signature: f.signature, recordedBy: ctx.user.id });
      }
      await t.update(intakeForms).set({ status: "reviewed" }).where(eq(intakeForms.id, f.id));
      await audit(t, ctx, "update", "patient", p.id, { patientId: p.id, details: { source: "intake_form", intakeFormId: f.id } });
      await emit(t, ctx.tenant.id, "patient.updated", { id: p.id });
      return p.id;
    });
    revalidatePath(`/appointments/intake/${id}`);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true, message: "Applied to the patient record." };
  });
}
