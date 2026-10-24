import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { CircleCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { cx } from "@/components/ui";
import { invoices, patients, payments, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { patientCredit } from "@/lib/billing";
import { dateTime, fullName, money } from "@/lib/format";
import { PrintDoc } from "../../letterhead";
import { METHOD_LABEL } from "../../methods";
import { can } from "@/lib/permissions";
import { reversePaymentAction } from "../../actions";
import { ReversePayment } from "../../reverse-payment";


export const metadata = { title: "Receipt" };
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
  const canReverse = ctx.access === "full" && can(ctx.user.role, "billing.void") && pay.status === "succeeded" && !(pay.method === "insurance" && pay.reference?.startsWith("Claim"));
  const ok = pay.status === "succeeded";
  const rows: [string, ReactNode][] = [
    ["Receipt no.", <span key="r" className="font-mono font-semibold">{pay.receiptNo}</span>],
    ["Date", dateTime(pay.receivedAt, ctx.tenant.timezone)],
    ["Received from", <>{fullName(p)} <span className="font-mono text-xs text-muted">{p.patientNo}</span></>],
    ["For", i ? <>Invoice <span className="font-mono text-xs">{i.invoiceNo}</span></> : "Deposit / credit on account"],
    ["Method", <>{METHOD_LABEL[pay.method]}{pay.reference && <span className="font-mono text-xs text-muted"> · {pay.reference}</span>}</>],
    ...(i ? [["Invoice balance", <span key="b" className="tabular-nums">{money(i.status === "void" ? 0 : i.patientPortionMinor - i.paidMinor, cur)}</span>] as [string, ReactNode]] : []),
    ["Account credit", <span key="c" className="tabular-nums">{money(data.credit, cur)}</span>],
    ...(data.by ? [["Received by", data.by] as [string, ReactNode]] : []),
  ];
  return (
    <PrintDoc tenant={ctx.tenant} title="Receipt" back={i ? `/billing/${i.id}` : `/patients/${p.id}`}>
      <div className={cx("mb-8 flex flex-col items-center rounded-2xl border px-6 py-6 text-center", ok ? "border-ok/30 bg-ok/10" : "border-bad/30 bg-bad/10")}>
        {ok && <CircleCheck className="mb-2 h-8 w-8 text-ok print:hidden" aria-hidden />}
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-subtle">Amount received</div>
        <div className={cx("mt-1 text-4xl font-semibold tracking-[-0.03em] tabular-nums", ok ? "text-fg" : "text-subtle line-through")}>{money(pay.amountMinor, cur)}</div>
        {!ok && <div className="mt-2 text-sm font-semibold uppercase tracking-wide text-bad">Payment {pay.status}</div>}
      </div>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-right text-fg">{v}</dd></div>)}
      </dl>
      {pay.refundedAt && <p className="mt-4 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">Refunded {dateTime(pay.refundedAt, ctx.tenant.timezone)}: {pay.refundReason}</p>}
      {canReverse && <div className="mt-6"><ReversePayment action={reversePaymentAction} paymentId={pay.id} viaPaystack={pay.provider === "paystack" && !!pay.providerRef} label="Refund / reverse this payment" /></div>}
      <p className="mt-12 border-t border-dashed border-line-strong pt-4 text-center text-xs text-subtle">Thank you. Keep this receipt for your records.</p>
    </PrintDoc>
  );
}
