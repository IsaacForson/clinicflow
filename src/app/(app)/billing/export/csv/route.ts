import { and, eq, gte, lte, sql } from "drizzle-orm";
import { expenses, invoiceLines, invoices, patients, payments } from "@/db/schema";
import { audit, getCtx, tx } from "@/lib/auth";
import { dayRange, fullName, localDay } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/plans";
import { amt, csvResponse } from "@/lib/billing/csv";
import { METHOD_LABEL } from "../../methods";

/** Accounting CSV: ?layout=quickbooks|zoho&kind=invoices|payments|expenses&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx || !can(ctx.user.role, "billing.read")) return new Response("Unauthorized", { status: 401 });
  if (!hasFeature(ctx.tenant, "accounting") && ctx.user.role !== "owner") return new Response("Accounting export is on the Group plan", { status: 403 });
  const u = new URL(req.url).searchParams;
  const tz = ctx.tenant.timezone;
  const isDay = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const to = isDay(u.get("to")) ? u.get("to")! : localDay(tz);
  const from = isDay(u.get("from")) ? u.get("from")! : to.slice(0, 8) + "01";
  const layout = u.get("layout") === "zoho" ? "zoho" : "quickbooks";
  const kind = (["invoices", "payments", "expenses"] as const).find((k) => k === u.get("kind")) ?? "invoices";
  const start = dayRange(from, tz).start.toISOString(), end = dayRange(to, tz).end.toISOString();
  const cur = ctx.tenant.currency;
  const ld = (d: Date | null) => (d ? localDay(tz, d) : "");
  const customer = (p: { firstName: string; lastName: string; patientNo: string }) => `${fullName(p)} (${p.patientNo})`;

  const rows = await tx(ctx, async (t) => {
    await audit(t, ctx, "export", "accounting", null, { details: { kind, layout, from, to } });
    if (kind === "invoices") {
      const data = await t.select({ i: invoices, l: invoiceLines, p: { firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo } })
        .from(invoiceLines).innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId)).innerJoin(patients, eq(patients.id, invoices.patientId))
        .where(and(sql`${invoices.status} not in ('draft','void')`, sql`${invoices.issuedAt} >= ${start}`, sql`${invoices.issuedAt} < ${end}`))
        .orderBy(invoices.invoiceNo);
      return layout === "quickbooks"
        ? [["InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Item(Product/Service)", "ItemDescription", "ItemQuantity", "ItemRate", "ItemAmount", "Discount Amount", "Currency"],
          ...data.map(({ i, l, p }) => [i.invoiceNo, customer(p), ld(i.issuedAt), ld(i.dueAt ?? i.issuedAt), l.serviceId ? "Services" : l.itemId ? "Pharmacy" : "Other", l.description, l.quantity, amt(l.unitPriceMinor), amt(l.totalMinor), amt(i.discountMinor), cur])]
        : [["Invoice Date", "Invoice Number", "Invoice Status", "Customer Name", "Due Date", "Currency Code", "Item Name", "Item Desc", "Quantity", "Item Price", "Item Total", "Entity Discount Amount"],
          ...data.map(({ i, l, p }) => [ld(i.issuedAt), i.invoiceNo, i.status === "paid" ? "Closed" : "Open", customer(p), ld(i.dueAt ?? i.issuedAt), cur, l.serviceId ? "Services" : l.itemId ? "Pharmacy" : "Other", l.description, l.quantity, amt(l.unitPriceMinor), amt(l.totalMinor), amt(i.discountMinor)])];
    }
    if (kind === "payments") {
      const data = await t.select({ pay: payments, invoiceNo: invoices.invoiceNo, p: { firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo } })
        .from(payments).leftJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(patients, eq(patients.id, payments.patientId))
        .where(and(eq(payments.status, "succeeded"), sql`${payments.receivedAt} >= ${start}`, sql`${payments.receivedAt} < ${end}`))
        .orderBy(payments.receivedAt);
      return layout === "quickbooks"
        ? [["Date", "Ref No", "Customer", "Payment Method", "Amount", "Invoice No", "Memo"],
          ...data.map(({ pay, invoiceNo, p }) => [ld(pay.receivedAt), pay.receiptNo, customer(p), METHOD_LABEL[pay.method], amt(pay.amountMinor), invoiceNo ?? "", invoiceNo ? pay.reference ?? "" : "Deposit / credit on account"])]
        : [["Date", "Payment Number", "Customer Name", "Mode", "Amount", "Reference Number", "Invoice Number", "Amount Applied to Invoice", "Currency Code"],
          ...data.map(({ pay, invoiceNo, p }) => [ld(pay.receivedAt), pay.receiptNo, customer(p), METHOD_LABEL[pay.method], amt(pay.amountMinor), pay.reference ?? "", invoiceNo ?? "", invoiceNo ? amt(pay.amountMinor) : "0.00", cur])];
    }
    const data = await t.select().from(expenses).where(and(gte(expenses.day, from), lte(expenses.day, to))).orderBy(expenses.day);
    return layout === "quickbooks"
      ? [["Date", "Account", "Payee", "Description", "Amount", "Payment Method"],
        ...data.map((e) => [e.day, e.category, e.paidTo ?? "", e.description ?? "", amt(e.amountMinor), METHOD_LABEL[e.method]])]
      : [["Expense Date", "Expense Account", "Paid Through", "Vendor", "Expense Amount", "Description", "Currency Code"],
        ...data.map((e) => [e.day, e.category, METHOD_LABEL[e.method], e.paidTo ?? "", amt(e.amountMinor), e.description ?? "", cur])];
  });
  return csvResponse(rows, `${kind}-${layout}-${from}-to-${to}.csv`);
}
