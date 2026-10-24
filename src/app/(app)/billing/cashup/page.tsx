import { and, desc, eq, sql } from "drizzle-orm";
import { ActionForm, PrintButton, Submit } from "@/components/form";
import { Button, Card, Field, Input, PageHeader, Select, Stat, Table, Td, Textarea } from "@/components/ui";
import { branches, cashUps, expenses, invoices, payments, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateOnly, dayRange, localDay, money, timeOnly } from "@/lib/format";
import { saveCashUpAction } from "../actions";
import { METHOD_LABEL } from "../methods";

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
    const payWhere = and(eq(payments.branchId, ctx.branchId), eq(payments.status, "succeeded"), inDay(payments.receivedAt), cashier ? eq(payments.receivedBy, cashier) : undefined);
    const invWhere = and(eq(invoices.branchId, ctx.branchId), inDay(invoices.issuedAt), sql`${invoices.status} <> 'void'`);
    return {
      branch: (await t.select({ name: branches.name }).from(branches).where(eq(branches.id, ctx.branchId)))[0]?.name,
      byMethod: await t.select({ method: payments.method, total: sql<number>`sum(${payments.amountMinor})::int`, n: sql<number>`count(*)::int` })
        .from(payments).where(payWhere).groupBy(payments.method),
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
  const get = (m: string) => d.byMethod.find((r) => r.method === m)?.total ?? 0;
  const cashExpenses = d.expenses.filter((e) => e.method === "cash").reduce((s, e) => s + e.amountMinor, 0);
  const allExpenses = d.expenses.reduce((s, e) => s + e.amountMinor, 0);
  const newMoney = d.byMethod.filter((r) => r.method !== "deposit" && r.method !== "insurance").reduce((s, r) => s + r.total, 0);
  const expectedCash = get("cash") - cashExpenses;

  return (
    <>
      <PageHeader title="Daily cash-up" subtitle={`${d.branch ?? ""} · ${dateOnly(start, tz)}${cashier ? ` · ${d.cashiers.find((c) => c.id === cashier)?.name ?? ""}` : ""}`}
        actions={<PrintButton />} />
      <form className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Input type="date" name="day" defaultValue={day} className="w-44" aria-label="Day" />
        <Select name="cashier" defaultValue={cashier ?? ""} className="w-52" aria-label="Cashier">
          <option value="">All cashiers</option>
          {d.cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Show</Button>
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Money received" value={money(newMoney, cur)} sub="excl. credit applied & insurer" />
        <Stat label="Invoices issued" value={money(d.issued.total, cur)} sub={`${d.issued.n} invoices`} />
        <Stat label="Outstanding from today" value={money(d.issued.outstanding, cur)} sub={`+ ${money(d.issued.insurer, cur)} insurer`} />
        <Stat label="Net cash" value={money(expectedCash, cur)} sub="cash in − cash expenses" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payments by method">
          <Table head={["Method", "Count", "Total"]} empty="No payments today.">
            {d.byMethod.map((r) => <tr key={r.method}><Td>{METHOD_LABEL[r.method]}</Td><Td>{r.n}</Td><Td>{money(r.total, cur)}</Td></tr>)}
          </Table>
        </Card>
        <Card title="Expenses">
          <Table head={["Category", "Paid to", "Method", "Amount"]} empty="No expenses recorded.">
            {d.expenses.map((e) => <tr key={e.id}><Td>{e.category}</Td><Td>{e.paidTo}</Td><Td>{METHOD_LABEL[e.method]}</Td><Td>{money(e.amountMinor, cur)}</Td></tr>)}
          </Table>
          <p className="mt-2 text-right text-sm font-medium">Total {money(allExpenses, cur)} (cash {money(cashExpenses, cur)})</p>
        </Card>
        {!cashier && ctx.access === "full" && (
          <Card title="Count the drawer" className="print:hidden">
            <ActionForm action={saveCashUpAction}>
              <input type="hidden" name="day" value={day} />
              <p className="text-sm text-slate-600">Expected cash in drawer: <strong>{money(expectedCash, cur)}</strong></p>
              <Field label="Counted cash"><Input name="counted" inputMode="decimal" required /></Field>
              <Field label="Notes"><Textarea name="notes" placeholder="Explain any difference" /></Field>
              <Submit>Save cash-up</Submit>
            </ActionForm>
          </Card>
        )}
        <Card title="Saved cash-ups">
          <Table head={["Time", "By", "Counted", "Variance", "Notes"]} empty="Not counted yet.">
            {d.saved.map(({ c, by }) => (
              <tr key={c.id}>
                <Td>{timeOnly(c.createdAt, tz)}</Td><Td>{by}</Td><Td>{money(c.countedCashMinor, cur)}</Td>
                <Td className={c.varianceMinor < 0 ? "text-red-700" : c.varianceMinor > 0 ? "text-amber-700" : "text-emerald-700"}>{money(c.varianceMinor, cur)}</Td>
                <Td className="whitespace-normal">{c.notes}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
