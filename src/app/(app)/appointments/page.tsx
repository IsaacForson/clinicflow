import { and, asc, eq, gte, lt } from "drizzle-orm";
import { CalendarCheck2, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ClipboardList, Clock, MoonStar, UserCheck, UserX, Video } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/form";
import { Avatar, Badge, Callout, EmptyState, Input, Kpi, LinkButton, PageHeader, Panel, Segmented, Select, Table, Td, cx } from "@/components/ui";
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
/** Glass chip colour per status: tinted fill, matching border and a solid accent bar on the left. */
const BLOCK_TONE: Record<ApptStatus, string> = {
  scheduled: "border-info/30 bg-info/12 hover:bg-info/20 before:bg-info",
  confirmed: "border-accent-2/30 bg-accent-2/12 hover:bg-accent-2/20 before:bg-accent-2",
  arrived: "border-warn/35 bg-warn/12 hover:bg-warn/20 before:bg-warn",
  completed: "border-ok/30 bg-ok/12 hover:bg-ok/20 before:bg-ok",
  cancelled: "border-line bg-surface-2 text-subtle line-through before:bg-subtle",
  no_show: "border-bad/30 bg-bad/12 hover:bg-bad/20 before:bg-bad",
};
const chip = "relative overflow-hidden rounded-xl border pl-3 pr-2 text-fg backdrop-blur-md transition before:absolute before:inset-y-1 before:left-1 before:w-[3px] before:rounded-full";
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });

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
  const count = (s: ApptStatus[]) => rows.filter((r) => s.includes(r.a.status)).length;
  const live = rows.filter((r) => r.a.status !== "cancelled").length;
  const periodLabel = view === "week" ? `Week of ${dateOnly(range.start, tz)}` : day === today ? `Today · ${dateOnly(range.start, tz)}` : dateOnly(range.start, tz);

  return (
    <>
      <PageHeader title="Appointments" eyebrow="Front desk · Calendar" icon={<CalendarDays />}
        subtitle={`${periodLabel} · ${live} booked`}
        actions={<LinkButton href={`/appointments/new?date=${day}`} size="lg"><CalendarPlus className="h-4 w-4" aria-hidden /> Book appointment</LinkButton>} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Booked" value={live} icon={<CalendarCheck2 />} sub={view === "week" ? "this week" : "this day"} />
        <Kpi label="To come" value={count(["scheduled", "confirmed"])} icon={<Clock />} tone="blue" sub={`${count(["confirmed"])} confirmed`} />
        <Kpi label="Arrived" value={count(["arrived", "completed"])} icon={<UserCheck />} tone="green" sub={`${count(["completed"])} completed`} />
        <Kpi label="No-shows" value={count(["no_show"])} icon={<UserX />} tone="red" sub={`${count(["cancelled"])} cancelled`} />
      </div>

      {pendingIntakes.length > 0 && (
        <div className="mb-6">
          <Callout tone="yellow" icon={<ClipboardList />}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-medium">{pendingIntakes.length} intake form{pendingIntakes.length === 1 ? "" : "s"} to review</span>
              {pendingIntakes.map((f) => (
                <Link key={f.id} href={`/appointments/intake/${f.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-surface px-2.5 py-1 text-xs font-medium text-fg transition hover:border-warn/60 hover:bg-warn/12">
                  <Avatar name={`${f.firstName} ${f.lastName}`} size="sm" className="-ml-1.5 h-5 w-5 text-[8px] ring-0" />{f.firstName} {f.lastName}
                </Link>
              ))}
            </div>
          </Callout>
        </div>
      )}

      {/* Date navigator + view switch */}
      <div className="glass mb-4 flex flex-wrap items-center gap-3 p-2 animate-rise">
        <div className="flex items-center gap-1">
          <Link href={qs({ date: addDays(day, -step) })} aria-label={view === "week" ? "Previous week" : "Previous day"} className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-surface-3 hover:text-fg"><ChevronLeft className="h-[18px] w-[18px]" /></Link>
          <LinkButton variant={day === today ? "secondary" : "ghost"} size="md" href={qs({ date: today })}>Today</LinkButton>
          <Link href={qs({ date: addDays(day, step) })} aria-label={view === "week" ? "Next week" : "Next day"} className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-surface-3 hover:text-fg"><ChevronRight className="h-[18px] w-[18px]" /></Link>
        </div>
        <div className="hidden min-w-0 text-sm font-semibold tracking-tight text-fg sm:block">{periodLabel}</div>
        <form action="/appointments" className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <input type="hidden" name="view" value={view} />
          <Input type="date" name="date" defaultValue={day} className="w-auto" aria-label="Date" />
          {view !== "day" && (
            <Select name="practitioner" defaultValue={docFilter ?? ""} className="w-auto min-w-44" aria-label="Practitioner">
              <option value="">All practitioners</option>
              {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
            </Select>
          )}
          <button className="h-10 rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium text-fg transition hover:bg-surface-3">Go</button>
        </form>
        <div className="w-full sm:w-auto [&>nav]:mb-0">
          <Segmented current={view} tabs={(["day", "week", "list"] as const).map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: qs({ view: v }) }))} />
        </div>
      </div>

      {view === "day" && !hoursOn(hours, day) && (
        <div className="mb-4"><Callout tone="yellow" icon={<MoonStar />}>The branch is closed on {dateOnly(dayRange(day, tz).start, tz)}. Change opening hours in Settings → Branches.</Callout></div>
      )}
      {view === "day" && <DayGrid rows={rows} practitioners={practitioners} day={day} tz={tz} hours={hours} />}

      {view === "week" && (
        <div className="glass overflow-x-auto animate-rise">
          <div className="grid min-w-[840px] grid-cols-7 divide-x divide-line">
            {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
              const items = rows.filter((r) => localDay(tz, r.a.startsAt) === d && r.a.status !== "cancelled");
              const isToday = d === today;
              return (
                <section key={d} className={cx("flex min-h-[420px] flex-col", isToday && "bg-accent/5")}>
                  <Link href={qs({ view: "day", date: d })} className="group flex items-center justify-between gap-2 border-b border-line px-3 py-3 transition hover:bg-surface-2">
                    <span className="flex items-center gap-2">
                      <span className={cx("grid h-9 w-9 place-items-center rounded-full text-sm font-semibold tabular-nums", isToday ? "bg-aurora text-on-accent shadow-glow" : "bg-surface-2 text-fg group-hover:bg-surface-3")}>{+d.slice(8)}</span>
                      <span className={cx("text-xs font-semibold uppercase tracking-[0.14em]", isToday ? "text-accent" : "text-subtle")}>{weekday(d)}</span>
                    </span>
                    {items.length > 0 && <span className="rounded-md bg-surface-3 px-1.5 text-[10px] tabular-nums text-muted">{items.length}</span>}
                  </Link>
                  <ul className="flex-1 space-y-1.5 p-2">
                    {items.map(({ a, p, service }) => (
                      <li key={a.id}>
                        <Link href={`/appointments/${a.id}`} className={cx(chip, "block py-1.5 text-xs", BLOCK_TONE[a.status])}>
                          <span className="flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums text-muted">{timeOnly(a.startsAt, tz)}{a.telehealth && <Video className="h-3 w-3 text-accent" aria-label="Video" />}</span>
                          <span className="block truncate font-medium">{p.firstName} {p.lastName}</span>
                          <span className="block truncate text-[11px] text-muted">{[service, !docFilter && a.practitionerId && docName.get(a.practitionerId)].filter(Boolean).join(" · ") || STATUS_LABEL[a.status]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/appointments/new?date=${d}${docFilter ? `&practitioner=${docFilter}` : ""}`} className="m-2 mt-0 flex h-9 items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs font-medium text-subtle transition hover:border-accent/50 hover:bg-accent/10 hover:text-accent">
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Book
                  </Link>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {view === "list" && (
        <Panel bodyClassName="px-5 pb-2 pt-4">
          <Table head={["Time", "Patient", "Practitioner", "Service", "Status", ""]} empty={<>No appointments on this day. <Link href={`/appointments/new?date=${day}`} className="text-accent hover:underline">Book one</Link></>}>
            {rows.map(({ a, p, service }) => (
              <tr key={a.id}>
                <Td className="font-mono text-xs tabular-nums text-muted">{timeOnly(a.startsAt, tz)}–{timeOnly(a.endsAt, tz)}</Td>
                <Td>
                  <Link href={`/appointments/${a.id}`} className="group flex items-center gap-3">
                    <Avatar name={fullName(p)} size="sm" />
                    <span className="font-medium text-fg group-hover:text-accent">{fullName(p)}</span>
                    {a.telehealth && <Badge tone="purple">Video</Badge>}
                  </Link>
                </Td>
                <Td className="text-muted">{a.practitionerId ? docName.get(a.practitionerId) ?? "—" : "—"}</Td>
                <Td className="text-muted">{service ?? "—"}</Td>
                <Td><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {write && nextStatuses(a.status).map((s) => (
                      <ActionButton key={s} action={setAppointmentStatusAction} fields={{ id: a.id, status: s }} variant={s === "arrived" ? "primary" : s === "cancelled" || s === "no_show" ? "ghost" : "secondary"}
                        confirm={s === "cancelled" ? "Cancel this appointment?" : undefined}>{ACTION_LABEL[s]}</ActionButton>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>
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
  if (!cols.length) return (
    <Panel><EmptyState icon={<CalendarDays />} title="No practitioners at this branch yet">Mark staff as practitioners in Settings → Users to see their columns here.</EmptyState></Panel>
  );
  const nowMin = localDay(tz) === day ? localMinutes(new Date(), tz) : null;
  const showNow = nowMin !== null && nowMin >= win.start && nowMin < win.end;

  return (
    <div className="glass max-h-[calc(100vh-11rem)] overflow-auto animate-rise">
      <div className="flex min-w-max">
        {/* Time gutter */}
        <div className="sticky left-0 z-30 w-16 shrink-0 border-r border-line bg-solid/90 backdrop-blur-xl">
          <div className="sticky top-0 z-10 h-14 border-b border-line bg-solid/90" />
          <div className="relative" style={{ height }}>
            {slots.filter((m) => m % 60 === 0).map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] tabular-nums text-subtle" style={{ top: (m - win.start) * PX_PER_MIN }}>{hhmm(m)}</div>
            ))}
            {showNow && (
              <div className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-accent-2 px-1 font-mono text-[10px] font-semibold tabular-nums text-canvas shadow-glow" style={{ top: (nowMin - win.start) * PX_PER_MIN }}>{hhmm(nowMin)}</div>
            )}
          </div>
        </div>
        {cols.map((c) => {
          const mine = live.filter((r) => c.id ? r.a.practitionerId === c.id : !r.a.practitionerId || !practitioners.some((d) => d.id === r.a.practitionerId));
          return (
            <div key={c.id ?? "other"} className="w-52 shrink-0 border-r border-line last:border-r-0 sm:w-60">
              <div className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-line bg-solid/90 px-3 backdrop-blur-xl">
                <Avatar name={c.label} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{c.label}</span>
                  <span className="block text-[11px] text-subtle">{mine.length ? `${mine.length} booked` : "Free all day"}</span>
                </span>
              </div>
              <div className="relative" style={{ height }}>
                {slots.map((m) => (
                  c.id ? (
                    <Link key={m} href={`/appointments/new?practitioner=${c.id}&date=${day}&time=${hhmm(m)}`} aria-label={`Book ${c.label} at ${hhmm(m)}`}
                      className={cx("group absolute inset-x-0 block transition hover:bg-accent/10", m % 60 === 0 ? "border-t border-line-strong/60" : "border-t border-line/50")}
                      style={{ top: (m - win.start) * PX_PER_MIN, height: STEP * PX_PER_MIN }}>
                      <span className="hidden h-full items-center pl-2 font-mono text-[10px] text-accent group-hover:flex">+ {hhmm(m)}</span>
                    </Link>
                  ) : <div key={m} className="absolute inset-x-0 border-t border-line/50" style={{ top: (m - win.start) * PX_PER_MIN }} />
                ))}
                {showNow && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-accent-2 shadow-glow" style={{ top: (nowMin - win.start) * PX_PER_MIN }} aria-hidden />
                )}
                {assignLanes(mine).map((r) => {
                  const tall = (r.end - r.start) * PX_PER_MIN >= 44;
                  return (
                    <Link key={r.a.id} href={`/appointments/${r.a.id}`} title={`${hhmm(r.start)} ${fullName(r.p)} · ${STATUS_LABEL[r.a.status]}`}
                      className={cx(chip, "absolute z-[5] py-1 text-xs shadow-panel hover:z-[6]", BLOCK_TONE[r.a.status])}
                      style={{ top: (r.start - win.start) * PX_PER_MIN + 1, height: (r.end - r.start) * PX_PER_MIN - 2, left: `calc(${(r.lane / r.lanes) * 100}% + 3px)`, width: `calc(${100 / r.lanes}% - 6px)` }}>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-semibold tabular-nums text-muted">{hhmm(r.start)}</span>
                        <span className="truncate font-medium">{r.p.firstName} {r.p.lastName}</span>
                        {r.a.telehealth && <Video className="ml-auto h-3 w-3 shrink-0 text-accent" aria-label="Video" />}
                      </span>
                      {tall && <span className="block truncate text-[11px] text-muted">{[r.service, STATUS_LABEL[r.a.status]].filter(Boolean).join(" · ")}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
