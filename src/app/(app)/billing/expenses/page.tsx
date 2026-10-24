import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Button, Card, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { expenses } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { localDay, money, toMajor } from "@/lib/format";
import { deleteExpenseAction, saveExpenseAction } from "../actions";
import { METHOD_LABEL } from "../methods";

export const metadata = { title: "Expenses" };
const CATEGORIES = ["Rent", "Salaries", "Utilities", "Supplies", "Drugs / stock", "Lab reagents", "Fuel / transport", "Repairs", "Internet / phone", "Cleaning", "Bank charges", "Other"];

export default async function ExpensesPage({ searchParams }: PageProps<"/billing/expenses">) {
  const ctx = await requireCtx("expenses.manage");
  const sp = await searchParams;
  const cur = ctx.tenant.currency;
  const today = localDay(ctx.tenant.timezone);
  const month = /^\d{4}-\d{2}$/.test(String(sp.month)) ? String(sp.month) : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const editId = typeof sp.edit === "string" ? sp.edit : null;
  const where = and(eq(expenses.branchId, ctx.branchId), gte(expenses.day, `${month}-01`), lt(expenses.day, `${next}-01`));
  const d = await tx(ctx, async (t) => ({
    rows: await t.select().from(expenses).where(where).orderBy(desc(expenses.day), desc(expenses.createdAt)),
    byCat: await t.select({ category: expenses.category, total: sql<number>`sum(${expenses.amountMinor})::int` }).from(expenses).where(where).groupBy(expenses.category).orderBy(sql`2 desc`),
  }));
  const edit = editId ? d.rows.find((r) => r.id === editId) : undefined;
  const total = d.byCat.reduce((s, c) => s + c.total, 0);

  return (
    <>
      <PageHeader title="Expenses" subtitle="Money paid out by this branch." />
      <form className="mb-4 flex gap-2"><Input type="month" name="month" defaultValue={month} className="w-44" aria-label="Month" /><Button type="submit" variant="secondary">Show</Button></form>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={`Expenses · ${month}`}>
            <Table head={["Day", "Category", "Description", "Paid to", "Method", "Amount", ""]} empty="No expenses this month.">
              {d.rows.map((e) => (
                <tr key={e.id}>
                  <Td>{e.day}</Td><Td>{e.category}</Td><Td className="max-w-xs truncate">{e.description}</Td><Td>{e.paidTo}</Td>
                  <Td>{METHOD_LABEL[e.method]}</Td><Td>{money(e.amountMinor, cur)}</Td>
                  <Td className="space-x-1">
                    <Link className="text-xs text-brand-800 hover:underline" href={`/billing/expenses?month=${month}&edit=${e.id}`}>Edit</Link>
                    <ActionButton action={deleteExpenseAction} fields={{ id: e.id }} variant="ghost" confirm="Delete this expense?">Delete</ActionButton>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title={edit ? "Edit expense" : "Add expense"} actions={edit && <LinkButton variant="ghost" href={`/billing/expenses?month=${month}`}>Cancel</LinkButton>}>
            <ActionForm action={saveExpenseAction} resetOnSuccess={!edit} key={edit?.id ?? "new"}>
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <Field label="Category">
                <Input name="category" list="expense-cats" defaultValue={edit?.category} required />
                <datalist id="expense-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Amount"><Input name="amount" inputMode="decimal" defaultValue={edit ? toMajor(edit.amountMinor) : ""} required /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Method">
                  <Select name="method" defaultValue={edit?.method ?? "cash"}>
                    {["cash", "mobile_money", "card", "bank"].map((x) => <option key={x} value={x}>{METHOD_LABEL[x]}</option>)}
                  </Select>
                </Field>
                <Field label="Day"><Input type="date" name="day" defaultValue={edit?.day ?? today} required /></Field>
              </div>
              <Field label="Paid to"><Input name="paidTo" defaultValue={edit?.paidTo ?? ""} /></Field>
              <Field label="Description"><Input name="description" defaultValue={edit?.description ?? ""} /></Field>
              <Submit>{edit ? "Save changes" : "Add expense"}</Submit>
            </ActionForm>
          </Card>
          <Card title="Totals by category">
            <Table head={["Category", "Total"]} empty="—">
              {d.byCat.map((c) => <tr key={c.category}><Td>{c.category}</Td><Td>{money(c.total, cur)}</Td></tr>)}
            </Table>
            <p className="mt-2 text-right text-sm font-semibold">Month total {money(total, cur)}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
