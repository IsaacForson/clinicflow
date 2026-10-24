import { and, asc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";
import { ActionButton } from "@/components/form";
import { Badge, Card, Input, LinkButton, PageHeader, Select, Table, Tabs, Td, cx } from "@/components/ui";
import { appointments, branches, intakeForms, patients, services, type OpeningHours } from "@/db/schema";
import { hoursOn, toMinutes } from "@/lib/hours";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, dayRange, fullName, localDay, timeOnly } from "@/lib/format";
import { setAppointmentStatusAction } from "./actions";
import { branchPractitioners } from "./data";
import {
  ACTION_LABEL, assignLanes, dayWindow, hhmm, localMinutes, nextStatuses, practitionerName, STATUS_LABEL, STATUS_TONE, timeSlots, weekStart,
  type ApptStatus,
} from "./lib";

export const metadata = { title: "Appointments" };

const PX_PER_MIN = 1.6; // 15 min = 24px
const STEP = 15;
const BLOCK_TONE: Record<ApptStatus, string> = {
  scheduled: "bg-sky-50 ring-sky-300 text-sky-950", confirmed: "bg-teal-50 ring-teal-400 text-teal-950", arrived: "bg-amber-50 ring-amber-400 text-amber-950",
  completed: "bg-emerald-50 ring-emerald-300 text-emerald-950", cancelled: "bg-slate-50 ring-slate-200 text-slate-400", no_show: "bg-red-50 ring-red-300 text-red-900",
};

type View = "day" | "week" | "list";

