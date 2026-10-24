import { audit, getCtx, tx } from "@/lib/auth";
import { claimDetail } from "@/lib/billing/claims";
import { amt, csvResponse } from "@/lib/billing/csv";
import { fullName, localDay } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/plans";

export async function GET(_: Request, { params }: RouteContext<"/insurance/claims/[id]/csv">) {
  const ctx = await getCtx();
  if (!ctx || !can(ctx.user.role, "insurance.manage") || !hasFeature(ctx.tenant, "insurance")) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const d = await tx(ctx, async (t) => {
    const d = await claimDetail(t, id);
    if (d) await audit(t, ctx, "export", "claim", id);
    return d;
  });
  if (!d) return new Response("Not found", { status: 404 });
  const tz = ctx.tenant.timezone;
  const rows = [
    ["Batch", "Patient No", "Patient Name", "Date of Birth", "Member No", "Service Date", "Invoice No", "Diagnosis Codes", "Services", "Amount Claimed", "Amount Paid", "Status", "Rejection Reason"],
    ...d.items.map(({ item, inv, p, services, diagnoses }) => [
      d.claim.batchNo, p.patientNo, fullName(p), p.dob ?? "", p.memberNo ?? "", localDay(tz, inv.issuedAt ?? inv.createdAt), inv.invoiceNo,
      diagnoses.map((x) => x.icd10Code ?? x.description).join("; "), services.map((s) => `${s.description} x${s.quantity}`).join("; "),
      amt(item.amountClaimedMinor), amt(item.amountPaidMinor), item.status, item.rejectionReason ?? "",
    ]),
  ];
  return csvResponse(rows, `claim-${d.claim.batchNo}.csv`);
}
