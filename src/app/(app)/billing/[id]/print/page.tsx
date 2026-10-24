import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { insurers, invoiceLines, invoices, patients, payments } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, fullName, money } from "@/lib/format";
import { PrintDoc } from "../../letterhead";
import { METHOD_LABEL } from "../../methods";


export const metadata = { title: "Print invoice" };
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
  const row = (k: string, v: string, strong = false) => <tr key={k} className={strong ? "border-t border-line-strong font-semibold text-fg" : "text-muted"}><td className="py-1.5 pr-8 text-right">{k}</td><td className="py-1.5 text-right tabular-nums text-fg">{v}</td></tr>;
  const due = i.status === "void" ? 0 : i.patientPortionMinor - i.paidMinor;
  return (
    <PrintDoc tenant={ctx.tenant} title={i.status === "void" ? "Invoice (VOID)" : "Invoice"} back={`/billing/${i.id}`}>
      <div className="mb-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">Bill to</div>
          <div className="mt-1 text-base font-semibold text-fg">{fullName(p)}</div>
          <div className="text-muted"><span className="font-mono text-xs">{p.patientNo}</span>{p.phone && ` · ${p.phone}`}</div>
          {data.insurer && <div className="text-muted">{data.insurer.name} · Member <span className="font-mono text-xs">{p.memberNo ?? "—"}</span></div>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end sm:text-right">
          <dt className="text-subtle">Invoice no.</dt><dd className="font-mono font-semibold text-fg">{i.invoiceNo}</dd>
          <dt className="text-subtle">Date</dt><dd className="text-fg">{dateOnly(i.issuedAt ?? i.createdAt, tz)}</dd>
          <dt className="text-subtle">Status</dt><dd className="capitalize text-fg">{i.status.replace("_", " ")}</dd>
        </dl>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line-strong text-left text-[10px] uppercase tracking-[0.16em] text-subtle"><th className="pb-2 font-semibold">Description</th><th className="pb-2 text-right font-semibold">Qty</th><th className="pb-2 text-right font-semibold">Unit</th><th className="pb-2 text-right font-semibold">Amount</th></tr></thead>
        <tbody>{data.lines.map((l) => (
          <tr key={l.id} className="border-b border-line"><td className="py-2.5 text-fg">{l.description}{data.insurer && !l.insurerCovered && <span className="text-xs text-subtle"> (not covered)</span>}</td><td className="py-2.5 text-right tabular-nums">{l.quantity}</td><td className="py-2.5 text-right tabular-nums">{money(l.unitPriceMinor, cur)}</td><td className="py-2.5 text-right tabular-nums text-fg">{money(l.totalMinor, cur)}</td></tr>
        ))}</tbody>
      </table>
      <div className="mt-6 flex justify-end">
        <table className="text-sm"><tbody>
          {row("Subtotal", money(i.subtotalMinor, cur))}
          {i.discountMinor > 0 && row("Discount", `− ${money(i.discountMinor, cur)}`)}
          {row("Total", money(i.totalMinor, cur), true)}
          {data.insurer && row(`${data.insurer.name} share`, money(i.insurerPortionMinor, cur))}
          {row("Patient share", money(i.patientPortionMinor, cur))}
          {row("Paid", money(i.paidMinor, cur))}
        </tbody></table>
      </div>
      <div className="mt-4 flex justify-end">
        <div className="rounded-2xl border border-line-strong px-6 py-4 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">Balance due</div>
          <div className="text-2xl font-semibold tabular-nums text-fg">{money(due, cur)}</div>
        </div>
      </div>
      {data.payments.length > 0 && (
        <div className="mt-8 border-t border-line pt-4 text-xs text-muted">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">Payments</div>
          {data.payments.map((x) => <div key={x.id} className="flex justify-between gap-4 py-0.5"><span>{dateOnly(x.receivedAt, tz)} · <span className="font-mono">{x.receiptNo}</span> · {METHOD_LABEL[x.method]}</span><span className="tabular-nums text-fg">{money(x.amountMinor, cur)}</span></div>)}
        </div>
      )}
      <p className="mt-12 text-center text-xs text-subtle">Thank you for choosing {ctx.tenant.name}.</p>
    </PrintDoc>
  );
}
