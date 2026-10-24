import { Download, FileCheck2, FileStack, Mail, Printer, Send, Stethoscope } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/form";
import { A, Avatar, Badge, Callout, EmptyState, Kpi, LinkButton, PageHeader, Panel, Progress } from "@/components/ui";
import { audit, tx } from "@/lib/auth";
import { claimDetail } from "@/lib/billing/claims";
import { dateOnly, fullName, money, toMajor } from "@/lib/format";
import { CLAIM_TONE } from "../../../billing/methods";
import { deleteClaimAction, settleClaimItemAction, submitClaimAction } from "../../actions";
import { requireInsurance } from "../../guard";
import { SettleForm } from "./settle-form";


export const metadata = { title: "Claim" };
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
  const outstanding = c.totalClaimedMinor - c.totalPaidMinor;
  return (
    <>
      <PageHeader eyebrow={`Claim · ${insurer.name}`} icon={<FileStack />}
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono tracking-tight">{c.batchNo}</span><Badge tone={CLAIM_TONE[c.status]}>{c.status.replace("_", " ")}</Badge></span>}
        subtitle={`${dateOnly(c.periodStart, "UTC")} – ${dateOnly(c.periodEnd, "UTC")}${c.submittedAt ? ` · submitted ${dateOnly(c.submittedAt, tz)}` : ""}`}
        actions={<>
          <LinkButton variant="secondary" href={`/insurance/claims/${c.id}/print`}><Printer className="h-4 w-4" aria-hidden />Claim form</LinkButton>
          <LinkButton variant="secondary" href={`/insurance/claims/${c.id}/csv`} prefetch={false}><Download className="h-4 w-4" aria-hidden />Export CSV</LinkButton>
          {write && c.status === "draft" && <ActionButton action={deleteClaimAction} fields={{ claimId: c.id }} variant="ghost" confirm="Delete this draft claim? Its invoices can be claimed again.">Delete draft</ActionButton>}
          {write && c.status === "draft" && <ActionButton action={submitClaimAction} fields={{ claimId: c.id }} variant="primary"><Send className="h-3.5 w-3.5" aria-hidden />Mark submitted</ActionButton>}
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Claimed" value={money(c.totalClaimedMinor, cur)} sub={`${d.items.length} invoices`} icon={<FileStack />} />
        <Kpi label="Paid" value={money(c.totalPaidMinor, cur)} sub={<span className="flex w-full items-center gap-2"><Progress value={c.totalClaimedMinor ? (c.totalPaidMinor / c.totalClaimedMinor) * 100 : 0} tone="green" className="flex-1" /><span className="tabular-nums">{c.totalClaimedMinor ? Math.round((c.totalPaidMinor / c.totalClaimedMinor) * 100) : 0}%</span></span>} icon={<FileCheck2 />} tone="green" />
        <Kpi label="Outstanding" value={money(outstanding, cur)} sub={outstanding > 0 ? "still to come" : "fully settled"} icon={<FileStack />} tone={outstanding > 0 ? "yellow" : "green"} />
      </div>
      {insurer.claimEmail && c.status === "draft" && (
        <div className="mb-6"><Callout tone="blue" icon={<Mail />}>Send the claim form and CSV to <a className="font-medium text-accent underline underline-offset-4" href={`mailto:${insurer.claimEmail}?subject=${encodeURIComponent(`Claim ${c.batchNo} from ${ctx.tenant.name}`)}`}>{insurer.claimEmail}</a>, then mark it submitted.</Callout></div>
      )}
      {write && c.status === "draft" && !insurer.claimEmail && <div className="mb-6"><Callout tone="blue" icon={<Send />}>Send this claim to {insurer.name}, then mark it submitted to start recording payments.</Callout></div>}
      <Panel title="Claim items" eyebrow={`${d.items.length} invoices`} icon={<Stethoscope />} bodyClassName="p-0 pt-4">
        {d.items.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon={<FileStack />} title="This claim has no items" compact>Delete the draft and build a new claim for a different period.</EmptyState></div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {d.items.map(({ item, inv, p, services, diagnoses }) => {
              const tone = item.status === "paid" ? "green" : item.status === "rejected" ? "red" : item.status === "pending" ? "gray" : "yellow";
              const settle = write && c.status !== "draft" && !final(item.status, item.rejectionReason);
              return (
                <li key={item.id} className="grid gap-4 px-5 py-4 transition hover:bg-surface lg:grid-cols-12">
                  <div className="flex min-w-0 gap-3 lg:col-span-3">
                    <Avatar name={fullName(p)} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-fg">{fullName(p)}</div>
                      <div className="text-xs text-muted"><span className="font-mono">{p.patientNo}</span> · Member <span className="font-mono">{p.memberNo ?? "—"}</span></div>
                      <div className="mt-1 text-xs"><A href={`/billing/${inv.id}`} className="font-mono text-xs">{inv.invoiceNo}</A> <span className="text-subtle">{dateOnly(inv.issuedAt ?? inv.createdAt, tz)}</span></div>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted lg:col-span-4">
                    <div><span className="font-semibold uppercase tracking-[0.12em] text-subtle">Dx</span> <span className="text-fg">{diagnoses.map((x) => x.icd10Code ?? x.description).join(", ") || "—"}</span></div>
                    <div><span className="font-semibold uppercase tracking-[0.12em] text-subtle">Services</span> {services.map((s) => `${s.description}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`).join(", ") || "—"}</div>
                  </div>
                  <div className={settle ? "lg:col-span-2" : "lg:col-span-5"}>
                    <div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-muted">Claimed</span><span className="tabular-nums text-fg">{money(item.amountClaimedMinor, cur)}</span></div>
                    <div className="flex items-baseline justify-between gap-2 text-sm"><span className="text-muted">Paid</span><span className="font-semibold tabular-nums text-fg">{money(item.amountPaidMinor, cur)}</span></div>
                    <div className="mt-2"><Badge tone={tone}>{item.status.replace("_", " ")}</Badge></div>
                    {item.rejectionReason && <div className="mt-1.5 text-xs text-bad">{item.rejectionReason}</div>}
                  </div>
                  {settle && (
                    <div className="lg:col-span-3">
                      <SettleForm action={settleClaimItemAction} claimId={c.id} itemId={item.id} clientId={crypto.randomUUID()} defaultAmount={toMajor(item.amountClaimedMinor - item.amountPaidMinor)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
