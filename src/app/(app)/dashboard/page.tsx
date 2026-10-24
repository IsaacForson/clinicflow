import { sql, type SQL } from "drizzle-orm";
import {
  AlertTriangle, ArrowUpRight, CalendarClock, CalendarPlus, ClipboardCheck, CreditCard, FilePenLine, FlaskConical, Inbox,
  ListOrdered, PackageX, Receipt, Stethoscope, UserPlus, Users, Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { A, Avatar, Badge, BarChart, cx, EmptyState, IconTile, Kpi, LinkButton, Panel, Progress, StatusDot, type Tone } from "@/components/ui";
import type { Tx } from "@/db";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateTime, dayRange, localDay, money, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature, PLANS } from "@/lib/plans";
import { denseSeries, pct } from "../reports/range";

export const metadata = { title: "Dashboard" };

type R = Record<string, string | number | null>;
const q = async <T extends R = R>(t: Tx, s: SQL) => (await t.execute(s)) as unknown as T[];
const one = async <T extends R = R>(t: Tx, s: SQL) => (await q<T>(t, s))[0];

// Request-time clock (server component renders once per request).
const nowMs = () => Date.now();
const daysUntil = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86400_000);
const QUEUE_LABELS: Record<string, string> = { waiting: "Waiting", with_doctor: "With doctor", lab: "Lab", billing: "Billing", pharmacy: "Pharmacy", done: "Done", left: "Left" };

