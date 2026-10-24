import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Dl, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { claimItems, claims, insurers, invoiceLines, invoices, items, patients, payments, services, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { patientCredit } from "@/lib/billing";
import { dateTime, fullName, money, toMajor } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  addLineAction, discountAction, insurerShortfallAction, issueInvoiceAction, removeLineAction, reversePaymentAction, sendInvoiceAction, sendPaymentLinkAction,
  takePaymentAction, voidInvoiceAction,
} from "../actions";
import { ReversePayment } from "../reverse-payment";
import { METHOD_LABEL, STATUS_TONE } from "../methods";
import { PaymentForm } from "../payment-form";

export default async function InvoicePage({ params }: PageProps<"/billing/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("billing.read");
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ i: invoices, p: patients }).from(invoices).innerJoin(patients, eq(patients.id, invoices.patientId)).where(eq(invoices.id, id));
    if (!row) return null;
    await audit(t, ctx, "view", "invoice", id, { patientId: row.p.id });
    const [ins] = row.i.insurerId ? await t.select().from(insurers).where(eq(insurers.id, row.i.insurerId)) : [];
    const [claim] = await t.select({ id: claims.id, batchNo: claims.batchNo, status: claimItems.status }).from(claimItems).innerJoin(claims, eq(claims.id, claimItems.claimId)).where(eq(claimItems.invoiceId, id));
    return {
      ...row, insurer: ins ?? null, claim: claim ?? null,
      lines: await t.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)),
      payments: await t.select({ pay: payments, by: users.name }).from(payments).leftJoin(users, eq(users.id, payments.receivedBy)).where(eq(payments.invoiceId, id)).orderBy(desc(payments.receivedAt)),
      services: await t.select({ id: services.id, name: services.name, price: services.priceMinor }).from(services).where(eq(services.active, true)).orderBy(services.name),
      items: await t.select({ id: items.id, name: items.name, strength: items.strength, price: items.sellPriceMinor }).from(items).where(and(eq(items.active, true))).orderBy(items.name),
      credit: await patientCredit(t, row.p.id),
    };
  });
  if (!data) notFound();
  const { i, p } = data;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const role = ctx.user.role;
  const writable = ctx.access === "full";
  const open = i.status !== "void" && i.status !== "paid";
  const balance = i.patientPortionMinor - i.paidMinor;
  const insurerDue = i.insurerPortionMinor - i.insurerPaidMinor;
  const canWrite = writable && can(role, "billing.write");
  const canVoid = writable && can(role, "billing.void");
  const canPay = writable && can(role, "payments.receive") && i.status !== "void" && (balance > 0 || insurerDue > 0);
  const methods = [
    ...(balance > 0 ? ["cash", "mobile_money", "card", "bank"] : []),
    ...(insurerDue > 0 ? ["insurance"] : []),
    ...(balance > 0 && data.credit > 0 ? ["deposit"] : []),
  ];

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Invoice {i.invoiceNo} <Badge tone={STATUS_TONE[i.status]}>{i.status.replace("_", " ")}</Badge></span>}
        subtitle={<><Link className="text-brand-800 hover:underline" href={`/patients/${p.id}`}>{fullName(p)}</Link> · {p.patientNo} · {dateTime(i.createdAt, tz)}</>}
        actions={<>
          <LinkButton variant="secondary" href={`/billing/${i.id}/print`}>Print</LinkButton>
          {canWrite && i.status !== "draft" && i.status !== "void" && <ActionButton action={sendInvoiceAction} fields={{ invoiceId: i.id }}>Send to patient</ActionButton>}
          {writable && can(role, "payments.receive") && open && i.status !== "draft" && balance > 0 && <ActionButton action={sendPaymentLinkAction} fields={{ invoiceId: i.id }}>Send payment link</ActionButton>}
          {canWrite && i.status === "draft" && <ActionButton action={issueInvoiceAction} fields={{ invoiceId: i.id }} variant="primary" className="px-3 py-2 text-sm">Issue invoice</ActionButton>}
        </>}
      />
      {i.status === "void" && <p className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">Voided: {i.voidReason}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Lines">
            <Table head={["Description", "Qty", "Unit", "Total", data.insurer ? "Insurer" : "", ""]} empty="No lines yet.">
              {data.lines.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-normal">{l.description}</Td><Td>{l.quantity}</Td><Td>{money(l.unitPriceMinor, cur)}</Td><Td>{money(l.totalMinor, cur)}</Td>
                  <Td>{data.insurer ? (l.insurerCovered ? <Badge tone="teal">covered</Badge> : <Badge>not covered</Badge>) : null}</Td>
                  <Td>{canWrite && i.status === "draft" && <ActionButton action={removeLineAction} fields={{ id: l.id, invoiceId: i.id }} variant="ghost">Remove</ActionButton>}</Td>
                </tr>
              ))}
            </Table>
            {canWrite && open && (
              <ActionForm action={addLineAction} resetOnSuccess className="mt-4 border-t border-slate-100 pt-4">
                <input type="hidden" name="invoiceId" value={i.id} />
                <div className="grid gap-2 sm:grid-cols-6">
                  <Select name="catalog" defaultValue="" className="sm:col-span-3" aria-label="Service or item">
                    <option value="">Free text (type below)…</option>
                    <optgroup label="Services">{data.services.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name} · {money(s.price, cur)}</option>)}</optgroup>
                    <optgroup label="Pharmacy / stock">{data.items.map((it) => <option key={it.id} value={`i:${it.id}`}>{[it.name, it.strength].filter(Boolean).join(" ")} · {money(it.price, cur)}</option>)}</optgroup>
                  </Select>
                  <Input name="quantity" type="number" min={1} defaultValue={1} aria-label="Quantity" />
                  <Input name="price" inputMode="decimal" placeholder="Price (override)" aria-label="Unit price" className="sm:col-span-2" />
                  <Input name="description" placeholder="Description (free text, or rename)" className="sm:col-span-5" />
                  <Submit variant="secondary">Add line</Submit>
                </div>
              </ActionForm>
            )}
          </Card>

          <Card title="Payments">
            <Table head={["Receipt", "When", "Method", "Reference", "Amount", "By", ""]} empty="No payments yet.">
              {data.payments.map(({ pay, by }) => (
                <tr key={pay.id}>
                  <Td className="font-mono text-xs">{pay.receiptNo}</Td><Td>{dateTime(pay.receivedAt, tz)}</Td>
                  <Td>{METHOD_LABEL[pay.method]} {pay.status !== "succeeded" && <Badge tone={pay.status === "refunded" ? "red" : "yellow"}>{pay.status}</Badge>}
                    {pay.refundReason && <div className="text-xs text-slate-500">Refunded {dateTime(pay.refundedAt, tz)}: {pay.refundReason}</div>}</Td>
                  <Td>{pay.reference}</Td><Td className={pay.status === "refunded" ? "line-through" : undefined}>{money(pay.amountMinor, cur)}</Td><Td>{by ?? (pay.provider === "paystack" ? "Online" : "")}</Td>
                  <Td className="space-x-2">
                    <Link className="text-brand-800 hover:underline" href={`/billing/receipt/${pay.id}`}>Receipt</Link>
                    {canVoid && pay.status === "succeeded" && !(pay.method === "insurance" && pay.reference?.startsWith("Claim")) && (
                      <ReversePayment action={reversePaymentAction} paymentId={pay.id} viaPaystack={pay.provider === "paystack" && !!pay.providerRef} />
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>

          {canVoid && i.insurerId && insurerDue > 0 && i.status !== "draft" && (
            <Card title="Insurer hasn't paid">
              <p className="mb-2 text-sm text-slate-600">
                {money(insurerDue, cur)} of the insurer&apos;s share is unpaid{data.claim ? ` (claim ${data.claim.batchNo}: ${data.claim.status.replace("_", " ")})` : ""}.
                If the insurer rejected or underpaid it, move it to the patient&apos;s bill or write it off.
              </p>
              <ActionForm action={insurerShortfallAction} className="flex flex-wrap items-end gap-2 space-y-0">
                <input type="hidden" name="invoiceId" value={i.id} />
                <Input name="amount" inputMode="decimal" defaultValue={toMajor(insurerDue)} className="w-28" aria-label="Amount" />
                <Input name="reason" placeholder="Reason (e.g. not covered)" className="w-56" />
                <Select name="mode" defaultValue="bill_patient" className="w-56" aria-label="What to do">
                  <option value="bill_patient">Move to patient&apos;s bill</option>
                  <option value="write_off">Write off (clinic absorbs)</option>
                </Select>
                <Submit variant="secondary">Apply</Submit>
              </ActionForm>
            </Card>
          )}

          {canPay && methods.length > 0 && (
            <Card title="Take payment">
              <PaymentForm action={takePaymentAction} patientId={p.id} invoiceId={i.id} balanceMinor={balance > 0 ? balance : insurerDue}
                creditMinor={data.credit} currency={cur} clientId={crypto.randomUUID()} methods={methods} onSuccessHref="/billing/receipt/{id}" />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Summary">
            <Dl items={[
              ["Subtotal", money(i.subtotalMinor, cur)], ["Discount", i.discountMinor ? `− ${money(i.discountMinor, cur)}` : null],
              ["Total", money(i.totalMinor, cur)],
              ...(data.insurer ? [[`${data.insurer.name} pays`, `${money(i.insurerPortionMinor, cur)} (paid ${money(i.insurerPaidMinor, cur)})`] as [string, string]] : []),
              ...(i.insurerShortfallMinor ? [["Moved to patient (insurer didn't pay)", money(i.insurerShortfallMinor, cur)] as [string, string]] : []),
              ...(i.insurerWriteoffMinor ? [["Written off (insurer didn't pay)", money(i.insurerWriteoffMinor, cur)] as [string, string]] : []),
              ["Patient pays", money(i.patientPortionMinor, cur)], ["Patient paid", money(i.paidMinor, cur)],
            ]} />
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500">Patient balance</div>
              <div className="text-2xl font-semibold text-slate-900">{money(i.status === "void" ? 0 : balance, cur)}</div>
            </div>
            {data.insurer && <p className="mt-2 text-xs text-slate-500">Member no. {p.memberNo ?? "—"} · {data.claim ? <Link className="text-brand-800 hover:underline" href={`/insurance/claims/${data.claim.id}`}>Claim {data.claim.batchNo} ({data.claim.status})</Link> : "not yet claimed"}</p>}
            {data.credit > 0 && <p className="mt-2 text-sm text-emerald-700">Account credit available: {money(data.credit, cur)}</p>}
          </Card>

          {canVoid && open && (
            <Card title="Discount">
              <ActionForm action={discountAction}>
                <input type="hidden" name="invoiceId" value={i.id} />
                <Field label="Discount amount" hint="Applied to the patient's share."><Input name="discount" inputMode="decimal" defaultValue={toMajor(i.discountMinor)} /></Field>
                <Submit variant="secondary">Apply discount</Submit>
              </ActionForm>
            </Card>
          )}
          {canVoid && i.status !== "void" && (
            <Card title="Void invoice">
              <ActionForm action={voidInvoiceAction}>
                <input type="hidden" name="invoiceId" value={i.id} />
                <Input name="reason" placeholder="Reason (required)" required minLength={3} />
                <Submit variant="danger">Void</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
