import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { invoices, patients, payments, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { patientCredit } from "@/lib/billing";
import { dateTime, fullName, money } from "@/lib/format";
import { PrintDoc } from "../../letterhead";
import { METHOD_LABEL } from "../../methods";

export default async function ReceiptPage({ params }: PageProps<"/billing/receipt/[paymentId]">) {
  const { paymentId } = await params;
  const ctx = await requireCtx("billing.read");
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ pay: payments, p: patients, i: invoices, by: users.name }).from(payments)
      .innerJoin(patients, eq(patients.id, payments.patientId)).leftJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(users, eq(users.id, payments.receivedBy)).where(eq(payments.id, paymentId));
    if (!row) return null;
    await audit(t, ctx, "print", "receipt", paymentId, { patientId: row.p.id });
    return { ...row, credit: await patientCredit(t, row.p.id) };
  });
  if (!data) notFound();
  const { pay, p, i } = data;
  const cur = ctx.tenant.currency;
  return (
    <PrintDoc tenant={ctx.tenant} title="Receipt" back={i ? `/billing/${i.id}` : `/patients/${p.id}`}>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-slate-500">Receipt no.</dt><dd className="font-mono font-semibold">{pay.receiptNo}</dd>
        <dt className="text-slate-500">Date</dt><dd>{dateTime(pay.receivedAt, ctx.tenant.timezone)}</dd>
        <dt className="text-slate-500">Received from</dt><dd>{fullName(p)} ({p.patientNo})</dd>
        <dt className="text-slate-500">For</dt><dd>{i ? `Invoice ${i.invoiceNo}` : "Deposit / credit on account"}</dd>
        <dt className="text-slate-500">Method</dt><dd>{METHOD_LABEL[pay.method]}{pay.reference && ` · ${pay.reference}`}</dd>
        <dt className="text-slate-500">Amount</dt><dd className="text-xl font-bold">{money(pay.amountMinor, cur)}</dd>
        {i && <><dt className="text-slate-500">Invoice balance</dt><dd>{money(i.status === "void" ? 0 : i.patientPortionMinor - i.paidMinor, cur)}</dd></>}
        <dt className="text-slate-500">Account credit</dt><dd>{money(data.credit, cur)}</dd>
        {data.by && <><dt className="text-slate-500">Received by</dt><dd>{data.by}</dd></>}
      </dl>
      {pay.status !== "succeeded" && <p className="mt-4 font-semibold uppercase text-red-700">Payment {pay.status}</p>}
      <p className="mt-10 text-center text-xs text-slate-500">Thank you. Keep this receipt for your records.</p>
    </PrintDoc>
  );
}
