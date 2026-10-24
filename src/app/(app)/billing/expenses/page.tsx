import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { ChevronLeft, ChevronRight, PieChart, Plus, Receipt, Pencil } from "lucide-react";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Button, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select, Table, Td, Toolbar } from "@/components/ui";
import { expenses } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateOnly, localDay, money, toMajor } from "@/lib/format";
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

  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title="Expenses" eyebrow="Money out" icon={<Receipt />} subtitle="Money paid out by this branch." />
      <Toolbar>
        <LinkButton variant="secondary" href={`/billing/expenses?month=${prev}`} aria-label="Previous month" className="w-10 px-0"><ChevronLeft className="h-4 w-4" aria-hidden /></LinkButton>
        <form className="flex gap-2"><Input type="month" name="month" defaultValue={month} className="w-44" aria-label="Month" /><Button type="submit" variant="secondary">Show</Button></form>
        <LinkButton variant="secondary" href={`/billing/expenses?month=${next}`} aria-label="Next month" className="w-10 px-0"><ChevronRight className="h-4 w-4" aria-hidden /></LinkButton>
      </Toolbar>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Panel title={monthLabel} eyebrow="Month total" icon={<PieChart />}
            actions={<span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums text-fg">{money(total, cur)}</span>}>
            {d.byCat.length === 0 ? (
              <EmptyState icon={<PieChart />} title="Nothing spent this month" compact>Add an expense to see where the money goes.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {d.byCat.map((c) => (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-fg">{c.category}</span>
                      <span className="tabular-nums text-fg">{money(c.total, cur)} <span className="ml-1 text-xs text-subtle">{Math.round((c.total / (total || 1)) * 100)}%</span></span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-aurora" style={{ width: `${(c.total / (d.byCat[0]?.total || 1)) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="All expenses" eyebrow={`${d.rows.length} entries`} icon={<Receipt />} bodyClassName="px-5 pb-2 pt-4">
            {d.rows.length === 0 ? (
              <EmptyState icon={<Receipt />} title="No expenses this month">Use the form to record rent, salaries, supplies and other money paid out.</EmptyState>
            ) : (
              <Table head={["Day", "Category", "Paid to", "Method", "Amount", ""]}>
                {d.rows.map((e) => (
                  <tr key={e.id}>
                    <Td className="text-muted">{dateOnly(new Date(`${e.day}T12:00:00Z`), "UTC")}</Td>
                    <Td><div className="font-medium">{e.category}</div>{e.description && <div className="max-w-xs truncate text-xs text-muted">{e.description}</div>}</Td>
                    <Td className="text-muted">{e.paidTo || <span className="text-subtle">—</span>}</Td>
                    <Td className="text-muted">{METHOD_LABEL[e.method]}</Td>
                    <Td className="font-semibold tabular-nums">{money(e.amountMinor, cur)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <LinkButton variant="ghost" size="sm" href={`/billing/expenses?month=${month}&edit=${e.id}`}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</LinkButton>
                        <ActionButton action={deleteExpenseAction} fields={{ id: e.id }} variant="ghost" confirm="Delete this expense?">Delete</ActionButton>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel title={edit ? "Edit expense" : "Add expense"} icon={edit ? <Pencil /> : <Plus />} glow={!edit} actions={edit && <LinkButton variant="ghost" size="sm" href={`/billing/expenses?month=${month}`}>Cancel</LinkButton>}>
            <ActionForm action={saveExpenseAction} resetOnSuccess={!edit} key={edit?.id ?? "new"} className="space-y-4">
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <Field label="Amount">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-subtle">{cur}</span>
                  <Input name="amount" inputMode="decimal" defaultValue={edit ? toMajor(edit.amountMinor) : ""} required placeholder="0.00" className="h-12 pl-14 text-xl font-semibold tabular-nums" />
                </div>
              </Field>
              <Field label="Category">
                <Input name="category" list="expense-cats" defaultValue={edit?.category} required placeholder="e.g. Utilities" />
                <datalist id="expense-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Method">
                  <Select name="method" defaultValue={edit?.method ?? "cash"}>
                    {["cash", "mobile_money", "card", "bank"].map((x) => <option key={x} value={x}>{METHOD_LABEL[x]}</option>)}
                  </Select>
                </Field>
                <Field label="Day"><Input type="date" name="day" defaultValue={edit?.day ?? today} required /></Field>
              </div>
              <Field label="Paid to"><Input name="paidTo" defaultValue={edit?.paidTo ?? ""} /></Field>
              <Field label="Description"><Input name="description" defaultValue={edit?.description ?? ""} /></Field>
              <Submit size="lg" className="w-full">{edit ? "Save changes" : "Add expense"}</Submit>
            </ActionForm>
          </Panel>
        </aside>
      </div>
    </>
  );
}
