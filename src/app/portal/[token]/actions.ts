"use server";
import { and, eq, gt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenant } from "@/db";
import { appointments, invoices, services, vitals } from "@/db/schema";
import { formObject, run, UserError, type ActionState } from "@/lib/action";
import { emit } from "@/lib/events";
import { dateOnly, localDay, timeOnly } from "@/lib/format";
import { queuePatientMessage } from "@/lib/messaging";
import { initializePayment } from "@/lib/paystack";
import { scheduleAppointmentReminders } from "@/lib/reminders";
import { availableSlots, mainBranchId, portalAudit, resolvePortal } from "../session";

async function session(fd: FormData) {
  const s = await resolvePortal(String(fd.get("token") ?? ""));
  if (!s) throw new UserError("This link has expired. Reply PORTAL on WhatsApp or SMS to get a new one.");
  return s;
}
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export async function confirmApptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const s = await session(fd);
    const id = z.string().uuid().parse(fd.get("id"));
    await withTenant(s.tenant.id, async (t) => {
      const [a] = await t.update(appointments).set({ status: "confirmed" })
        .where(and(eq(appointments.id, id), eq(appointments.tenantId, s.tenant.id), eq(appointments.patientId, s.patient.id), eq(appointments.status, "scheduled"))).returning();
      if (!a) throw new UserError("Appointment not found");
      await portalAudit(t, s, "portal_confirm", "appointment", id);
      await emit(t, s.tenant.id, "appointment.updated", { id, status: "confirmed" });
    });
    revalidatePath(`/portal/${fd.get("token")}`);
  });
}

export async function cancelApptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const s = await session(fd);
    const id = z.string().uuid().parse(fd.get("id"));
    await withTenant(s.tenant.id, async (t) => {
      const [a] = await t.update(appointments).set({ status: "cancelled" })
        .where(and(eq(appointments.id, id), eq(appointments.tenantId, s.tenant.id), eq(appointments.patientId, s.patient.id),
          inArray(appointments.status, ["scheduled", "confirmed"]), gt(appointments.startsAt, new Date()))).returning();
      if (!a) throw new UserError("Appointment not found");
      await portalAudit(t, s, "portal_cancel", "appointment", id);
      await emit(t, s.tenant.id, "appointment.updated", { id, status: "cancelled" });
    });
    revalidatePath(`/portal/${fd.get("token")}`);
  });
}

