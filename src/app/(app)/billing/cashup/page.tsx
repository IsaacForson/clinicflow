import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowDownLeft, Calculator, ClipboardCheck, HandCoins, Receipt, Undo2, Vault, FileText, Wallet } from "lucide-react";
import { PrintButton } from "@/components/form";
import { Badge, Button, EmptyState, Input, Kpi, PageHeader, Panel, Select, Timeline, Toolbar } from "@/components/ui";
import { branches, cashUps, expenses, invoices, payments, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateOnly, dayRange, localDay, money, timeOnly } from "@/lib/format";
import { saveCashUpAction } from "../actions";
import { dayMoney } from "@/lib/billing/cashup";
import { METHOD_ICON, METHOD_LABEL } from "../methods";
import { DrawerCount } from "./drawer-count";

export const metadata = { title: "Cash-up" };

export default async function CashUpPage({ searchParams }: PageProps<"/billing/cashup">) {
  const ctx = await requireCtx("cashup");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.day)) ? String(sp.day) : localDay(tz);
  const cashier = typeof sp.cashier === "string" && /^[0-9a-f-]{36}$/.test(sp.cashier) ? sp.cashier : null;
  const { start, end } = dayRange(day, tz);
  const inDay = (col: typeof payments.receivedAt | typeof invoices.issuedAt) => sql`${col} >= ${start.toISOString()} and ${col} < ${end.toISOString()}`;

  const d = await tx(ctx, async (t) => {
    const invWhere = and(eq(invoices.branchId, ctx.branchId), inDay(invoices.issuedAt), sql`${invoices.status} <> 'void'`);
    return {
      branch: (await t.select({ name: branches.name }).from(branches).where(eq(branches.id, ctx.branchId)))[0]?.name,
      money: await dayMoney(t, { branchId: ctx.branchId, start, end, cashier }),
      cashiers: await t.selectDistinct({ id: users.id, name: users.name }).from(payments).innerJoin(users, eq(users.id, payments.receivedBy))
        .where(and(eq(payments.branchId, ctx.branchId), inDay(payments.receivedAt))),
      issued: (await t.select({
        n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${invoices.totalMinor}), 0)::int`,
        outstanding: sql<number>`coalesce(sum(${invoices.patientPortionMinor} - ${invoices.paidMinor}), 0)::int`,
        insurer: sql<number>`coalesce(sum(${invoices.insurerPortionMinor} - ${invoices.insurerPaidMinor}), 0)::int`,
      }).from(invoices).where(invWhere))[0],
      expenses: await t.select().from(expenses).where(and(eq(expenses.branchId, ctx.branchId), eq(expenses.day, day))).orderBy(expenses.createdAt),
      saved: await t.select({ c: cashUps, by: users.name }).from(cashUps).leftJoin(users, eq(users.id, cashUps.userId))
        .where(and(eq(cashUps.branchId, ctx.branchId), eq(cashUps.day, day))).orderBy(desc(cashUps.createdAt)),
    };
  });
  const byMethod = d.money.received;
  const refundedTotal = d.money.refunded.filter((r) => r.method !== "deposit" && r.method !== "insurance").reduce((s, r) => s + r.total, 0);
  const cashExpenses = d.expenses.filter((e) => e.method === "cash").reduce((s, e) => s + e.amountMinor, 0);
  const allExpenses = d.expenses.reduce((s, e) => s + e.amountMinor, 0);
  const newMoney = byMethod.filter((r) => r.method !== "deposit" && r.method !== "insurance").reduce((s, r) => s + r.total, 0) - refundedTotal;
  const expectedCash = d.money.cashIn - d.money.cashRefunded - cashExpenses;

  const maxMethod = Math.max(...byMethod.map((r) => r.total), 1);

  return (
    <>
      <PageHeader title="Daily cash-up" eyebrow="Closing the drawer" icon={<Calculator />}
        subtitle={`${d.branch ?? ""} · ${dateOnly(start, tz)}${cashier ? ` · ${d.cashiers.find((c) => c.id === cashier)?.name ?? ""}` : ""}`}
        actions={<PrintButton />} />
      <form className="print:hidden">
        <Toolbar>
          <Input type="date" name="day" defaultValue={day} className="w-44" aria-label="Day" />
          <Select name="cashier" defaultValue={cashier ?? ""} className="w-52" aria-label="Cashier">
            <option value="">All cashiers</option>
            {d.cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Show</Button>
        </Toolbar>
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Money received" value={money(newMoney, cur)} sub={refundedTotal ? `after ${money(refundedTotal, cur)} refunds` : "excl. credit applied & insurer"} icon={<HandCoins />} tone="green" />
        <Kpi label="Invoices issued" value={money(d.issued.total, cur)} sub={`${d.issued.n} invoices`} icon={<FileText />} />
        <Kpi label="Outstanding from today" value={money(d.issued.outstanding, cur)} sub={`+ ${money(d.issued.insurer, cur)} insurer`} icon={<Wallet />} tone="yellow" />
        <Kpi label="Net cash" value={money(expectedCash, cur)} sub="cash in − cash refunds − cash expenses" icon={<Vault />} tone="teal" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Money in by method" eyebrow="Payments" icon={<ArrowDownLeft />}>
            {byMethod.length === 0 && d.money.refunded.length === 0 ? (
              <EmptyState icon={<HandCoins />} title="No payments on this day" compact>Payments taken at the desk show up here as they happen.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {byMethod.map((r) => {
                  const M = METHOD_ICON[r.method]?.icon ?? Wallet;
                  return (
                    <li key={r.method} className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-muted"><M className="h-4 w-4" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium text-fg">{METHOD_LABEL[r.method]} <span className="text-xs font-normal text-subtle">· {r.n}</span></span>
                          <span className="font-semibold tabular-nums text-fg">{money(r.total, cur)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-aurora" style={{ width: `${(r.total / maxMethod) * 100}%` }} /></div>
                      </div>
                    </li>
                  );
                })}
                {d.money.refunded.map((r) => (
                  <li key={`r-${r.method}`} className="flex items-center gap-3 rounded-xl border border-bad/25 bg-bad/5 px-3 py-2">
                    <Undo2 className="h-4 w-4 text-bad" aria-hidden />
                    <span className="flex-1 text-sm text-fg">Refunded · {METHOD_LABEL[r.method]} <span className="text-xs text-subtle">· {r.n}</span></span>
                    <span className="font-semibold tabular-nums text-bad">−{money(r.total, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Expenses" eyebrow="Paid out" icon={<Receipt />}
            actions={<span className="text-right text-xs text-muted"><span className="block text-sm font-semibold tabular-nums text-fg">{money(allExpenses, cur)}</span>cash {money(cashExpenses, cur)}</span>}>
            {d.expenses.length === 0 ? (
              <EmptyState icon={<Receipt />} title="No expenses recorded" compact>Record money paid out from the drawer under Expenses.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {d.expenses.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0"><div className="truncate font-medium text-fg">{e.category}</div><div className="truncate text-xs text-muted">{[e.paidTo, METHOD_LABEL[e.method]].filter(Boolean).join(" · ")}</div></div>
                    <span className="tabular-nums text-fg">{money(e.amountMinor, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {!cashier && ctx.access === "full" && (
            <Panel title="Count the drawer" eyebrow="Expected vs counted" icon={<Vault />} glow className="print:hidden">
              <DrawerCount action={saveCashUpAction} day={day} expectedMinor={expectedCash} currency={cur} />
            </Panel>
          )}
          <Panel title="Saved cash-ups" icon={<ClipboardCheck />}>
            {d.saved.length === 0 ? (
              <EmptyState icon={<ClipboardCheck />} title="Not counted yet" compact>Count the drawer at close to save today&apos;s cash-up.</EmptyState>
            ) : (
              <Timeline items={d.saved.map(({ c, by }) => ({
                id: c.id, tone: c.varianceMinor < 0 ? "red" : c.varianceMinor > 0 ? "yellow" : "green",
                title: <span className="flex flex-wrap items-center gap-2"><span className="tabular-nums">{money(c.countedCashMinor, cur)}</span>
                  <Badge tone={c.varianceMinor < 0 ? "red" : c.varianceMinor > 0 ? "yellow" : "green"}>{c.varianceMinor === 0 ? "balanced" : <span className="tabular-nums">{money(c.varianceMinor, cur)}</span>}</Badge></span>,
                meta: `${timeOnly(c.createdAt, tz)} · ${by ?? ""}`,
                body: c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : undefined,
              }))} />
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