export default async function DashboardPage() {
  const ctx = await requireCtx();
  const { role, id: me } = ctx.user;
  const tz = ctx.tenant.timezone;
  const cur = ctx.tenant.currency;
  const today = localDay(tz);
  const range = dayRange(today, tz);
  const [start, end] = [range.start.toISOString(), range.end.toISOString()]; // strings: raw sql params aren't serialized
  const from14 = addDays(today, -13);
  const start14 = dayRange(from14, tz).start.toISOString();
  const branch = ctx.branchId;
  const practitioner = ctx.user.isPractitioner || role === "doctor";
  const sees = {
    clinical: can(role, "clinical.read"),
    money: can(role, "billing.read"),
    queue: can(role, "queue.manage") && hasFeature(ctx.tenant, "queue"),
    appts: can(role, "appointments.manage") || can(role, "queue.manage"),
    lab: (can(role, "lab.result") || can(role, "lab.order")) && hasFeature(ctx.tenant, "lab"),
    stock: (can(role, "inventory.manage") || can(role, "dispense")) && hasFeature(ctx.tenant, "dispensary"),
    messages: can(role, "messaging.send"),
  };

  const d = await tx(ctx, async (t) => ({
    appts: sees.appts ? await q<{ id: string; startsAt: string; status: string; patientId: string; patient: string; doctor: string | null }>(t, sql`
      select a.id, a.starts_at as "startsAt", a.status::text as status, a.patient_id as "patientId", p.first_name || ' ' || p.last_name as patient, u.name as doctor
      from appointments a join patients p on p.id = a.patient_id left join users u on u.id = a.practitioner_id
      where a.branch_id = ${branch} and a.starts_at >= ${start} and a.starts_at < ${end} and a.status <> 'cancelled'
        ${practitioner && role !== "owner" ? sql`and (a.practitioner_id = ${me} or a.practitioner_id is null)` : sql``}
      order by a.starts_at`) : [],
    queue: sees.queue || practitioner ? await q<{ status: string; n: number }>(t, sql`
      select status::text as status, count(*)::int as n from queue_tickets where branch_id = ${branch} and day = ${today} group by 1`) : [],
    walkIns: sees.queue ? (await one<{ n: number }>(t, sql`select count(*)::int as n from queue_tickets where branch_id = ${branch} and day = ${today} and appointment_id is null`)).n : 0,
    myQueue: practitioner && sees.clinical ? await q<{ ticketNo: number; status: string; patientId: string; patient: string; visitId: string | null; priority: number }>(t, sql`
      select qt.ticket_no as "ticketNo", qt.status::text as status, qt.patient_id as "patientId", p.first_name || ' ' || p.last_name as patient, qt.visit_id as "visitId", qt.priority
      from queue_tickets qt join patients p on p.id = qt.patient_id
      where qt.branch_id = ${branch} and qt.day = ${today} and qt.status in ('waiting', 'with_doctor') and (qt.practitioner_id = ${me} or qt.practitioner_id is null)
      order by qt.priority desc, qt.ticket_no limit 10`) : [],
    unsigned: sees.clinical ? await q<{ id: string; startedAt: string; patient: string; doctor: string | null }>(t, sql`
      select v.id, v.started_at as "startedAt", p.first_name || ' ' || p.last_name as patient, u.name as doctor
      from visits v join patients p on p.id = v.patient_id left join users u on u.id = v.practitioner_id
      where v.status = 'open' and v.branch_id = ${branch} ${practitioner && role !== "owner" ? sql`and v.practitioner_id = ${me}` : sql``}
      order by v.started_at limit 8`) : [],
    unsignedCount: sees.clinical ? (await one<{ n: number }>(t, sql`select count(*)::int as n from visits v where v.status = 'open' and v.branch_id = ${branch}
      ${practitioner && role !== "owner" ? sql`and v.practitioner_id = ${me}` : sql``}`)).n : 0,
    revenue: sees.money ? await q<{ day: string; amount: number }>(t, sql`
      select (received_at at time zone ${tz})::date::text as day, sum(amount_minor)::int as amount from payments
      where branch_id = ${branch} and status = 'succeeded' and method <> 'deposit' and received_at >= ${start14} and received_at < ${end} group by 1`) : [],
    methods: sees.money ? await q<{ method: string; amount: number; n: number }>(t, sql`
      select method::text as method, sum(amount_minor)::int as amount, count(*)::int as n from payments
      where branch_id = ${branch} and status = 'succeeded' and method <> 'deposit' and received_at >= ${start} and received_at < ${end} group by 1 order by 2 desc`) : [],
    outstanding: sees.money ? await one<{ total: number; n: number }>(t, sql`
      select coalesce(sum(patient_portion_minor - paid_minor), 0)::int as total, count(distinct patient_id)::int as n from invoices
      where status in ('issued', 'partially_paid') and patient_portion_minor > paid_minor`) : null,
    debtors: sees.money ? await q<{ id: string; patient: string; patientNo: string; balance: number }>(t, sql`
      select p.id, p.first_name || ' ' || p.last_name as patient, p.patient_no as "patientNo", sum(i.patient_portion_minor - i.paid_minor)::int as balance
      from invoices i join patients p on p.id = i.patient_id
      where i.status in ('issued', 'partially_paid') and i.patient_portion_minor > i.paid_minor group by 1, 2, 3 order by 4 desc limit 5`) : [],
    noShow: sees.appts ? await one<{ total: number; missed: number }>(t, sql`
      select count(*)::int as total, count(*) filter (where status = 'no_show')::int as missed from appointments
      where branch_id = ${branch} and status <> 'cancelled' and starts_at < now() and starts_at >= now() - interval '30 days'`) : null,
    lab: sees.lab ? (await one<{ n: number }>(t, sql`select count(*)::int as n from lab_orders where branch_id = ${branch} and status in ('ordered', 'collected')`)).n : 0,
    lowStock: sees.stock ? (await one<{ n: number }>(t, sql`
      select count(*)::int as n from items i where i.active and i.reorder_level > 0 and i.reorder_level >=
        coalesce((select sum(b.qty_on_hand) from stock_batches b where b.item_id = i.id and b.branch_id = ${branch}), 0)`)).n : 0,
    // Inbound messages count as unread until the messages module marks them 'read'.
    inbox: sees.messages ? (await one<{ n: number }>(t, sql`select count(*)::int as n from message_log where direction = 'in' and status <> 'read'`)).n : 0,
  }));

  const queueCount = (s: string) => d.queue.find((x) => x.status === s)?.n ?? 0;
  const queueTotal = d.queue.filter((x) => x.status !== "left").reduce((n, x) => n + x.n, 0);
  const revenueToday = d.methods.reduce((s, m) => s + m.amount, 0);
  const series = denseSeries(from14, today, new Map(d.revenue.map((r) => [r.day, r.amount])));
  const yesterday = series.at(-2)?.value ?? 0;
  const trialDays = ctx.tenant.planStatus === "trialing" && ctx.tenant.trialEndsAt ? daysUntil(ctx.tenant.trialEndsAt) : null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const branchName = ctx.branches.find((b) => b.id === branch)?.name;
  const firstName = ctx.user.name.split(" ")[0];
  const now = nowMs();
  const upcoming = d.appts.filter((a) => new Date(a.startsAt).getTime() >= now - 15 * 60_000 && a.status !== "completed" && a.status !== "no_show");
  const noShowRate = d.noShow ? pct(d.noShow.missed, d.noShow.total) : 0;

  const actions = [
    { href: "/patients/new", label: "Register patient", icon: UserPlus, show: can(role, "patients.write") },
    { href: "/queue", label: "Add walk-in", icon: ListOrdered, show: sees.queue },
    { href: "/appointments/new", label: "Book appointment", icon: CalendarPlus, show: can(role, "appointments.manage") },
    { href: "/visits", label: "Consultations", icon: Stethoscope, show: practitioner && sees.clinical },
    { href: "/billing/new", label: "New invoice", icon: Receipt, show: can(role, "billing.write") },
    { href: "/billing/cashup", label: "Cash-up", icon: Wallet, show: can(role, "cashup") },
  ].filter((a) => a.show).slice(0, 4);

  const kpis: { key: string; node: ReactNode }[] = [];
  if (sees.money) kpis.push({ key: "rev", node: <Kpi label="Revenue today" value={money(revenueToday, cur)} icon={<CreditCard />} tone="purple" trend={series.map((x) => x.value)} href="/billing"
    delta={yesterday ? { value: `${revenueToday >= yesterday ? "+" : ""}${Math.round(((revenueToday - yesterday) / yesterday) * 100)}% vs yesterday`, good: revenueToday >= yesterday } : undefined} sub={!yesterday ? "last 14 days" : undefined} /> });
  if (sees.queue || practitioner) kpis.push({ key: "q", node: <Kpi label="In the queue" value={queueCount("waiting") + queueCount("with_doctor")} icon={<ListOrdered />} tone="teal" href="/queue"
    sub={`${queueCount("waiting")} waiting · ${queueCount("with_doctor")} with doctor`} /> });
  if (sees.appts) kpis.push({ key: "a", node: <Kpi label="Appointments today" value={d.appts.length} icon={<CalendarClock />} tone="blue" href="/appointments"
    sub={`${upcoming.length} still to come · ${d.walkIns} walk-ins`} /> });
  if (sees.appts && d.noShow) kpis.push({ key: "ns", node: <Kpi label="No-show rate" value={`${noShowRate}%`} icon={<AlertTriangle />} tone={noShowRate > 15 ? "red" : "green"}
    sub={`${d.noShow.missed} of ${d.noShow.total} in 30 days`} /> });
  if (sees.money && d.outstanding && kpis.length < 4) kpis.push({ key: "o", node: <Kpi label="Patients owe" value={money(d.outstanding.total, cur)} icon={<Wallet />} tone="yellow" href="/billing" sub={`${d.outstanding.n} patients`} /> });
  if (sees.clinical && kpis.length < 4) kpis.push({ key: "u", node: <Kpi label="Unsigned notes" value={d.unsignedCount} icon={<FilePenLine />} tone={d.unsignedCount ? "yellow" : "green"} href="/visits" /> });

  const alerts = [
    sees.lab && d.lab > 0 && { href: "/lab", icon: <FlaskConical />, tone: "blue" as Tone, text: `${d.lab} lab order${d.lab === 1 ? "" : "s"} waiting for results` },
    sees.stock && d.lowStock > 0 && { href: "/pharmacy/inventory", icon: <PackageX />, tone: "red" as Tone, text: `${d.lowStock} item${d.lowStock === 1 ? "" : "s"} at or below reorder level` },
    sees.messages && d.inbox > 0 && { href: "/messages/inbox", icon: <Inbox />, tone: "purple" as Tone, text: `${d.inbox} unread patient message${d.inbox === 1 ? "" : "s"}` },
    sees.clinical && d.unsignedCount > 0 && !practitioner && { href: "/visits", icon: <FilePenLine />, tone: "yellow" as Tone, text: `${d.unsignedCount} consultation note${d.unsignedCount === 1 ? "" : "s"} not signed` },
  ].filter(Boolean) as { href: string; icon: ReactNode; tone: Tone; text: string }[];

  const lanes = ["waiting", "with_doctor", "lab", "billing", "pharmacy", "done"];

  return (
    <div className="space-y-6">
      {/* Mission brief */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="glass ring-aurora relative overflow-hidden p-6 sm:p-8 animate-rise">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-aurora opacity-20 blur-[90px]" aria-hidden />
          <div className="relative flex flex-wrap items-center gap-2 text-xs text-muted">
            <StatusDot tone="green" label="Live" />
            <span>{dateTime(new Date(), tz, { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="text-subtle">·</span><span>{branchName ?? ctx.tenant.name}</span>
          </div>
          <h1 className="relative mt-4 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[42px]">
            {greeting}, <span className="text-aurora">{firstName}</span>
          </h1>
          <p className="relative mt-2 max-w-xl text-[15px] text-muted">
            {queueTotal ? `${queueCount("waiting")} waiting, ${queueCount("with_doctor")} with a doctor` : "The queue is clear"}
            {sees.appts ? ` · ${upcoming.length} appointment${upcoming.length === 1 ? "" : "s"} still to come today` : ""}
            {sees.money ? ` · ${money(revenueToday, cur)} collected so far` : ""}.
          </p>
          {trialDays !== null && trialDays > 7 && can(role, "settings.manage") && (
            <p className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-fg">
              {PLANS[ctx.tenant.plan].name} trial · {trialDays} days left <A href="/settings/subscription" className="text-xs">Choose a plan</A>
            </p>
          )}
        </div>
        {actions.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {actions.map((a, i) => (
              <Link key={a.href} href={a.href} className="glass group flex flex-col justify-between gap-6 p-5 transition hover:-translate-y-0.5 hover:border-line-strong animate-rise" style={{ animationDelay: `${60 * i}ms` }}>
                <div className="flex items-center justify-between">
                  <IconTile><a.icon /></IconTile>
                  <ArrowUpRight className="h-4 w-4 text-subtle transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-2" aria-hidden />
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {kpis.length > 0 && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis.slice(0, 4).map((k) => <div key={k.key}>{k.node}</div>)}</section>}

      {alerts.length > 0 && (
        <section className="flex flex-wrap gap-2" aria-label="Needs attention">
          {alerts.map((a) => (
            <Link key={a.href} href={a.href} className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm transition hover:border-line-strong">
              <IconTile tone={a.tone} className="h-6 w-6 rounded-lg [&>svg]:h-3.5 [&>svg]:w-3.5">{a.icon}</IconTile>{a.text}
            </Link>
          ))}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          {(sees.queue || practitioner) && (
            <Panel title="Live queue" eyebrow="Patient flow" icon={<Users />} actions={<LinkButton href="/queue" variant="ghost" size="sm">Open board</LinkButton>}>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {lanes.map((l) => {
                  const n = queueCount(l);
                  return (
                    <div key={l} className={cx("rounded-2xl border p-3", n ? "border-line-strong bg-surface-2" : "border-line bg-surface")}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">{QUEUE_LABELS[l]}</div>
                      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{n}</div>
                      <Progress value={queueTotal ? (n / queueTotal) * 100 : 0} className="mt-2" tone={l === "done" ? "green" : "purple"} />
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {sees.money && (
            <Panel title="Revenue" eyebrow="Last 14 days" icon={<CreditCard />} actions={<LinkButton href="/reports" variant="ghost" size="sm">Reports</LinkButton>}>
              <BarChart data={series.map((x) => ({ label: x.day.slice(8), value: x.value }))} format={(v) => money(v, cur)} height={180} />
              {d.methods.length > 0 && (
                <div className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
                  {d.methods.map((m) => (
                    <div key={m.method}>
                      <div className="flex justify-between text-xs"><span className="capitalize text-muted">{m.method.replace("_", " ")} · {m.n}</span><span className="tabular-nums text-fg">{money(m.amount, cur)}</span></div>
                      <Progress value={revenueToday ? (m.amount / revenueToday) * 100 : 0} className="mt-1.5" />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {sees.appts && (
            <Panel title="Today's schedule" eyebrow={`${d.appts.length} appointments`} icon={<CalendarClock />} actions={<LinkButton href="/appointments" variant="ghost" size="sm">Calendar</LinkButton>}>
              {d.appts.length === 0 ? <EmptyState compact title="No appointments booked today" /> : (
                <ol className="relative space-y-1 before:absolute before:inset-y-2 before:left-[68px] before:w-px before:bg-line">
                  {d.appts.map((a) => {
                    const past = new Date(a.startsAt).getTime() < now;
                    return (
                      <li key={a.id}>
                        <Link href={`/appointments/${a.id}`} className="flex items-center gap-4 rounded-xl px-2 py-2 transition hover:bg-surface-2">
                          <span className={cx("w-12 text-right font-mono text-xs tabular-nums", past ? "text-subtle" : "text-fg")}>{timeOnly(a.startsAt, tz)}</span>
                          <span className={cx("relative z-10 h-2.5 w-2.5 rounded-full ring-4 ring-canvas", a.status === "arrived" ? "bg-accent-2" : past ? "bg-subtle" : "bg-accent")} aria-hidden />
                          <Avatar name={a.patient} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.patient}<span className="ml-2 font-normal text-muted">{a.doctor ?? ""}</span></span>
                          <Badge tone={a.status === "arrived" ? "teal" : a.status === "completed" ? "green" : a.status === "no_show" ? "red" : a.status === "confirmed" ? "blue" : "gray"}>{a.status.replace("_", " ")}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4 xl:col-span-4">
          {practitioner && sees.clinical && (
            <Panel title="Waiting for you" eyebrow="My patients" icon={<Stethoscope />} actions={<LinkButton href="/visits" variant="ghost" size="sm">All</LinkButton>}>
              {d.myQueue.length === 0 ? <EmptyState compact title="Nobody is waiting for you" /> : (
                <div className="-mx-2 space-y-0.5">
                  {d.myQueue.map((x) => (
                    <Link key={x.ticketNo} href={x.visitId ? `/visits/${x.visitId}` : `/visits/new?patient=${x.patientId}`}
                      className={cx("flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2", x.priority > 0 && "bg-bad/5")}>
                      <span className="grid h-9 w-11 place-items-center rounded-lg border border-line bg-surface-2 font-mono text-sm font-semibold tabular-nums">#{x.ticketNo}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{x.patient}</span>
                      {x.priority > 0 ? <Badge tone="red" pulse>Urgent</Badge> : <Badge tone={x.status === "with_doctor" ? "teal" : "gray"}>{QUEUE_LABELS[x.status]}</Badge>}
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {sees.clinical && (
            <Panel title={practitioner ? "My unsigned notes" : "Unsigned notes"} eyebrow={`${d.unsignedCount} open`} icon={<ClipboardCheck />}>
              {d.unsigned.length === 0 ? <EmptyState compact title="All notes are signed" /> : (
                <div className="-mx-2 space-y-0.5">
                  {d.unsigned.map((v) => (
                    <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
                      <Avatar name={v.patient} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{v.patient}</span>
                        <span className="block truncate text-xs text-muted">{dateTime(v.startedAt, tz)}{v.doctor ? ` · ${v.doctor}` : ""}</span>
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-subtle" aria-hidden />
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {sees.money && d.outstanding && (
            <Panel title="Patients owe" eyebrow={`${d.outstanding.n} patients`} icon={<Wallet />}>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">{money(d.outstanding.total, cur)}</div>
              <div className="-mx-2 mt-4 space-y-0.5">
                {d.debtors.map((x) => (
                  <Link key={x.id} href={`/patients/${x.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
                    <Avatar name={x.patient} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{x.patient}</span>
                      <span className="block font-mono text-[11px] text-subtle">{x.patientNo}</span>
                    </span>
                    <span className="text-sm tabular-nums text-warn">{money(x.balance, cur)}</span>
                  </Link>
                ))}
                {d.debtors.length === 0 && <EmptyState compact title="No outstanding balances" />}
              </div>
            </Panel>
          )}
        </div>
      </section>
    </div>
  );
}
