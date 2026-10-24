import { sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, cx, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import type { Tx } from "@/db";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateTime, dayRange, localDay, money, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature, PLANS } from "@/lib/plans";
import { denseSeries, pct } from "../reports/range";
import { BarChart } from "../reports/ui";

export const metadata = { title: "Dashboard" };

type R = Record<string, string | number | null>;
const q = async <T extends R = R>(t: Tx, s: SQL) => (await t.execute(s)) as unknown as T[];
const one = async <T extends R = R>(t: Tx, s: SQL) => (await q<T>(t, s))[0];

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
  const revenueToday = d.methods.reduce((s, m) => s + m.amount, 0);
  const series = denseSeries(from14, today, new Map(d.revenue.map((r) => [r.day, r.amount])));
  const trialDays = ctx.tenant.planStatus === "trialing" && ctx.tenant.trialEndsAt ? daysUntil(ctx.tenant.trialEndsAt) : null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const branchName = ctx.branches.find((b) => b.id === branch)?.name;

  const sections: { key: string; node: ReactNode }[] = [];
  const add = (key: string, show: boolean, node: ReactNode) => { if (show) sections.push({ key, node }); };

  add("practice", practitioner && sees.clinical, (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="My queue today" actions={<WidgetLink href="/queue">Open queue</WidgetLink>}>
        <ul className="divide-y divide-slate-100 text-sm">
          {d.myQueue.map((x) => (
            <li key={x.ticketNo} className="flex items-center justify-between gap-2 py-2">
              <span><span className="mr-2 font-mono text-xs text-slate-500">#{x.ticketNo}</span>
                <Link href={x.visitId ? `/visits/${x.visitId}` : `/patients/${x.patientId}`} className="font-medium text-teal-800 hover:underline">{x.patient}</Link>
                {x.priority > 0 && <span className="ml-2"><Badge tone="red">Urgent</Badge></span>}</span>
              <Badge tone={x.status === "with_doctor" ? "teal" : "gray"}>{QUEUE_LABELS[x.status]}</Badge>
            </li>
          ))}
          {d.myQueue.length === 0 && <li className="py-4 text-center text-slate-500">Nobody waiting for you.</li>}
        </ul>
      </Card>
      <UnsignedCard rows={d.unsigned} count={d.unsignedCount} tz={tz} title="My unsigned notes" />
    </div>
  ));

  add("money", sees.money, (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Revenue, last 14 days" className="lg:col-span-2" actions={<WidgetLink href="/reports/revenue-day?preset=last30">Revenue report</WidgetLink>}>
        <BarChart label="Money collected per day, last 14 days" data={series.map((s) => ({ label: s.day, value: s.value }))} format={(v) => money(v, cur)} />
        <p className="mt-2 text-sm text-slate-600">14-day total <strong className="text-slate-900">{money(series.reduce((s, x) => s + x.value, 0), cur)}</strong></p>
      </Card>
      <Card title="Payments today" actions={<WidgetLink href="/billing">Billing</WidgetLink>}>
        <ul className="space-y-1.5 text-sm">
          {d.methods.map((m) => (
            <li key={m.method} className="flex justify-between gap-2"><span className="capitalize text-slate-600">{m.method.replace("_", " ")} <span className="text-xs text-slate-400">×{m.n}</span></span><span className="font-medium tabular-nums">{money(m.amount, cur)}</span></li>
          ))}
          {d.methods.length === 0 && <li className="text-slate-500">No payments yet today.</li>}
        </ul>
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold"><span>Total</span><span className="tabular-nums">{money(revenueToday, cur)}</span></div>
      </Card>
      <Card title="Outstanding balances" className="lg:col-span-3" actions={<WidgetLink href="/reports/aging">Aging report</WidgetLink>}>
        <p className="mb-2 text-sm text-slate-600"><strong className="text-lg text-slate-900">{money(d.outstanding?.total ?? 0, cur)}</strong> owed by {d.outstanding?.n ?? 0} patient{d.outstanding?.n === 1 ? "" : "s"}</p>
        <Table head={["Patient", "Patient no.", "Balance"]} empty="No outstanding balances.">
          {d.debtors.map((x) => (
            <tr key={x.id}><Td><Link href={`/patients/${x.id}`} className="font-medium text-teal-800 hover:underline">{x.patient}</Link></Td><Td className="font-mono text-xs">{x.patientNo}</Td><Td className="tabular-nums">{money(x.balance, cur)}</Td></tr>
          ))}
        </Table>
      </Card>
    </div>
  ));

  add("today", sees.appts, (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title={`Today's patients (${d.appts.length + d.walkIns})`} className="lg:col-span-2" actions={<WidgetLink href="/appointments">Appointments</WidgetLink>}>
        <p className="mb-2 text-sm text-slate-600">{d.appts.length} appointment{d.appts.length === 1 ? "" : "s"}{sees.queue && ` · ${d.walkIns} walk-in${d.walkIns === 1 ? "" : "s"}`}</p>
        <Table head={["Time", "Patient", "With", "Status"]} empty="No appointments today.">
          {d.appts.slice(0, 10).map((a) => (
            <tr key={a.id}>
              <Td className="tabular-nums">{timeOnly(a.startsAt, tz)}</Td>
              <Td><Link href={`/patients/${a.patientId}`} className="font-medium text-teal-800 hover:underline">{a.patient}</Link></Td>
              <Td>{a.doctor ?? "Any"}</Td>
              <Td><Badge tone={a.status === "no_show" ? "red" : a.status === "completed" ? "green" : a.status === "arrived" ? "teal" : "gray"}>{a.status.replace("_", " ")}</Badge></Td>
            </tr>
          ))}
        </Table>
        {d.appts.length > 10 && <p className="mt-2 text-xs text-slate-500">+ {d.appts.length - 10} more</p>}
      </Card>
      {sees.queue && (
        <Card title="Queue now" actions={<WidgetLink href="/queue">Queue</WidgetLink>}>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {["waiting", "with_doctor", "lab", "billing", "pharmacy", "done"].map((s) => (
              <li key={s} className="rounded-md bg-slate-50 px-3 py-2"><div className="text-xs text-slate-500">{QUEUE_LABELS[s]}</div><div className="text-xl font-semibold tabular-nums">{queueCount(s)}</div></li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  ));

  add("unsigned", sees.clinical && !practitioner, <UnsignedCard rows={d.unsigned} count={d.unsignedCount} tz={tz} title="Open (unsigned) consultations" />);

  const kpis: [string, ReactNode, string, ReactNode?, boolean?][] = [
    ...(sees.money ? [["Revenue today", money(revenueToday, cur), "/billing"] as [string, ReactNode, string]] : []),
    ...(sees.appts ? [["No-show rate (30 days)", `${pct(d.noShow?.missed ?? 0, d.noShow?.total ?? 0)}%`, "/reports/noshow-practitioner", `${d.noShow?.missed ?? 0} of ${d.noShow?.total ?? 0} appointments`] as [string, ReactNode, string, ReactNode]] : []),
    ...(sees.clinical ? [["Unsigned notes", d.unsignedCount, "/visits", undefined, d.unsignedCount > 0] as [string, ReactNode, string, undefined, boolean]] : []),
    ...(sees.lab ? [["Lab results awaited", d.lab, "/lab"] as [string, ReactNode, string]] : []),
    ...(sees.stock ? [["Low-stock items", d.lowStock, "/pharmacy/inventory", undefined, d.lowStock > 0] as [string, ReactNode, string, undefined, boolean]] : []),
    ...(sees.messages ? [["Unread messages", d.inbox, "/messages", undefined, d.inbox > 0] as [string, ReactNode, string, undefined, boolean]] : []),
  ];

  // Cashiers see money first, practitioners their own work first; everyone else (owners) sees the day first.
  const order = role === "cashier" ? ["money", "today", "practice", "unsigned"] : practitioner ? ["practice", "today", "money", "unsigned"] : ["today", "money", "unsigned", "practice"];
  sections.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return (
    <>
      <PageHeader title={`${greeting}, ${ctx.user.name.split(" ")[0]}`} subtitle={[ctx.tenant.name, ctx.branches.length > 1 ? branchName : null, dateTime(new Date(), tz, { dateStyle: "full" })].filter(Boolean).join(" · ")} />
      {can(role, "settings.manage") && (ctx.access === "read_only" || (trialDays !== null && trialDays <= 14)) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">
          <span>
            {ctx.access === "read_only" ? "Your account is read-only. All your data is still here and exportable."
              : trialDays! > 0 ? `You're on the ${PLANS[ctx.tenant.plan].name} plan trial — ${trialDays} day${trialDays === 1 ? "" : "s"} left. No card needed until you choose a plan.`
              : "Your trial has ended."}
          </span>
          <LinkButton href="/settings/subscription">{ctx.access === "read_only" ? "Renew" : "Choose a plan"}</LinkButton>
        </div>
      )}
      {kpis.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map(([label, value, href, sub, alert]) => (
            <Link key={label} href={href} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-teal-400 focus-visible:outline-2 focus-visible:outline-teal-600">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
              <div className={cx("mt-1 text-2xl font-semibold tabular-nums", alert ? "text-amber-700" : "text-slate-900")}>{value}</div>
              {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
            </Link>
          ))}
        </div>
      )}
      <div className="space-y-4">{sections.map((s) => <div key={s.key}>{s.node}</div>)}</div>
    </>
  );
}

function WidgetLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline">{children} →</Link>;
}

function UnsignedCard({ rows, count, tz, title }: { rows: { id: string; startedAt: string; patient: string; doctor: string | null }[]; count: number; tz: string; title: string }) {
  return (
    <Card title={`${title} (${count})`} actions={<WidgetLink href="/visits">Consultations</WidgetLink>}>
      <ul className="divide-y divide-slate-100 text-sm">
        {rows.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 py-2">
            <Link href={`/visits/${v.id}`} className="font-medium text-teal-800 hover:underline">{v.patient}</Link>
            <span className="text-xs text-slate-500">{v.doctor ? `${v.doctor} · ` : ""}{dateTime(v.startedAt, tz)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-4 text-center text-slate-500">All notes are signed.</li>}
      </ul>
    </Card>
  );
}
