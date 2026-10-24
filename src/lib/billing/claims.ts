import { and, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { claimItems, claims, diagnoses, insurers, invoiceLines, invoices, patients, payments } from "@/db/schema";
import { UserError } from "../action";
import { recordPayment } from "../billing";
import { nextNumber } from "../numbers";

type SysCtx = Parameters<typeof recordPayment>[1];

/** Issued invoices for the insurer in [start, end] (by issue date, UTC days) with an unpaid insurer share and no claim yet. */
export function claimableInvoices(t: Tx, insurerId: string, start: Date, end: Date) {
  return t.select().from(invoices)
    .leftJoin(claimItems, eq(claimItems.invoiceId, invoices.id))
    .where(and(
      eq(invoices.insurerId, insurerId), notInArray(invoices.status, ["draft", "void"]), isNull(claimItems.id),
      gt(invoices.insurerPortionMinor, invoices.insurerPaidMinor),
      sql`coalesce(${invoices.issuedAt}, ${invoices.createdAt}) >= ${start.toISOString()}`, sql`coalesce(${invoices.issuedAt}, ${invoices.createdAt}) < ${end.toISOString()}`,
    ));
}

/** Creates a draft claim batch with one item per claimable invoice. */
export async function buildClaim(t: Tx, ctx: SysCtx, o: { insurerId: string; periodStart: string; periodEnd: string; start: Date; end: Date }) {
  const rows = await claimableInvoices(t, o.insurerId, o.start, o.end);
  if (!rows.length) throw new UserError("No unclaimed insurer balances in that period");
  const total = rows.reduce((s, r) => s + r.invoices.insurerPortionMinor - r.invoices.insurerPaidMinor, 0);
  const [claim] = await t.insert(claims).values({
    tenantId: ctx.tenant.id, insurerId: o.insurerId, batchNo: await nextNumber(t, ctx.tenant.id, "claim"),
    periodStart: o.periodStart, periodEnd: o.periodEnd, totalClaimedMinor: total, createdBy: ctx.user?.id ?? null,
  }).returning();
  await t.insert(claimItems).values(rows.map((r) => ({
    tenantId: ctx.tenant.id, claimId: claim.id, invoiceId: r.invoices.id,
    amountClaimedMinor: r.invoices.insurerPortionMinor - r.invoices.insurerPaidMinor,
  })));
  return claim;
}

/**
 * Records the insurer's answer for one claim item. Paid money becomes an "insurance" payment on the invoice
 * (idempotent on clientId), then claim totals and status are recomputed.
 */
export async function settleClaimItem(t: Tx, ctx: SysCtx, o: {
  itemId: string; outcome: "paid" | "partially_paid" | "rejected"; amountMinor?: number; reason?: string | null; clientId?: string | null;
}) {
  const [row] = await t.select().from(claimItems).innerJoin(invoices, eq(invoices.id, claimItems.invoiceId)).where(eq(claimItems.id, o.itemId));
  if (!row) throw new UserError("Claim item not found");
  const item = row.claim_items;
  if (o.clientId) {
    // Replayed form submission: the payment and item update already happened.
    const [dup] = await t.select({ id: payments.id }).from(payments).where(eq(payments.clientId, o.clientId));
    if (dup) return refreshClaim(t, item.claimId);
  }
  const remaining = item.amountClaimedMinor - item.amountPaidMinor;
  if (o.outcome === "rejected") {
    if (!o.reason) throw new UserError("Enter the rejection reason");
    await t.update(claimItems).set({ status: item.amountPaidMinor > 0 ? "partially_paid" : "rejected", rejectionReason: o.reason }).where(eq(claimItems.id, item.id));
  } else {
    const amount = o.amountMinor ?? remaining;
    if (amount <= 0 || amount > remaining) throw new UserError(`Amount must be between 0 and ${(remaining / 100).toFixed(2)}`);
    await recordPayment(t, ctx, {
      invoiceId: item.invoiceId, patientId: row.invoices.patientId, amountMinor: amount, method: "insurance",
      reference: `Claim ${item.claimId.slice(0, 8)}`, clientId: o.clientId ?? null,
    });
    const paid = item.amountPaidMinor + amount;
    await t.update(claimItems).set({
      amountPaidMinor: paid, status: paid >= item.amountClaimedMinor || o.outcome === "paid" ? "paid" : "partially_paid",
      rejectionReason: o.reason ?? item.rejectionReason,
    }).where(eq(claimItems.id, item.id));
  }
  return refreshClaim(t, item.claimId);
}

export async function refreshClaim(t: Tx, claimId: string) {
  const items = await t.select().from(claimItems).where(eq(claimItems.claimId, claimId));
  const [claim] = await t.select().from(claims).where(eq(claims.id, claimId));
  const claimed = items.reduce((s, i) => s + i.amountClaimedMinor, 0);
  const paid = items.reduce((s, i) => s + i.amountPaidMinor, 0);
  const settled = items.every((i) => i.status === "paid" || i.status === "rejected" || !!i.rejectionReason); // partial + reason = insurer's final answer
  let status = claim.status;
  if (items.length && items.every((i) => i.status === "rejected")) status = "rejected";
  else if (settled && paid > 0) status = "paid";
  else if (paid > 0) status = "partially_paid";
  const [updated] = await t.update(claims).set({ totalClaimedMinor: claimed, totalPaidMinor: paid, status }).where(eq(claims.id, claimId)).returning();
  return updated;
}

/** Deletes a draft claim so its invoices can be claimed again. */
export async function deleteDraftClaim(t: Tx, claimId: string) {
  const [c] = await t.select().from(claims).where(eq(claims.id, claimId));
  if (!c || c.status !== "draft") throw new UserError("Only draft claims can be deleted");
  await t.delete(claimItems).where(eq(claimItems.claimId, claimId));
  await t.delete(claims).where(eq(claims.id, claimId));
}

/** Everything a claim form needs: items with patient, member no, date, ICD-10 codes and services. */
export async function claimDetail(t: Tx, claimId: string) {
  const [claim] = await t.select().from(claims).innerJoin(insurers, eq(insurers.id, claims.insurerId)).where(eq(claims.id, claimId));
  if (!claim) return null;
  const rows = await t.select({ item: claimItems, inv: invoices, p: { id: patients.id, firstName: patients.firstName, lastName: patients.lastName, patientNo: patients.patientNo, memberNo: patients.memberNo, dob: patients.dob } })
    .from(claimItems).innerJoin(invoices, eq(invoices.id, claimItems.invoiceId)).innerJoin(patients, eq(patients.id, invoices.patientId))
    .where(eq(claimItems.claimId, claimId)).orderBy(invoices.issuedAt);
  const invIds = rows.map((r) => r.inv.id);
  const visitIds = rows.map((r) => r.inv.visitId).filter((v): v is string => !!v);
  const lines = invIds.length ? await t.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invIds)) : [];
  const dx = visitIds.length ? await t.select().from(diagnoses).where(inArray(diagnoses.visitId, visitIds)) : [];
  return {
    claim: claim.claims, insurer: claim.insurers,
    items: rows.map((r) => ({
      ...r,
      services: lines.filter((l) => l.invoiceId === r.inv.id && l.insurerCovered),
      diagnoses: dx.filter((d) => d.visitId === r.inv.visitId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    })),
  };
}
