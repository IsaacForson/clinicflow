import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge, Button, Card, Input, LinkButton, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
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

  return (
    <>
      <PageHeader title="Billing" subtitle="Invoices, payments and the day's cash."
        actions={<>
          {can(ctx.user.role, "billing.write") && <LinkButton href="/billing/new">New invoice</LinkButton>}
          {can(ctx.user.role, "payments.receive") && <LinkButton variant="secondary" href="/billing/deposit">Take deposit</LinkButton>}
          {can(ctx.user.role, "cashup") && <LinkButton variant="secondary" href="/billing/cashup">Cash-up</LinkButton>}
          {can(ctx.user.role, "expenses.manage") && <LinkButton variant="secondary" href="/billing/expenses">Expenses</LinkButton>}
          <LinkButton variant="ghost" href="/billing/export">Export</LinkButton>
        </>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Billed" value={money(totals.total, cur)} sub={`${totals.n} invoices`} />
        <Stat label="Collected" value={money(totals.paid, cur)} />
        <Stat label="Patients owe" value={money(totals.patientDue, cur)} />
        <Stat label="Insurers owe" value={money(totals.insurerDue, cur)} />
      </div>
      <Card>
        <form className="mb-3 grid gap-2 sm:grid-cols-6">
          <Input name="q" defaultValue={q} placeholder="Patient or invoice no…" className="sm:col-span-2" />
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </Select>
          <Input type="date" name="from" defaultValue={from} aria-label="From" />
          <Input type="date" name="to" defaultValue={to} aria-label="To" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="unpaid" value="1" defaultChecked={unpaid} /> Unpaid</label>
            <Button type="submit" variant="secondary">Filter</Button>
          </div>
        </form>
        <Table head={["Invoice", "Date", "Patient", "Total", "Insurer", "Patient balance", "Status"]} empty="No invoices match.">
          {rows.map(({ i, p }) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <Td><Link href={`/billing/${i.id}`} className="font-mono text-xs text-teal-800 hover:underline">{i.invoiceNo}</Link></Td>
              <Td>{dateOnly(i.createdAt, tz)}</Td>
              <Td><Link href={`/patients/${p.id}`} className="hover:underline">{fullName(p)}</Link> <span className="text-xs text-slate-400">{p.patientNo}</span></Td>
              <Td>{money(i.totalMinor, cur)}</Td>
              <Td>{i.insurerPortionMinor ? money(i.insurerPortionMinor - i.insurerPaidMinor, cur) : "—"}</Td>
              <Td className="font-medium">{money(i.status === "void" ? 0 : i.patientPortionMinor - i.paidMinor, cur)}</Td>
              <Td><Badge tone={STATUS_TONE[i.status]}>{i.status.replace("_", " ")}</Badge></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
