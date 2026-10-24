import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Banknote, Building2, Calculator, CreditCard, Download, FileText, HandCoins, Plus, Receipt, Search, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { A, Avatar, Badge, Button, cx, EmptyState, Input, Kpi, LinkButton, PageHeader, Panel, Progress, Table, Tabs, Td, Toolbar } from "@/components/ui";
import { invoices, patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, dayRange, fullName, localDay, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { STATUS_TONE } from "./methods";

export const metadata = { title: "Billing" };

const STATUSES = ["draft", "issued", "partially_paid", "paid", "void"] as const;

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const ctx = await requireCtx("billing.read");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const q = String(sp.q ?? "").trim();
  const status = STATUSES.find((s) => s === sp.status);
  const unpaid = sp.unpaid === "1";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.to)) ? String(sp.to) : localDay(tz);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.from)) ? String(sp.from) : addDays(to, -30);

  const conds: (SQL | undefined)[] = [
    sql`${invoices.createdAt} >= ${dayRange(from, tz).start.toISOString()}`, sql`${invoices.createdAt} < ${dayRange(to, tz).end.toISOString()}`,
    status ? eq(invoices.status, status) : undefined,
    unpaid ? inArray(invoices.status, ["issued", "partially_paid"]) : undefined,
  ];
  if (q) {
    const like = `%${q}%`;
    conds.push(or(ilike(invoices.invoiceNo, like), ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like)));
  }
  const where = and(...conds);
  const { rows, totals } = await tx(ctx, async (t) => ({
    rows: await t.select({ i: invoices, p: { id: patients.id, firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo } })
      .from(invoices).innerJoin(patients, eq(patients.id, invoices.patientId)).where(where).orderBy(desc(invoices.createdAt)).limit(200),
    totals: (await t.select({
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${invoices.totalMinor}) filter (where ${invoices.status} <> 'void'), 0)::int`,
      paid: sql<number>`coalesce(sum(${invoices.paidMinor} + ${invoices.insurerPaidMinor}) filter (where ${invoices.status} <> 'void'), 0)::int`,
      patientDue: sql<number>`coalesce(sum(${invoices.patientPortionMinor} - ${invoices.paidMinor}) filter (where ${invoices.status} in ('issued','partially_paid')), 0)::int`,
      insurerDue: sql<number>`coalesce(sum(${invoices.insurerPortionMinor} - ${invoices.insurerPaidMinor}) filter (where ${invoices.status} not in ('void','draft')), 0)::int`,
    }).from(invoices).innerJoin(patients, eq(patients.id, invoices.patientId)).where(where))[0],
  }));

  const qs = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ ...(q && { q }), from, to });
    for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
    return `/billing?${u}`;
  };
  const current = unpaid ? "unpaid" : status ?? "all";
  const collectedPct = totals.total ? (totals.paid / totals.total) * 100 : 0;

  return (
    <>
      <PageHeader title="Billing" eyebrow="Money" icon={<CreditCard />} subtitle="Invoices, payments and the day's cash."
        actions={<>
          {can(ctx.user.role, "payments.receive") && <LinkButton variant="secondary" href="/billing/deposit"><Wallet className="h-4 w-4" aria-hidden />Take deposit</LinkButton>}
          {can(ctx.user.role, "billing.write") && <LinkButton href="/billing/new"><Plus className="h-4 w-4" aria-hidden />New invoice</LinkButton>}
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Billed" value={money(totals.total, cur)} sub={`${totals.n} invoices · ${dateOnly(dayRange(from, tz).start, tz)} – ${dateOnly(dayRange(to, tz).start, tz)}`} icon={<FileText />} />
        <Kpi label="Collected" value={money(totals.paid, cur)} sub={<span className="flex w-full items-center gap-2"><Progress value={collectedPct} tone="green" className="flex-1" /><span className="tabular-nums">{Math.round(collectedPct)}%</span></span>} icon={<HandCoins />} tone="green" />
        <Kpi label="Patients owe" value={money(totals.patientDue, cur)} sub="open patient balances" icon={<Banknote />} tone="yellow" href={qs({ unpaid: "1" })} />
        <Kpi label="Insurers owe" value={money(totals.insurerDue, cur)} sub="unpaid insurer share" icon={<ShieldCheck />} tone="blue" />
      </div>

      <nav aria-label="Billing tools" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          can(ctx.user.role, "cashup") && { href: "/billing/cashup", label: "Cash-up", sub: "Close the drawer", icon: Calculator },
          can(ctx.user.role, "expenses.manage") && { href: "/billing/expenses", label: "Expenses", sub: "Money paid out", icon: Receipt },
          can(ctx.user.role, "payments.receive") && { href: "/billing/deposit", label: "Deposits", sub: "Credit on account", icon: Wallet },
          { href: "/billing/export", label: "Export", sub: "QuickBooks / Zoho", icon: Download },
        ].filter((x): x is { href: string; label: string; sub: string; icon: typeof Download } => !!x).map((x) => (
          <Link key={x.href} href={x.href} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition hover:-translate-y-px hover:border-line-strong hover:bg-surface-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-muted transition group-hover:text-accent"><x.icon className="h-[18px] w-[18px]" aria-hidden /></span>
            <span className="min-w-0"><span className="block text-sm font-medium text-fg">{x.label}</span><span className="block truncate text-xs text-subtle">{x.sub}</span></span>
          </Link>
        ))}
      </nav>

      <Tabs current={current} tabs={[
        { key: "all", label: "All", href: qs({}) },
        { key: "unpaid", label: "Unpaid", href: qs({ unpaid: "1" }) },
        ...STATUSES.map((s) => ({ key: s, label: <span className="capitalize">{s.replace("_", " ")}</span>, href: qs({ status: s }) })),
      ]} />
      <form>
        <Toolbar>
          {status && <input type="hidden" name="status" value={status} />}
          {unpaid && <input type="hidden" name="unpaid" value="1" />}
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Patient or invoice no…" className="pl-10" aria-label="Search invoices" />
          </div>
          <Input type="date" name="from" defaultValue={from} aria-label="From" className="w-auto" />
          <span className="text-subtle" aria-hidden>→</span>
          <Input type="date" name="to" defaultValue={to} aria-label="To" className="w-auto" />
          <Button type="submit" variant="secondary">Apply</Button>
        </Toolbar>
      </form>

      <Panel bodyClassName="px-5 pb-2 pt-4">
        {rows.length === 0 ? (
          <EmptyState icon={<FileText />} title="No invoices match">
            {q || status || unpaid ? <>Try a wider date range or <A href="/billing">clear the filters</A>.</> : "Invoices created at checkout or from a visit show up here."}
          </EmptyState>
        ) : (
          <Table head={["Invoice", "Patient", "Date", "Total", "Insurer due", "Patient balance", "Status"]}>
            {rows.map(({ i, p }) => {
              const bal = i.status === "void" ? 0 : i.patientPortionMinor - i.paidMinor;
              const pct = i.totalMinor ? ((i.paidMinor + i.insurerPaidMinor) / i.totalMinor) * 100 : 0;
              return (
                <tr key={i.id} className={cx(i.status === "void" && "opacity-60")}>
                  <Td><Link href={`/billing/${i.id}`} className="font-mono text-xs font-medium text-accent hover:underline underline-offset-4">{i.invoiceNo}</Link></Td>
                  <Td>
                    <Link href={`/patients/${p.id}`} className="group flex items-center gap-2.5">
                      <Avatar name={fullName(p)} size="sm" />
                      <span><span className="block text-sm font-medium text-fg group-hover:text-accent">{fullName(p)}</span><span className="block font-mono text-[11px] text-subtle">{p.patientNo}</span></span>
                    </Link>
                  </Td>
                  <Td className="text-muted">{dateOnly(i.createdAt, tz)}</Td>
                  <Td className="tabular-nums">{money(i.totalMinor, cur)}</Td>
                  <Td className="tabular-nums text-muted">{i.insurerPortionMinor ? <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-subtle" aria-hidden />{money(i.insurerPortionMinor - i.insurerPaidMinor, cur)}</span> : <span className="text-subtle">—</span>}</Td>
                  <Td>
                    <div className="w-36">
                      <div className={cx("text-sm font-semibold tabular-nums", bal > 0 ? "text-fg" : "text-subtle")}>{money(bal, cur)}</div>
                      <Progress value={pct} tone={pct >= 100 ? "green" : "purple"} className="mt-1.5" />
                    </div>
                  </Td>
                  <Td><Badge tone={STATUS_TONE[i.status]}>{i.status.replace("_", " ")}</Badge></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}
