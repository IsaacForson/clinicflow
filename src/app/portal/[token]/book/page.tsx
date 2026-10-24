import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { ArrowLeft, CalendarDays, CalendarX, Clock, Stethoscope } from "lucide-react";
import { cx, EmptyState, Input, Panel } from "@/components/ui";
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
  const keep = d.appt ? `appt=${d.appt.id}` : d.svc ? `service=${d.svc.id}` : "";
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const hourOf = (dt: Date) => Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(dt));
  const parts = [["Morning", 0, 12], ["Afternoon", 12, 17], ["Evening", 17, 24]] as const;
  const chip = "inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-medium transition";
  return (
    <div className="space-y-5">
      <ClinicHeader tenant={s.tenant} patientName={s.patient.firstName} compact />
      <div className="animate-rise">
        <Link href={base} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />Back to my portal</Link>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">{d.appt ? <>Reschedule your <span className="text-aurora">{dateOnly(d.appt.startsAt, tz)}</span> visit</> : "Book an appointment"}</h1>
      </div>

      {!d.appt && (
        <Panel title="What is it for?" icon={<Stethoscope />} eyebrow="Step 1">
          {d.svcs.length === 0 ? <EmptyState compact icon={<Stethoscope />} title="Online booking isn't set up yet">Please call the clinic to book.</EmptyState> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {d.svcs.map((x) => (
                <Link key={x.id} href={`?service=${x.id}&day=${day}`} aria-current={d.svc?.id === x.id ? "true" : undefined}
                  className={cx(chip, "justify-between gap-2 py-2 text-left", d.svc?.id === x.id ? "border-accent/50 bg-accent/15 text-fg shadow-glow" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg")}>
                  <span className="min-w-0 truncate">{x.name}</span>
                  {x.durationMin ? <span className="shrink-0 text-xs text-subtle tabular-nums">{x.durationMin} min</span> : null}
                </Link>
              ))}
            </div>
          )}
        </Panel>
      )}

      {choosing && (
        <Panel title="Pick a day" icon={<CalendarDays />} eyebrow={d.appt ? "Step 1" : "Step 2"}>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {days.map((x) => {
              const dt = new Date(`${x}T12:00:00Z`);
              const on = x === day;
              return (
                <Link key={x} href={`?${keep}&day=${x}`} aria-current={on ? "date" : undefined}
                  className={cx("flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2.5 transition", on ? "border-transparent bg-aurora text-on-accent shadow-glow" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg")}>
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(dt)}</span>
                  <span className="text-lg font-semibold tabular-nums">{x.slice(8)}</span>
                </Link>
              );
            })}
          </div>
          <form className="mt-4 flex items-center gap-2">
            {d.appt ? <input type="hidden" name="appt" value={d.appt.id} /> : <input type="hidden" name="service" value={d.svc!.id} />}
            <Input type="date" name="day" defaultValue={day} min={today} max={addDays(today, 90)} required aria-label="Another day" className="h-11" />
            <button className="h-11 shrink-0 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-fg transition hover:bg-surface-3">Go</button>
          </form>
        </Panel>
      )}

      {choosing && (
        <Panel title={`Free times on ${dateOnly(`${day}T12:00:00Z`, tz)}`} icon={<Clock />} eyebrow="Tap a time to book" glow={d.slots.length > 0}>
          {d.slots.length === 0 ? <EmptyState compact icon={<CalendarX />} title="No free times that day">Please try another day.</EmptyState> : (
            <div className="space-y-4">
              {parts.map(([label, from, to]) => {
                const list = d.slots.filter((x) => { const h = hourOf(x.startsAt); return h >= from && h < to; });
                if (!list.length) return null;
                return (
                  <div key={label}>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {list.map((slot) => (
                        <ActionForm key={slot.startsAt.getTime()} action={bookSlotAction} onSuccessHref={base} className="space-y-1">
                          <input type="hidden" name="token" value={token} />
                          <input type="hidden" name="startsAt" value={slot.startsAt.toISOString()} />
                          <input type="hidden" name="practitionerId" value={slot.practitionerId} />
                          {d.appt ? <input type="hidden" name="apptId" value={d.appt.id} /> : <input type="hidden" name="serviceId" value={d.svc!.id} />}
                          <Submit variant="secondary" className="h-11 w-full rounded-xl tabular-nums hover:border-accent/50 hover:text-accent">{timeOnly(slot.startsAt, tz)}</Submit>
                        </ActionForm>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