export default async function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  const ctx = await requireCtx("appointments.manage");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone;
  const view: View = sp.view === "week" || sp.view === "list" ? sp.view : "day";
  const today = localDay(tz);
  const day = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const docFilter = typeof sp.practitioner === "string" && sp.practitioner ? sp.practitioner : undefined;
  const from = view === "week" ? weekStart(day) : day;
  const to = view === "week" ? addDays(from, 7) : addDays(day, 1);
  const range = { start: dayRange(from, tz).start, end: dayRange(to, tz).start };

  const { rows, practitioners, pendingIntakes, hours } = await tx(ctx, async (t) => ({
    hours: (await t.select({ h: branches.openingHours }).from(branches).where(eq(branches.id, ctx.branchId)))[0]?.h ?? null,
    rows: await t.select({
      a: appointments, p: { firstName: patients.firstName, lastName: patients.lastName, otherNames: patients.otherNames }, service: services.name,
    }).from(appointments).innerJoin(patients, eq(patients.id, appointments.patientId)).leftJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(appointments.branchId, ctx.branchId), gte(appointments.startsAt, range.start), lt(appointments.startsAt, range.end),
        docFilter && /^[0-9a-f-]{36}$/i.test(docFilter) ? eq(appointments.practitionerId, docFilter) : undefined))
      .orderBy(asc(appointments.startsAt)),
    practitioners: await branchPractitioners(t, ctx),
    pendingIntakes: await t.select({ id: intakeForms.id, firstName: patients.firstName, lastName: patients.lastName, submittedAt: intakeForms.submittedAt })
      .from(intakeForms).innerJoin(patients, eq(patients.id, intakeForms.patientId)).where(eq(intakeForms.status, "submitted")).orderBy(asc(intakeForms.submittedAt)).limit(10),
  }));

  const qs = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, date: day, practitioner: docFilter, ...o })) if (v) u.set(k, v);
    return `/appointments?${u}`;
  };
  const step = view === "week" ? 7 : 1;
  const docName = new Map(practitioners.map((d) => [d.id, practitionerName(d)]));
  const write = ctx.access === "full";

  return (
    <>
      <PageHeader title="Appointments" subtitle={view === "week" ? `Week of ${dateOnly(range.start, tz)}` : dateOnly(range.start, tz)}
        actions={<LinkButton href={`/appointments/new?date=${day}`}>Book appointment</LinkButton>} />

      {pendingIntakes.length > 0 && (
        <Card title="Intake forms to review" className="mb-4">
          <ul className="flex flex-wrap gap-2 text-sm">
            {pendingIntakes.map((f) => (
              <li key={f.id}><Link href={`/appointments/intake/${f.id}`} className="rounded-md bg-amber-50 px-3 py-1.5 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">{f.firstName} {f.lastName}</Link></li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs current={view} tabs={(["day", "week", "list"] as const).map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: qs({ view: v }) }))} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LinkButton variant="secondary" href={qs({ date: addDays(day, -step) })} aria-label="Previous">‹</LinkButton>
        <LinkButton variant="secondary" href={qs({ date: today })}>Today</LinkButton>
        <LinkButton variant="secondary" href={qs({ date: addDays(day, step) })} aria-label="Next">›</LinkButton>
        <form action="/appointments" className="flex flex-wrap gap-2">
          <input type="hidden" name="view" value={view} />
          <Input type="date" name="date" defaultValue={day} className="w-auto" aria-label="Date" />
          {view !== "day" && (
            <Select name="practitioner" defaultValue={docFilter ?? ""} className="w-auto" aria-label="Practitioner">
              <option value="">All practitioners</option>
              {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
            </Select>
          )}
          <button className="rounded-md bg-slate-100 px-3 text-sm text-slate-700 hover:bg-slate-200">Go</button>
        </form>
      </div>

      {view === "day" && !hoursOn(hours, day) && <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">This branch is closed on {dateOnly(dayRange(day, tz).start, tz)}. Change opening hours in Settings → Branches.</p>}
      {view === "day" && <DayGrid rows={rows} practitioners={practitioners} day={day} tz={tz} hours={hours} />}

      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
            const items = rows.filter((r) => localDay(tz, r.a.startsAt) === d && r.a.status !== "cancelled");
            return (
              <section key={d} className={cx("rounded-lg p-2 ring-1", d === today ? "bg-teal-50/50 ring-teal-200" : "bg-white ring-slate-200")}>
                <h2 className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <Link href={qs({ view: "day", date: d })} className="hover:underline">{dateOnly(dayRange(d, tz).start, tz)}</Link>
                  <span>{items.length}</span>
                </h2>
                <ul className="space-y-1">
                  {items.map(({ a, p }) => (
                    <li key={a.id}>
                      <Link href={`/appointments/${a.id}`} className={cx("block rounded px-2 py-1 text-xs ring-1", BLOCK_TONE[a.status])}>
                        <span className="font-semibold tabular-nums">{timeOnly(a.startsAt, tz)}</span> {p.firstName} {p.lastName}
                        {!docFilter && a.practitionerId && <span className="block truncate opacity-70">{docName.get(a.practitionerId)}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/appointments/new?date=${d}${docFilter ? `&practitioner=${docFilter}` : ""}`} className="mt-1 block text-center text-xs text-teal-700 hover:underline">+ Book</Link>
              </section>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <Card>
          <Table head={["Time", "Patient", "Practitioner", "Service", "Status", ""]} empty="No appointments this day.">
            {rows.map(({ a, p, service }) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <Td className="tabular-nums">{timeOnly(a.startsAt, tz)}–{timeOnly(a.endsAt, tz)}</Td>
                <Td><Link href={`/appointments/${a.id}`} className="font-medium text-teal-800 hover:underline">{fullName(p)}</Link>{a.telehealth && <span className="ml-1"><Badge tone="purple">Video</Badge></span>}</Td>
                <Td>{a.practitionerId ? docName.get(a.practitionerId) ?? "—" : "—"}</Td>
                <Td>{service ?? "—"}</Td>
                <Td><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></Td>
                <Td className="space-x-1 text-right">
                  {write && nextStatuses(a.status).map((s) => (
                    <ActionButton key={s} action={setAppointmentStatusAction} fields={{ id: a.id, status: s }} variant={s === "arrived" ? "primary" : "secondary"}
                      confirm={s === "cancelled" ? "Cancel this appointment?" : undefined}>{ACTION_LABEL[s]}</ActionButton>
                  ))}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

type Row = { a: typeof appointments.$inferSelect; p: { firstName: string; lastName: string; otherNames: string | null }; service: string | null };

/** Columns = practitioners, rows = 15-minute slots in clinic time. Empty slots link to a prefilled booking. */
function DayGrid({ rows, practitioners, day, tz, hours }: { rows: Row[]; practitioners: { id: string; name: string; title: string | null }[]; day: string; tz: string; hours: OpeningHours | null }) {
  const live = rows.filter((r) => r.a.status !== "cancelled").map((r) => ({ ...r, start: localMinutes(r.a.startsAt, tz), end: localMinutes(r.a.startsAt, tz) + Math.max(STEP, Math.round((r.a.endsAt.getTime() - r.a.startsAt.getTime()) / 60_000)) }));
  const open = hoursOn(hours, day);
  const win = open ? dayWindow(live, toMinutes(open[0]), toMinutes(open[1])) : dayWindow(live);
  const slots = timeSlots(win.start, win.end, STEP);
  const height = (win.end - win.start) * PX_PER_MIN;
  const cols = [...practitioners.map((d) => ({ id: d.id as string | null, label: practitionerName(d) }))];
  if (live.some((r) => !r.a.practitionerId || !practitioners.some((d) => d.id === r.a.practitionerId))) cols.push({ id: null, label: "Other" });
  if (!cols.length) return <Card><p className="text-sm text-slate-500">No practitioners at this branch yet. Mark staff as practitioners in Settings → Users.</p></Card>;
  const nowMin = localDay(tz) === day ? localMinutes(new Date(), tz) : null;

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-slate-200 bg-white">
          <div className="h-10 border-b border-slate-200" />
          <div className="relative" style={{ height }}>
            {slots.filter((m) => m % 30 === 0).map((m) => (
              <div key={m} className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-slate-500" style={{ top: (m - win.start) * PX_PER_MIN }}>{hhmm(m)}</div>
            ))}
          </div>
        </div>
        {cols.map((c) => {
          const mine = live.filter((r) => c.id ? r.a.practitionerId === c.id : !r.a.practitionerId || !practitioners.some((d) => d.id === r.a.practitionerId));
          return (
            <div key={c.id ?? "other"} className="w-48 shrink-0 border-r border-slate-100 sm:w-56">
              <div className="sticky top-0 flex h-10 items-center border-b border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800"><span className="truncate">{c.label}</span></div>
              <div className="relative" style={{ height }}>
                {slots.map((m) => (
                  c.id ? (
                    <Link key={m} href={`/appointments/new?practitioner=${c.id}&date=${day}&time=${hhmm(m)}`} aria-label={`Book ${c.label} at ${hhmm(m)}`}
                      className={cx("absolute inset-x-0 block hover:bg-teal-50", m % 60 === 0 ? "border-t border-slate-200" : "border-t border-slate-100")}
                      style={{ top: (m - win.start) * PX_PER_MIN, height: STEP * PX_PER_MIN }} />
                  ) : <div key={m} className="absolute inset-x-0 border-t border-slate-100" style={{ top: (m - win.start) * PX_PER_MIN }} />
                ))}
                {nowMin !== null && nowMin >= win.start && nowMin < win.end && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (nowMin - win.start) * PX_PER_MIN }} />
                )}
                {assignLanes(mine).map((r) => (
                  <Link key={r.a.id} href={`/appointments/${r.a.id}`}
                    className={cx("absolute z-[5] overflow-hidden rounded-md px-1.5 py-0.5 text-xs shadow-sm ring-1", BLOCK_TONE[r.a.status])}
                    style={{ top: (r.start - win.start) * PX_PER_MIN + 1, height: (r.end - r.start) * PX_PER_MIN - 2, left: `calc(${(r.lane / r.lanes) * 100}% + 2px)`, width: `calc(${100 / r.lanes}% - 4px)` }}>
                    <span className="font-semibold tabular-nums">{hhmm(r.start)}</span> {r.p.firstName} {r.p.lastName}
                    {r.a.telehealth && " · video"}
                    <span className="block truncate opacity-75">{[r.service, STATUS_LABEL[r.a.status]].filter(Boolean).join(" · ")}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
