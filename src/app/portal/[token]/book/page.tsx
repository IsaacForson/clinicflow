import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, Select } from "@/components/ui";
import { withTenant } from "@/db";
import { appointments, services } from "@/db/schema";
import { addDays, dateOnly, localDay, timeOnly } from "@/lib/format";
import { ClinicHeader, Expired } from "../../header";
import { availableSlots, resolvePortal } from "../../session";
import { bookSlotAction } from "../actions";

/** Pick a day, then a free 15-minute slot. `?appt=` reschedules that appointment; otherwise books a new one for `?service=`. */
export default async function BookPage({ params, searchParams }: PageProps<"/portal/[token]/book">) {
  const { token } = await params;
  const sp = await searchParams;
  const s = await resolvePortal(token);
  if (!s) return <Expired />;
  const tz = s.tenant.timezone;
  const today = localDay(tz);
  const dayParam = String(sp.day ?? "");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam >= today && dayParam <= addDays(today, 90) ? dayParam : today;
  const apptId = typeof sp.appt === "string" ? sp.appt : undefined;
  const serviceId = typeof sp.service === "string" ? sp.service : undefined;
  const uuid = /^[0-9a-f-]{36}$/i;

  const d = await withTenant(s.tenant.id, async (t) => {
    const svcs = await t.select().from(services).where(and(eq(services.tenantId, s.tenant.id), eq(services.active, true), inArray(services.category, ["consultation", "procedure"]))).orderBy(services.name);
    const [appt] = apptId && uuid.test(apptId) ? await t.select().from(appointments)
      .where(and(eq(appointments.id, apptId), eq(appointments.tenantId, s.tenant.id), eq(appointments.patientId, s.patient.id), inArray(appointments.status, ["scheduled", "confirmed"]))) : [];
    const svc = !appt && serviceId ? svcs.find((x) => x.id === serviceId) : undefined;
    const durationMin = appt ? Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60_000) : svc?.durationMin;
    const slots = durationMin
      ? await availableSlots(t, { tenantId: s.tenant.id, tz, day, durationMin, practitionerId: appt?.practitionerId, exceptApptId: appt?.id })
      : [];
    return { svcs, appt, svc, slots };
  });

  const base = `/portal/${token}`;
  const choosing = d.appt || d.svc;
  return (
    <div className="space-y-4">
      <ClinicHeader tenant={s.tenant} patientName={s.patient.firstName} />
      <Card title={d.appt ? `Reschedule your ${dateOnly(d.appt.startsAt, tz)} appointment` : "Book an appointment"}>
        <form className="space-y-3">
          {d.appt ? <input type="hidden" name="appt" value={d.appt.id} /> : (
            <Field label="What is it for?">
              <Select name="service" defaultValue={d.svc?.id ?? ""} required>
                <option value="" disabled>Choose…</option>
                {d.svcs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Preferred day"><Input type="date" name="day" defaultValue={day} min={today} max={addDays(today, 90)} required /></Field>
          <button className="w-full rounded-md bg-slate-800 py-3 text-sm font-medium text-white">Show free times</button>
        </form>
      </Card>

      {choosing && (
        <Card title={`Free times on ${dateOnly(`${day}T12:00:00Z`, tz)}`}>
          {d.slots.length === 0 && <p className="text-sm text-slate-500">No free times that day. Please try another day.</p>}
          <div className="grid grid-cols-3 gap-2">
            {d.slots.map((slot) => (
              <ActionForm key={slot.startsAt.getTime()} action={bookSlotAction} onSuccessHref={base} className="space-y-1">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="startsAt" value={slot.startsAt.toISOString()} />
                <input type="hidden" name="practitionerId" value={slot.practitionerId} />
                {d.appt ? <input type="hidden" name="apptId" value={d.appt.id} /> : <input type="hidden" name="serviceId" value={d.svc!.id} />}
                <Submit variant="secondary" className="w-full py-3">{timeOnly(slot.startsAt, tz)}</Submit>
              </ActionForm>
            ))}
          </div>
        </Card>
      )}
      <p className="text-center text-sm"><Link href={base} className="text-teal-800 underline">Back to my portal</Link></p>
    </div>
  );
}
