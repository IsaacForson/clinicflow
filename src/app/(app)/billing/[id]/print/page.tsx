import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { insurers, invoiceLines, invoices, patients, payments } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, fullName, money } from "@/lib/format";
import { PrintDoc } from "../../letterhead";
import { METHOD_LABEL } from "../../methods";

export default async function InvoicePrintPage({ params }: PageProps<"/billing/[id]/print">) {
  const { id } = await params;
  const ctx = await requireCtx("billing.read");
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ i: invoices, p: patients }).from(invoices).innerJoin(patients, eq(patients.id, invoices.patientId)).where(eq(invoices.id, id));
    if (!row) return null;
    await audit(t, ctx, "print", "invoice", id, { patientId: row.p.id });
    const [ins] = row.i.insurerId ? await t.select().from(insurers).where(eq(insurers.id, row.i.insurerId)) : [];
    return {
      ...row, insurer: ins ?? null,
      lines: await t.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)),
      payments: await t.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(payments.receivedAt),
    };
  });
  if (!data) notFound();
  const { i, p } = data;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const row = (k: string, v: string, strong = false) => <tr key={k} className={strong ? "font-semibold" : ""}><td className="py-1 pr-6 text-right text-slate-600">{k}</td><td className="py-1 text-right">{v}</td></tr>;
  return (
    <PrintDoc tenant={ctx.tenant} title={i.status === "void" ? "Invoice (VOID)" : "Invoice"} back={`/billing/${i.id}`}>
      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs uppercase text-slate-500">Bill to</div>
          <div className="font-semibold">{fullName(p)}</div>
          <div>{p.patientNo}{p.phone && ` · ${p.phone}`}</div>
          {data.insurer && <div>{data.insurer.name} · Member {p.memberNo ?? "—"}</div>}
        </div>
        <div className="text-right">
          <div>Invoice no. <strong>{i.invoiceNo}</strong></div>
          <div>Date {dateOnly(i.issuedAt ?? i.createdAt, tz)}</div>
          <div className="capitalize">Status {i.status.replace("_", " ")}</div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500"><th className="py-1">Description</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Amount</th></tr></thead>
        <tbody>{data.lines.map((l) => (
          <tr key={l.id} className="border-b border-slate-100"><td className="py-1">{l.description}{data.insurer && !l.insurerCovered && <span className="text-xs text-slate-500"> (not covered)</span>}</td><td className="py-1 text-right">{l.quantity}</td><td className="py-1 text-right">{money(l.unitPriceMinor, cur)}</td><td className="py-1 text-right">{money(l.totalMinor, cur)}</td></tr>
        ))}</tbody>
      </table>
      <table className="ml-auto mt-4 text-sm"><tbody>
        {row("Subtotal", money(i.subtotalMinor, cur))}
        {i.discountMinor > 0 && row("Discount", `− ${money(i.discountMinor, cur)}`)}
        {row("Total", money(i.totalMinor, cur), true)}
        {data.insurer && row(`${data.insurer.name} share`, money(i.insurerPortionMinor, cur))}
        {row("Patient share", money(i.patientPortionMinor, cur))}
        {row("Paid", money(i.paidMinor, cur))}
        {row("Balance due", money(i.status === "void" ? 0 : i.patientPortionMinor - i.paidMinor, cur), true)}
      </tbody></table>
      {data.payments.length > 0 && (
        <div className="mt-6 text-xs text-slate-600">
          <div className="font-semibold uppercase">Payments</div>
          {data.payments.map((x) => <div key={x.id}>{dateOnly(x.receivedAt, tz)} · {x.receiptNo} · {METHOD_LABEL[x.method]} · {money(x.amountMinor, cur)}</div>)}
        </div>
      )}
      <p className="mt-10 text-center text-xs text-slate-500">Thank you for choosing {ctx.tenant.name}.</p>
    </PrintDoc>
  );
}
