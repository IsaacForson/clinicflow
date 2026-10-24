import { notFound } from "next/navigation";
import { audit, tx } from "@/lib/auth";
import { claimDetail } from "@/lib/billing/claims";
import { dateOnly, fullName, money } from "@/lib/format";
import { PrintDoc } from "../../../../billing/letterhead";
import { requireInsurance } from "../../../guard";

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
      <div className="mb-4 grid grid-cols-2 text-sm">
        <div><div className="text-xs uppercase text-slate-500">To</div><div className="font-semibold">{d.insurer.name}</div>{d.insurer.code && <div>Code {d.insurer.code}</div>}</div>
        <div className="text-right"><div>Batch <strong>{d.claim.batchNo}</strong></div><div>Period {dateOnly(d.claim.periodStart, "UTC")} – {dateOnly(d.claim.periodEnd, "UTC")}</div></div>
      </div>
      <table className="w-full text-xs">
        <thead><tr className="border-b border-slate-300 text-left uppercase text-slate-500">
          <th className="py-1">#</th><th>Patient</th><th>Member no.</th><th>Date</th><th>Invoice</th><th>Diagnosis</th><th>Services</th><th className="text-right">Amount</th>
        </tr></thead>
        <tbody>{d.items.map(({ item, inv, p, services, diagnoses }, n) => (
          <tr key={item.id} className="border-b border-slate-100 align-top">
            <td className="py-1">{n + 1}</td><td>{fullName(p)}</td><td>{p.memberNo}</td><td>{dateOnly(inv.issuedAt ?? inv.createdAt, tz)}</td><td>{inv.invoiceNo}</td>
            <td>{diagnoses.map((x) => x.icd10Code ?? x.description).join(", ")}</td>
            <td>{services.map((s) => `${s.description}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`).join("; ")}</td>
            <td className="text-right">{money(item.amountClaimedMinor, cur)}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr className="font-semibold"><td colSpan={7} className="py-2 text-right">Total claimed</td><td className="text-right">{money(d.claim.totalClaimedMinor, cur)}</td></tr></tfoot>
      </table>
      <div className="mt-12 grid grid-cols-2 gap-8 text-xs text-slate-600">
        <div className="border-t border-slate-400 pt-1">Authorised signature &amp; stamp</div>
        <div className="border-t border-slate-400 pt-1">Date</div>
      </div>
    </PrintDoc>
  );
}
