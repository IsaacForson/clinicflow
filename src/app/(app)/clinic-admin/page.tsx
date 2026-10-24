import {
  Banknote, CalendarX2, ClipboardList, Clock, CreditCard, FileText, Gem, HandCoins, Landmark, Percent, PieChart, Receipt, Scale,
  ShieldCheck, Stethoscope, TrendingUp, UserPlus, Users, Wallet,
} from "lucide-react";
import { A, Badge, BarChart, Dl, Kpi, LinkButton, Panel, Progress } from "@/components/ui";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, localDay, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { PLANS } from "@/lib/plans";
import { pct } from "../reports/range";
import { delta, deltaPts, monthLabel, pickBranch, resolvePeriod } from "./lib";
import { overview, usage } from "./queries";
import { ConsoleHeader, ShareList } from "./ui";

export const metadata = { title: "Admin console" };
const STATUS_TONE = { trialing: "blue", active: "green", past_due: "yellow", read_only: "red", cancelled: "gray" } as const;

export default async function ClinicAdminPage({ searchParams }: PageProps<"/clinic-admin">) {
  const ctx = await requireCtx("admin.console");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const fmt = (v: number) => money(v, cur);
  const period = resolvePeriod(sp.period, tz);
  const branch = pickBranch(sp.branch, ctx.branches.map((b) => b.id));
  const branchIds = branch ? [branch] : ctx.branches.map((b) => b.id);
  const monthFrom = `${localDay(tz).slice(0, 7)}-01`;

  const { d, u } = await tx(ctx, async (t) => {
    await audit(t, ctx, "view", "clinic_admin", null, { details: { page: "overview", period: period.key, branch } });
    return { d: await overview(t, ctx, { branchIds, period }), u: await usage(t, ctx, monthFrom) };
  });

  const { money: m, billed, ops, months, rates } = d;
  const vs = period.vs;
  const perVisit = ops.visits ? Math.round(m.collected / ops.visits) : 0;
  const prevPerVisit = ops.prevVisits ? Math.round(m.prevCollected / ops.prevVisits) : 0;
  const net = m.collected - d.expenses.cur, prevNet = m.prevCollected - d.expenses.prev;
  const margin = pct(net, m.collected);
  const monthly = (i: number) => months.collected[i] - months.expenses[i];
  const plan = PLANS[ctx.tenant.plan];
  const t = ctx.tenant;
  const branchName = branch ? ctx.branches.find((b) => b.id === branch)?.name : "All branches";

  return (
    <>
      <ConsoleHeader ctx={ctx} current="overview" period={period.key} branch={branch}
        subtitle={`${branchName} · ${dateOnly(period.start, tz)} – ${dateOnly(new Date(period.end.getTime() - 1), tz)} · how the business is doing`} />

      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Revenue">
          <Kpi label="Revenue collected" value={fmt(m.collected)} icon={<Banknote />} tone="purple" trend={months.collected} href="/reports/revenue-day"
            delta={delta(m.collected, m.prevCollected, vs)} sub={!m.prevCollected ? "no earlier data" : undefined} />
          <Kpi label="Invoiced" value={fmt(billed.invoiced)} icon={<Receipt />} tone="blue" trend={months.invoiced} href="/reports/issued-collected"
            delta={delta(billed.invoiced, billed.prevInvoiced, vs)} />
          <Kpi label="Collection rate" value={`${rates.collection}%`} icon={<Percent />} tone={rates.collection >= 80 ? "green" : "yellow"}
            trend={months.patientBilled.map((b, i) => pct(months.patientCollected[i], b))}
            delta={deltaPts(rates.collection, rates.prevCollection, vs)} sub={`of ${fmt(billed.patientBilled)} billed to patients`} />
          <Kpi label="Revenue per visit" value={fmt(perVisit)} icon={<Stethoscope />} tone="teal"
            trend={months.visits.map((v, i) => (v ? Math.round(months.collected[i] / v) : 0))} delta={delta(perVisit, prevPerVisit, vs)} sub={`${ops.visits} visits`} />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Balances and profit">
          <Kpi label="Patients owe" value={fmt(d.balances.patientOwes)} icon={<Wallet />} tone="yellow" href="/reports/aging" sub={`${d.balances.debtors} patients · today`} />
          <Kpi label="Insurers owe" value={fmt(d.balances.insurerOwes)} icon={<Landmark />} tone="blue" href="/insurance" sub="unpaid insurer share · today" />
          <Kpi label="Expenses" value={fmt(d.expenses.cur)} icon={<HandCoins />} tone="red" trend={months.expenses} delta={delta(d.expenses.cur, d.expenses.prev, vs, true)} />
          <Kpi label="Net" value={fmt(net)} icon={<Scale />} tone={net >= 0 ? "green" : "red"} trend={months.labels.map((_, i) => monthly(i))}
            delta={prevNet > 0 ? delta(net, prevNet, vs) : undefined} sub={m.collected ? `${margin}% margin` : "collected − expenses"} />
        </section>

        <section className="grid gap-4 xl:grid-cols-12">
          <Panel className="xl:col-span-8" title="Revenue collected" eyebrow="Last 12 months" icon={<TrendingUp />}
            actions={<LinkButton href="/reports/revenue-day" variant="ghost" size="sm">Daily report</LinkButton>}>
            <BarChart data={months.labels.map((l, i) => ({ label: monthLabel(l), value: months.collected[i] }))} format={fmt} height={200} />
          </Panel>

          <Panel className="xl:col-span-4" title={`${plan.name} plan`} eyebrow="Subscription & usage" icon={<Gem />}
            actions={<Badge tone={STATUS_TONE[t.planStatus]}>{t.planStatus.replace("_", " ")}</Badge>}>
            <p className="mb-4 text-sm text-muted">
              {t.planStatus === "trialing" && t.trialEndsAt ? `Trial ends ${dateOnly(t.trialEndsAt, tz)}`
                : t.currentPeriodEnd ? `${t.planStatus === "cancelled" ? "Ended" : "Renews"} ${dateOnly(t.currentPeriodEnd, tz)} · ${t.billingCycle}` : "No billing period yet"}
            </p>
            <ul className="space-y-3">
              {([
                ["Staff accounts", u.users, plan.users],
                ["Practitioners", u.practitioners, plan.practitioners],
                ["Branches", u.branches, plan.branches],
                ["AI scribe seats", u.scribe, t.scribeSeats],
                ["Reminders this month", u.reminders, plan.reminders],
              ] as const).map(([label, used, limit]) => (
                <li key={label}>
                  <div className="flex justify-between text-sm"><span className="text-muted">{label}</span>
                    <span className="tabular-nums text-fg">{used} <span className="text-subtle">/ {limit || "none"}</span></span></div>
                  <Progress value={limit ? (used / limit) * 100 : used ? 100 : 0} tone={limit && used >= limit ? "red" : limit && used / limit >= 0.8 ? "yellow" : "purple"} className="mt-1.5" />
                </li>
              ))}
            </ul>
            {can(ctx.user.role, "subscription.manage")
              ? <LinkButton href="/settings/subscription" variant="secondary" size="sm" className="mt-5 w-full">Manage plan</LinkButton>
              : <p className="mt-5 text-xs text-subtle">Plan changes are made by the clinic owner.</p>}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Revenue mix">
          <Panel title="By payment method" eyebrow="Collected" icon={<CreditCard />}>
            <ShareList rows={d.mix.methods} format={fmt} empty="No payments in this period" meta={(i) => `${d.mix.methods[i].n} payments`} />
          </Panel>
          <Panel title="By payer" eyebrow="Collected" icon={<PieChart />}>
            <ShareList rows={d.mix.payers} format={fmt} tone="teal" empty="No payments in this period" meta={(i) => `${d.mix.payers[i].n} payments`} />
          </Panel>
          <Panel title="Top services" eyebrow="Billed" icon={<ClipboardList />} actions={<A href="/reports/revenue-service" className="text-xs">All services</A>}>
            <ShareList rows={d.mix.services} format={fmt} tone="blue" empty="No services billed in this period" meta={(i) => `${d.mix.services[i].qty} sold`} />
          </Panel>
          <Panel title="By practitioner" eyebrow="Billed" icon={<Users />} actions={<A href="/reports/revenue-practitioner" className="text-xs">Full report</A>}>
            <ShareList rows={d.mix.practitioners} format={fmt} tone="green" empty="No invoices in this period" meta={(i) => `${d.mix.practitioners[i].invoices} invoices`} />
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Operations" eyebrow={period.label} icon={<Clock />}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Mini icon={<Users />} label="Patients" value={d.patients.total.toLocaleString("en")} sub="clinic-wide" />
              <Mini icon={<UserPlus />} label="New patients" value={d.patients.fresh} sub={delta(d.patients.fresh, d.patients.prevFresh, "vs before")?.value ?? "registered"} />
              <Mini icon={<Stethoscope />} label="Visits" value={ops.visits} sub={delta(ops.visits, ops.prevVisits, "vs before")?.value ?? "consultations"} />
              <Mini icon={<TrendingUp />} label="Visits per day" value={(ops.visits / period.days).toFixed(1)} sub={`over ${period.days} days`} />
              <Mini icon={<CalendarX2 />} label="No-show rate" value={`${rates.noShow}%`} sub={`${ops.noShows} of ${ops.appts} appointments`} bad={rates.noShow > 15} />
              <Mini icon={<Clock />} label="Average wait" value={ops.waitMin !== null ? `${Math.round(ops.waitMin)} min` : "—"}
                sub={ops.waitMin !== null && ops.prevWaitMin !== null ? `was ${Math.round(ops.prevWaitMin)} min` : "queue check-in to called"} />
            </div>
          </Panel>

          <Panel title="Insurance" eyebrow="Claims & receivables" icon={<ShieldCheck />} actions={<A href="/insurance" className="text-xs">Open insurance</A>}>
            <Dl cols={3} items={[
              ["Claims submitted", `${d.insurance.claims.claims} · ${fmt(d.insurance.claims.claimed)}`],
              ["Paid so far", fmt(d.insurance.claims.paid)],
              ["Rejection rate", d.insurance.claims.decided ? `${rates.rejection}% of ${d.insurance.claims.decided}` : "—"],
            ]} />
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Owed by insurer · today</div>
              <ShareList rows={d.insurance.receivables} format={fmt} tone="blue" empty="No insurer balances outstanding" meta={(i) => `${d.insurance.receivables[i].invoices} invoices`} />
            </div>
          </Panel>
        </section>

        <p className="flex items-center gap-2 text-xs text-subtle"><FileText className="h-3.5 w-3.5" aria-hidden />
          Collected excludes refunds and deposit applications. Collection rate compares patient payments with the patient share billed in the same period.
        </p>
      </div>
    </>
  );
}

function Mini({ icon, label, value, sub, bad }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}{label}</div>
      <div className={bad ? "mt-1.5 text-xl font-semibold tabular-nums text-bad" : "mt-1.5 text-xl font-semibold tabular-nums text-fg"}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}
