import { notFound } from "next/navigation";
import { audit, tx } from "@/lib/auth";
import { claimDetail } from "@/lib/billing/claims";
import { dateOnly, fullName, money } from "@/lib/format";
import { PrintDoc } from "../../../../billing/letterhead";
import { requireInsurance } from "../../../guard";


export const metadata = { title: "Print claim" };
export default async function ClaimPrintPage({ params }: PageProps<"/insurance/claims/[id]/print">) {
  const { id } = await params;
  const ctx = await requireInsurance();
  const d = await tx(ctx, async (t) => {
    const d = await claimDetail(t, id);
    if (d) await audit(t, ctx, "print", "claim", id);
    return d;
  });
  if (!d) notFound();
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  return (
    <PrintDoc tenant={ctx.tenant} title="Insurance claim" back={`/insurance/claims/${id}`}>
      <div className="mb-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">To</div>
          <div className="mt-1 text-base font-semibold text-fg">{d.insurer.name}</div>
          {d.insurer.code && <div className="text-muted">Code <span className="font-mono text-xs">{d.insurer.code}</span></div>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end sm:text-right">
          <dt className="text-subtle">Batch</dt><dd className="font-mono font-semibold text-fg">{d.claim.batchNo}</dd>
          <dt className="text-subtle">Period</dt><dd className="text-fg">{dateOnly(d.claim.periodStart, "UTC")} – {dateOnly(d.claim.periodEnd, "UTC")}</dd>
          <dt className="text-subtle">Items</dt><dd className="tabular-nums text-fg">{d.items.length}</dd>
        </dl>
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-line-strong text-left text-[10px] uppercase tracking-[0.14em] text-subtle">
            <th className="pb-2 pr-2 font-semibold">#</th><th className="pb-2 pr-2 font-semibold">Patient</th><th className="pb-2 pr-2 font-semibold">Member no.</th><th className="pb-2 pr-2 font-semibold">Date</th><th className="pb-2 pr-2 font-semibold">Invoice</th><th className="pb-2 pr-2 font-semibold">Diagnosis</th><th className="pb-2 pr-2 font-semibold">Services</th><th className="pb-2 text-right font-semibold">Amount</th>
          </tr></thead>
          <tbody className="text-muted">{d.items.map(({ item, inv, p, services, diagnoses }, n) => (
            <tr key={item.id} className="border-b border-line align-top">
              <td className="py-2 pr-2 tabular-nums">{n + 1}</td><td className="py-2 pr-2 font-medium text-fg">{fullName(p)}</td><td className="py-2 pr-2 font-mono">{p.memberNo}</td><td className="py-2 pr-2 whitespace-nowrap">{dateOnly(inv.issuedAt ?? inv.createdAt, tz)}</td><td className="py-2 pr-2 font-mono">{inv.invoiceNo}</td>
              <td className="py-2 pr-2">{diagnoses.map((x) => x.icd10Code ?? x.description).join(", ")}</td>
              <td className="py-2 pr-2">{services.map((s) => `${s.description}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`).join("; ")}</td>
              <td className="py-2 text-right tabular-nums text-fg">{money(item.amountClaimedMinor, cur)}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr className="border-t border-line-strong font-semibold text-fg"><td colSpan={7} className="py-3 text-right">Total claimed</td><td className="py-3 text-right text-sm tabular-nums">{money(d.claim.totalClaimedMinor, cur)}</td></tr></tfoot>
        </table>
      </div>
      <div className="mt-16 grid grid-cols-2 gap-8 text-xs text-muted">
        <div className="border-t border-line-strong pt-2">Authorised signature &amp; stamp</div>
        <div className="border-t border-line-strong pt-2">Date</div>
      </div>
    </PrintDoc>
  );
}
