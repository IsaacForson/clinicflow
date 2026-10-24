import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { AlertTriangle, Ban, CreditCard, FileText, History, Link2, ListPlus, Package, Percent, Plus, Printer, Receipt, Send, ShieldAlert, Stethoscope, Wallet } from "lucide-react";
import { A, Avatar, Badge, Callout, cx, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Progress, Select } from "@/components/ui";
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
import { METHOD_ICON, METHOD_LABEL, STATUS_TONE } from "../methods";
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

  const settled = i.paidMinor + i.insurerPaidMinor;
  const pct = i.totalMinor ? Math.min((settled / i.totalMinor) * 100, 100) : 0;
  const isDraft = i.status === "draft";

  return (
    <>
      <PageHeader
        eyebrow="Invoice workspace" icon={<FileText />}
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono tracking-tight">{i.invoiceNo}</span><Badge tone={STATUS_TONE[i.status]}>{i.status.replace("_", " ")}</Badge></span>}
        subtitle={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"><Avatar name={fullName(p)} size="sm" /><A href={`/patients/${p.id}`}>{fullName(p)}</A><span className="font-mono text-xs text-subtle">{p.patientNo}</span><span aria-hidden>·</span>{dateTime(i.createdAt, tz)}</span>}
        actions={<>
          <LinkButton variant="secondary" href={`/billing/${i.id}/print`}><Printer className="h-4 w-4" aria-hidden />Print</LinkButton>
          {canWrite && i.status !== "draft" && i.status !== "void" && <ActionButton action={sendInvoiceAction} fields={{ invoiceId: i.id }}><Send className="h-3.5 w-3.5" aria-hidden />Send to patient</ActionButton>}
          {writable && can(role, "payments.receive") && open && i.status !== "draft" && balance > 0 && <ActionButton action={sendPaymentLinkAction} fields={{ invoiceId: i.id }}><Link2 className="h-3.5 w-3.5" aria-hidden />Send payment link</ActionButton>}
          {canWrite && i.status === "draft" && <ActionButton action={issueInvoiceAction} fields={{ invoiceId: i.id }} variant="primary">Issue invoice</ActionButton>}
        </>}
      />
      {i.status === "void" && <div className="mb-6"><Callout tone="red" icon={<Ban />}>This invoice was voided: {i.voidReason}</Callout></div>}
      {isDraft && canWrite && <div className="mb-6"><Callout tone="blue" icon={<FileText />}>Draft: add the lines, then issue the invoice to take payment.</Callout></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Line items" eyebrow={`${data.lines.length} ${data.lines.length === 1 ? "line" : "lines"}`} icon={<ListPlus />} bodyClassName="p-0 pt-4">
            {data.lines.length === 0 ? (
              <div className="px-5 pb-5"><EmptyState icon={<ListPlus />} title="No lines yet">{canWrite && open ? "Pick a service or stock item below to add the first line." : "Nothing was billed on this invoice."}</EmptyState></div>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {data.lines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition hover:bg-surface-2 sm:flex-nowrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">{l.description}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="tabular-nums">{l.quantity} × {money(l.unitPriceMinor, cur)}</span>
                        {data.insurer && (l.insurerCovered ? <Badge tone="teal">covered</Badge> : <Badge>not covered</Badge>)}
                      </div>
                    </div>
                    <div className="ml-auto text-right text-[15px] font-semibold tabular-nums text-fg">{money(l.totalMinor, cur)}</div>
                    {canWrite && i.status === "draft" && <ActionButton action={removeLineAction} fields={{ id: l.id, invoiceId: i.id }} variant="ghost">Remove</ActionButton>}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && open && (
              <ActionForm action={addLineAction} resetOnSuccess className="m-5 rounded-2xl border border-dashed border-line-strong bg-surface p-4">
                <input type="hidden" name="invoiceId" value={i.id} />
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle"><Plus className="h-3.5 w-3.5" aria-hidden />Add a line</div>
                <div className="grid gap-3 sm:grid-cols-6">
                  <Field label="Service or item" className="sm:col-span-4">
                    <Select name="catalog" defaultValue="" aria-label="Service or item">
                      <option value="">Free text (type below)…</option>
                      <optgroup label="Services">{data.services.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name} · {money(s.price, cur)}</option>)}</optgroup>
                      <optgroup label="Pharmacy / stock">{data.items.map((it) => <option key={it.id} value={`i:${it.id}`}>{[it.name, it.strength].filter(Boolean).join(" ")} · {money(it.price, cur)}</option>)}</optgroup>
                    </Select>
                  </Field>
                  <Field label="Qty"><Input name="quantity" type="number" min={1} defaultValue={1} aria-label="Quantity" className="tabular-nums" /></Field>
                  <Field label="Unit price"><Input name="price" inputMode="decimal" placeholder="Catalog" aria-label="Unit price" className="tabular-nums" /></Field>
                  <Field label="Description" hint="Free text, or rename the catalog item" className="sm:col-span-5"><Input name="description" placeholder="e.g. Wound dressing" /></Field>
                  <div className="flex items-start sm:pt-[22px]"><Submit variant="secondary" className="w-full"><Plus className="h-4 w-4" aria-hidden />Add line</Submit></div>
                </div>
                <div className="mt-2 flex gap-3 text-[11px] text-subtle"><span className="inline-flex items-center gap-1"><Stethoscope className="h-3 w-3" aria-hidden />{data.services.length} services</span><span className="inline-flex items-center gap-1"><Package className="h-3 w-3" aria-hidden />{data.items.length} stock items</span></div>
              </ActionForm>
            )}
          </Panel>

          {canPay && methods.length > 0 && (
            <Panel title="Take payment" eyebrow={balance > 0 ? `Patient owes ${money(balance, cur)}` : `Insurer owes ${money(insurerDue, cur)}`} icon={<CreditCard />} glow>
              <PaymentForm action={takePaymentAction} patientId={p.id} invoiceId={i.id} balanceMinor={balance > 0 ? balance : insurerDue}
                creditMinor={data.credit} currency={cur} clientId={crypto.randomUUID()} methods={methods} onSuccessHref="/billing/receipt/{id}" />
            </Panel>
          )}

          {canVoid && i.insurerId && insurerDue > 0 && i.status !== "draft" && (
            <Panel title="Insurer hasn't paid" eyebrow="Shortfall" icon={<ShieldAlert />}>
              <p className="mb-4 text-sm text-muted">
                <strong className="tabular-nums text-warn">{money(insurerDue, cur)}</strong> of the insurer&apos;s share is unpaid{data.claim ? ` (claim ${data.claim.batchNo}: ${data.claim.status.replace("_", " ")})` : ""}.
                If the insurer rejected or underpaid it, move it to the patient&apos;s bill or write it off.
              </p>
              <ActionForm action={insurerShortfallAction}>
                <input type="hidden" name="invoiceId" value={i.id} />
                <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Amount"><Input name="amount" inputMode="decimal" defaultValue={toMajor(insurerDue)} aria-label="Amount" className="tabular-nums" /></Field>
                  <Field label="Reason"><Input name="reason" placeholder="e.g. not covered" /></Field>
                  <Field label="What to do">
                    <Select name="mode" defaultValue="bill_patient" aria-label="What to do">
                      <option value="bill_patient">Move to patient&apos;s bill</option>
                      <option value="write_off">Write off (clinic absorbs)</option>
                    </Select>
                  </Field>
                  <Submit variant="secondary">Apply</Submit>
                </div>
              </ActionForm>
            </Panel>
          )}

          <Panel title="Payments" eyebrow="Timeline" icon={<History />}>
            {data.payments.length === 0 ? (
              <EmptyState icon={<Receipt />} title="No payments yet" compact>Payments, deposits applied and insurer settlements will appear here.</EmptyState>
            ) : (
              <ol className="relative space-y-3 before:absolute before:inset-y-2 before:left-[19px] before:w-px before:bg-line">
                {data.payments.map(({ pay, by }) => {
                  const M = METHOD_ICON[pay.method]?.icon ?? Wallet;
                  const refunded = pay.status === "refunded";
                  return (
                    <li key={pay.id} className="relative flex flex-wrap items-start gap-3 sm:flex-nowrap">
                      <span className={cx("relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl border", refunded ? "border-bad/25 bg-bad/12 text-bad" : pay.status === "succeeded" ? "border-ok/25 bg-ok/12 text-ok" : "border-warn/25 bg-warn/12 text-warn")}><M className="h-[18px] w-[18px]" aria-hidden /></span>
                      <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-fg">{METHOD_LABEL[pay.method]}</span>
                            {pay.status !== "succeeded" && <Badge tone={refunded ? "red" : "yellow"}>{pay.status}</Badge>}
                          </div>
                          <span className={cx("text-lg font-semibold tabular-nums", refunded ? "text-subtle line-through" : "text-fg")}>{money(pay.amountMinor, cur)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          <A href={`/billing/receipt/${pay.id}`} className="font-mono text-xs">{pay.receiptNo}</A>
                          <span aria-hidden>·</span><span>{dateTime(pay.receivedAt, tz)}</span>
                          {pay.reference && <><span aria-hidden>·</span><span className="font-mono">{pay.reference}</span></>}
                          {(by || pay.provider === "paystack") && <><span aria-hidden>·</span><span>{by ?? "Online"}</span></>}
                        </div>
                        {pay.refundReason && <div className="mt-2 rounded-lg bg-bad/10 px-2.5 py-1.5 text-xs text-bad">Refunded {dateTime(pay.refundedAt, tz)}: {pay.refundReason}</div>}
                        {canVoid && pay.status === "succeeded" && !(pay.method === "insurance" && pay.reference?.startsWith("Claim")) && (
                          <div className="mt-2 -ml-2"><ReversePayment action={reversePaymentAction} paymentId={pay.id} viaPaystack={pay.provider === "paystack" && !!pay.providerRef} label="Refund" /></div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Panel title="Summary" eyebrow="Who pays what" icon={<Receipt />} glow>
            <div className="flex items-center gap-5">
              <Ring value={pct} />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Patient balance</div>
                <div className={cx("text-[32px] font-semibold leading-tight tracking-[-0.03em] tabular-nums", balance > 0 && i.status !== "void" ? "text-fg" : "text-ok")}>{money(i.status === "void" ? 0 : balance, cur)}</div>
                <div className="text-xs text-muted">{money(settled, cur)} of {money(i.totalMinor, cur)} settled</div>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-sm">
              {([
                ["Subtotal", money(i.subtotalMinor, cur), ""],
                ...(i.discountMinor ? [["Discount", `− ${money(i.discountMinor, cur)}`, "text-ok"]] : []),
                ["Total", money(i.totalMinor, cur), "font-semibold"],
                ...(data.insurer ? [[`${data.insurer.name} pays`, money(i.insurerPortionMinor, cur), ""], ["Insurer paid", money(i.insurerPaidMinor, cur), "text-muted"]] : []),
                ...(i.insurerShortfallMinor ? [["Moved to patient (insurer didn't pay)", money(i.insurerShortfallMinor, cur), "text-warn"]] : []),
                ...(i.insurerWriteoffMinor ? [["Written off (insurer didn't pay)", money(i.insurerWriteoffMinor, cur), "text-muted"]] : []),
                ["Patient pays", money(i.patientPortionMinor, cur), ""],
                ["Patient paid", money(i.paidMinor, cur), "text-ok"],
              ] as [string, string, string][]).map(([k, v, c]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">{k}</dt><dd className={cx("tabular-nums text-fg", c)}>{v}</dd>
                </div>
              ))}
            </dl>
            {data.insurer && i.insurerPortionMinor > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-[11px] text-subtle"><span>Insurer {Math.round((i.insurerPortionMinor / (i.totalMinor || 1)) * 100)}%</span><span>Patient {Math.round((i.patientPortionMinor / (i.totalMinor || 1)) * 100)}%</span></div>
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className="bg-info" style={{ width: `${(i.insurerPortionMinor / (i.totalMinor || 1)) * 100}%` }} />
                  <div className="bg-aurora" style={{ width: `${(i.patientPortionMinor / (i.totalMinor || 1)) * 100}%` }} />
                </div>
              </div>
            )}
            {data.insurer && <p className="mt-4 text-xs text-muted">Member no. <span className="font-mono">{p.memberNo ?? "—"}</span> · {data.claim ? <A href={`/insurance/claims/${data.claim.id}`}>Claim {data.claim.batchNo} ({data.claim.status})</A> : "not yet claimed"}</p>}
            {data.credit > 0 && <p className="mt-3 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-fg"><Wallet className="h-4 w-4 text-ok" aria-hidden />Credit available <strong className="ml-auto tabular-nums">{money(data.credit, cur)}</strong></p>}
          </Panel>

          {canVoid && open && (
            <Panel title="Discount" icon={<Percent />}>
              <ActionForm action={discountAction}>
                <input type="hidden" name="invoiceId" value={i.id} />
                <div className="flex items-end gap-2">
                  <Field label="Discount amount" hint="Applied to the patient's share." className="flex-1"><Input name="discount" inputMode="decimal" defaultValue={toMajor(i.discountMinor)} className="tabular-nums" /></Field>
                  <Submit variant="secondary" className="mb-[22px]">Apply</Submit>
                </div>
              </ActionForm>
            </Panel>
          )}
          {canVoid && i.status !== "void" && (
            <section className="rounded-[1.25rem] border border-bad/30 bg-bad/5 p-5 animate-rise">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-bad"><AlertTriangle className="h-4 w-4" aria-hidden />Danger zone</div>
              <p className="mb-3 text-xs text-muted">Voiding cancels the invoice for good. Refund any payments first.</p>
              <ActionForm action={voidInvoiceAction}>
                <input type="hidden" name="invoiceId" value={i.id} />
                <Input name="reason" placeholder="Reason (required)" required minLength={3} aria-label="Void reason" />
                <Submit variant="danger" className="w-full"><Ban className="h-4 w-4" aria-hidden />Void invoice</Submit>
              </ActionForm>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

/** Settled-share progress ring. */
function Ring({ value }: { value: number }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20 shrink-0" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label="Settled">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <defs><linearGradient id="inv-ring" x1="0" x2="1"><stop offset="0" stopColor="var(--accent-2)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient></defs>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={value >= 100 ? "var(--ok)" : "url(#inv-ring)"} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums text-fg">{Math.round(value)}%</span>
    </div>
  );
}
