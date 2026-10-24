import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Input, LinkButton, PageHeader, Select, Stat } from "@/components/ui";
import { audit, tx } from "@/lib/auth";
import { claimDetail } from "@/lib/billing/claims";
import { dateOnly, fullName, money, toMajor } from "@/lib/format";
import { CLAIM_TONE } from "../../../billing/methods";
import { deleteClaimAction, settleClaimItemAction, submitClaimAction } from "../../actions";
import { requireInsurance } from "../../guard";

export default async function ClaimPage({ params }: PageProps<"/insurance/claims/[id]">) {
  const { id } = await params;
  const ctx = await requireInsurance();
  const d = await tx(ctx, async (t) => {
    const d = await claimDetail(t, id);
    if (d) await audit(t, ctx, "view", "claim", id);
    return d;
  });
  if (!d) notFound();
  const { claim: c, insurer } = d;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const write = ctx.access === "full";
  const final = (s: string, reason: string | null) => s === "paid" || s === "rejected" || !!reason;
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Claim {c.batchNo} <Badge tone={CLAIM_TONE[c.status]}>{c.status.replace("_", " ")}</Badge></span>}
        subtitle={`${insurer.name} · ${dateOnly(c.periodStart, "UTC")} – ${dateOnly(c.periodEnd, "UTC")}${c.submittedAt ? ` · submitted ${dateOnly(c.submittedAt, tz)}` : ""}`}
        actions={<>
          <LinkButton variant="secondary" href={`/insurance/claims/${c.id}/print`}>Claim form</LinkButton>
          <LinkButton variant="secondary" href={`/insurance/claims/${c.id}/csv`} prefetch={false}>Export CSV</LinkButton>
          {write && c.status === "draft" && <ActionButton action={submitClaimAction} fields={{ claimId: c.id }} variant="primary" className="px-3 py-2 text-sm">Mark submitted</ActionButton>}
          {write && c.status === "draft" && <ActionButton action={deleteClaimAction} fields={{ claimId: c.id }} variant="ghost" confirm="Delete this draft claim? Its invoices can be claimed again.">Delete draft</ActionButton>}
        </>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Claimed" value={money(c.totalClaimedMinor, cur)} sub={`${d.items.length} invoices`} />
        <Stat label="Paid" value={money(c.totalPaidMinor, cur)} />
        <Stat label="Outstanding" value={money(c.totalClaimedMinor - c.totalPaidMinor, cur)} />
      </div>
      {insurer.claimEmail && c.status === "draft" && <p className="mb-3 text-sm text-slate-600">Send the claim form and CSV to <a className="text-brand-800 underline" href={`mailto:${insurer.claimEmail}?subject=${encodeURIComponent(`Claim ${c.batchNo} from ${ctx.tenant.name}`)}`}>{insurer.claimEmail}</a>, then mark it submitted.</p>}
      <Card>
        <ul className="divide-y divide-slate-100">
          {d.items.map(({ item, inv, p, services, diagnoses }) => (
            <li key={item.id} className="grid gap-2 py-3 text-sm lg:grid-cols-12">
              <div className="lg:col-span-3">
                <div className="font-medium">{fullName(p)}</div>
                <div className="text-xs text-slate-500">{p.patientNo} · Member {p.memberNo ?? "—"}</div>
                <Link className="font-mono text-xs text-brand-800 hover:underline" href={`/billing/${inv.id}`}>{inv.invoiceNo}</Link> <span className="text-xs text-slate-500">{dateOnly(inv.issuedAt ?? inv.createdAt, tz)}</span>
              </div>
              <div className="text-xs text-slate-600 lg:col-span-4">
                <div><span className="font-medium">Dx:</span> {diagnoses.map((x) => x.icd10Code ?? x.description).join(", ") || "—"}</div>
                <div><span className="font-medium">Services:</span> {services.map((s) => `${s.description}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`).join(", ") || "—"}</div>
              </div>
              <div className="lg:col-span-2">
                <div>Claimed {money(item.amountClaimedMinor, cur)}</div>
                <div>Paid {money(item.amountPaidMinor, cur)}</div>
                <Badge tone={item.status === "paid" ? "green" : item.status === "rejected" ? "red" : item.status === "pending" ? "gray" : "yellow"}>{item.status.replace("_", " ")}</Badge>
                {item.rejectionReason && <div className="text-xs text-red-700">{item.rejectionReason}</div>}
              </div>
              <div className="lg:col-span-3">
                {write && c.status !== "draft" && !final(item.status, item.rejectionReason) && (
                  <ActionForm action={settleClaimItemAction} className="space-y-1.5">
                    <input type="hidden" name="claimId" value={c.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="clientId" value={crypto.randomUUID()} />
                    <div className="flex gap-1.5">
                      <Select name="outcome" defaultValue="paid" className="py-1 text-xs" aria-label="Outcome">
                        <option value="paid">Paid (final)</option><option value="partially_paid">Part paid (more to come)</option><option value="rejected">Rejected</option>
                      </Select>
                      <Input name="amount" inputMode="decimal" defaultValue={toMajor(item.amountClaimedMinor - item.amountPaidMinor)} className="w-24 py-1 text-xs" aria-label="Amount paid" />
                    </div>
                    <Input name="reason" placeholder="Rejection / shortfall reason" className="py-1 text-xs" />
                    <Select name="shortfall" defaultValue="later" className="py-1 text-xs" aria-label="Unpaid part">
                      <option value="later">Unpaid part: decide later</option>
                      <option value="bill_patient">Unpaid part: move to patient&apos;s bill</option>
                      <option value="write_off">Unpaid part: write off (clinic absorbs)</option>
                    </Select>
                    <Submit variant="secondary" className="px-2 py-1 text-xs">Record</Submit>
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