/** Books a new appointment (serviceId) or moves an existing one (apptId) into a slot the patient picked. */
export async function bookSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const s = await session(fd);
    const o = z.object({
      startsAt: z.string().datetime(), practitionerId: z.string().uuid(),
      apptId: z.string().uuid().optional(), serviceId: z.string().uuid().optional(),
    }).parse(formObject(fd));
    const tz = s.tenant.timezone;
    const startsAt = new Date(o.startsAt);
    await withTenant(s.tenant.id, async (t) => {
      const tenantId = s.tenant.id;
      const [existing] = o.apptId ? await t.select().from(appointments)
        .where(and(eq(appointments.id, o.apptId), eq(appointments.tenantId, tenantId), eq(appointments.patientId, s.patient.id), inArray(appointments.status, ["scheduled", "confirmed"]))) : [];
      if (o.apptId && !existing) throw new UserError("Appointment not found");
      const [svc] = !existing && o.serviceId ? await t.select().from(services).where(and(eq(services.id, o.serviceId), eq(services.tenantId, tenantId), eq(services.active, true))) : [];
      if (!existing && !svc) throw new UserError("Choose a service");
      const durationMin = existing ? Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000) : svc!.durationMin;
      // Re-check the slot is still free for that practitioner (someone may have taken it).
      const free = await availableSlots(t, { tenantId, tz, day: localDay(tz, startsAt), durationMin, practitionerId: o.practitionerId, exceptApptId: existing?.id });
      if (!free.some((f) => f.startsAt.getTime() === startsAt.getTime())) throw new UserError("Sorry, that time was just taken. Please pick another.");
      const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
      let apptId: string;
      if (existing) {
        await t.update(appointments).set({ startsAt, endsAt, practitionerId: o.practitionerId, status: "scheduled" }).where(eq(appointments.id, existing.id));
        apptId = existing.id;
        await portalAudit(t, s, "portal_reschedule", "appointment", apptId);
        await emit(t, tenantId, "appointment.updated", { id: apptId, startsAt: startsAt.toISOString() });
      } else {
        const branchId = await mainBranchId(t, tenantId);
        if (!branchId) throw new UserError("Online booking isn't available for this clinic.");
        const [a] = await t.insert(appointments).values({
          tenantId, branchId, patientId: s.patient.id, practitionerId: o.practitionerId, serviceId: svc!.id, startsAt, endsAt, status: "scheduled", source: "portal", reason: svc!.name,
        }).returning({ id: appointments.id });
        apptId = a.id;
        await portalAudit(t, s, "portal_book", "appointment", apptId);
        await emit(t, tenantId, "appointment.created", { id: apptId, startsAt: startsAt.toISOString(), source: "portal" });
      }
      await scheduleAppointmentReminders(t, s.tenant, { id: apptId, startsAt });
      await queuePatientMessage(t, { tenantId, patientId: s.patient.id, templateKey: "appointment_booked", purpose: "reminder", vars: { date: dateOnly(startsAt, tz), time: timeOnly(startsAt, tz), with: "" } });
    });
    revalidatePath(`/portal/${fd.get("token")}`);
    return { ok: true };
  });
}

export async function payInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let url: string | null = null;
  const res = await run(async () => {
    const s = await session(fd);
    const id = z.string().uuid().parse(fd.get("id"));
    const inv = await withTenant(s.tenant.id, async (t) => {
      const [i] = await t.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, s.tenant.id), eq(invoices.patientId, s.patient.id), inArray(invoices.status, ["issued", "partially_paid"])));
      if (i) await portalAudit(t, s, "portal_pay", "invoice", id);
      return i;
    });
    const balance = inv ? inv.patientPortionMinor - inv.paidMinor : 0;
    if (!inv || balance <= 0) throw new UserError("Nothing to pay on this invoice");
    const pay = await initializePayment({
      tenantId: s.tenant.id, email: s.patient.email ?? s.tenant.email ?? "payments@clinicflow.app", amountMinor: balance, currency: s.tenant.currency,
      metadata: { kind: "patient_payment", tenantId: s.tenant.id, invoiceId: inv.id, patientId: s.patient.id },
      callbackUrl: `${appUrl()}/portal/${fd.get("token")}`,
    });
    if (!pay) throw new UserError("Online payment isn't set up for this clinic yet. Please pay at the clinic.");
    url = pay.url;
  });
  if (url) redirect(url);
  return res;
}

export async function logReadingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const s = await session(fd);
    const o = z.object({
      bpSys: z.coerce.number().int().min(60).max(300).optional(), bpDia: z.coerce.number().int().min(30).max(200).optional(),
      glucose: z.coerce.number().min(1).max(40).optional(),
    }).parse(formObject(fd));
    if (!o.glucose && !(o.bpSys && o.bpDia)) throw new UserError("Enter both blood pressure numbers, or a sugar reading");
    await withTenant(s.tenant.id, async (t) => {
      await t.insert(vitals).values({ tenantId: s.tenant.id, patientId: s.patient.id, source: "patient", bpSys: o.bpSys ?? null, bpDia: o.bpDia ?? null, glucose: o.glucose ?? null });
      await portalAudit(t, s, "portal_reading", "vitals", null);
    });
    revalidatePath(`/portal/${fd.get("token")}`);
    return { ok: true, message: "Thank you, your reading has been saved. Your clinic will review it." };
  });
}
