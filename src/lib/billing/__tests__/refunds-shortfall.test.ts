import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, withTenant, type Tx } from "@/db";
import * as s from "@/db/schema";
import type { Ctx } from "@/lib/auth";
import { addLine, createInvoice, issueInvoice, patientCredit, recordPayment, reversePayment, settleInsurerShortfall } from "@/lib/billing";
import { buildClaim, settleClaimItem } from "@/lib/billing/claims";
import { dayMoney } from "@/lib/billing/cashup";

let ctx: Ctx;
let insuredId: string, selfPayId: string, serviceId: string, insurerId: string;
const T = <R,>(fn: (t: Tx) => Promise<R>) => withTenant(ctx.tenant.id, fn);
const invoice = (id: string) => T(async (t) => (await t.select().from(s.invoices).where(eq(s.invoices.id, id)))[0]);
async function bill(patientId: string) {
  return T(async (t) => {
    const i = await createInvoice(t, ctx, { patientId });
    await addLine(t, i.id, { serviceId }); // 100.00, insurer tariff 80.00
    return (await issueInvoice(t, ctx, i.id)).id;
  });
}

beforeAll(async () => {
  const db = adminDb();
  const [tenant] = await db.insert(s.tenants).values({ name: "Refund test", slug: `refund-${Date.now()}` }).returning();
  const [br] = await db.insert(s.branches).values({ tenantId: tenant.id, name: "Main", isMain: true }).returning();
  const [user] = await db.insert(s.users).values({ tenantId: tenant.id, name: "Owner", role: "owner" }).returning();
  const [ins] = await db.insert(s.insurers).values({ tenantId: tenant.id, name: "NHIS", coveragePercent: 100 }).returning();
  const [svc] = await db.insert(s.services).values({ tenantId: tenant.id, name: "Consult", priceMinor: 10000 }).returning();
  await db.insert(s.insurerTariffs).values({ tenantId: tenant.id, insurerId: ins.id, serviceId: svc.id, priceMinor: 8000 });
  const [a] = await db.insert(s.patients).values({ tenantId: tenant.id, patientNo: "P-1", firstName: "Ama", lastName: "Mensah", insurerId: ins.id }).returning();
  const [b] = await db.insert(s.patients).values({ tenantId: tenant.id, patientNo: "P-2", firstName: "Kofi", lastName: "Boateng" }).returning();
  ctx = { tenant, user, branchId: br.id, sessionId: "x", branches: [], access: "full", ip: null, impersonatedBy: null };
  insuredId = a.id; selfPayId = b.id; serviceId = svc.id; insurerId = ins.id;
});

afterAll(async () => {
  await adminDb().delete(s.tenants).where(eq(s.tenants.id, ctx.tenant.id));
});

describe("payment reversal", () => {
  it("refunds a payment, reopens the invoice, keeps the row, and counts on the refund day", async () => {
    const id = await bill(selfPayId);
    const p = await T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 10000, method: "cash" }));
    expect((await invoice(id)).status).toBe("paid");
    await T((t) => reversePayment(t, ctx, { paymentId: p.id, reason: "Overcharged" }));
    const inv = await invoice(id);
    expect(inv.paidMinor).toBe(0);
    expect(inv.status).toBe("issued");
    const [row] = await T((t) => t.select().from(s.payments).where(eq(s.payments.id, p.id)));
    expect(row.status).toBe("refunded");
    expect(row.refundReason).toBe("Overcharged");
    const now = new Date();
    const m = await T((t) => dayMoney(t, { branchId: ctx.branchId, start: new Date(now.getTime() - 3600_000), end: new Date(now.getTime() + 3600_000) }));
    expect(m.cashIn).toBe(10000); // still received today
    expect(m.cashRefunded).toBe(10000); // and given back today
    await expect(T((t) => reversePayment(t, ctx, { paymentId: p.id, reason: "again" }))).rejects.toThrow(/Only completed/);
  });

  it("won't reverse a deposit that was already used", async () => {
    const dep = await T((t) => recordPayment(t, ctx, { patientId: selfPayId, amountMinor: 5000, method: "cash" }));
    const id = await bill(selfPayId);
    const applied = await T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 3000, method: "deposit" }));
    await expect(T((t) => reversePayment(t, ctx, { paymentId: dep.id, reason: "Patient left" }))).rejects.toThrow(/already been used/);
    await T((t) => reversePayment(t, ctx, { paymentId: applied.id, reason: "Undo credit" }));
    expect(await T((t) => patientCredit(t, selfPayId))).toBe(5000);
    await T((t) => reversePayment(t, ctx, { paymentId: dep.id, reason: "Patient left" }));
    expect(await T((t) => patientCredit(t, selfPayId))).toBe(0);
  });
});

describe("insurer shortfall", () => {
  it("moves a rejected claim to the patient's balance", async () => {
    const id = await bill(insuredId);
    let inv = await invoice(id);
    expect(inv.insurerPortionMinor).toBe(8000);
    expect(inv.patientPortionMinor).toBe(0);
    const claim = await T((t) => buildClaim(t, ctx, { insurerId, periodStart: "2000-01-01", periodEnd: "2100-01-01", start: new Date(0), end: new Date(Date.now() + 86400_000) }));
    await T((t) => t.update(s.claims).set({ status: "submitted" }).where(eq(s.claims.id, claim.id)));
    const [item] = await T((t) => t.select().from(s.claimItems).where(eq(s.claimItems.invoiceId, id)));
    await T((t) => settleClaimItem(t, ctx, { itemId: item.id, outcome: "partially_paid", amountMinor: 5000, reason: "Tariff cap", clientId: crypto.randomUUID(), shortfall: "bill_patient" }));
    inv = await invoice(id);
    expect(inv.insurerPaidMinor).toBe(5000);
    expect(inv.insurerShortfallMinor).toBe(3000);
    expect(inv.insurerPortionMinor).toBe(5000);
    expect(inv.patientPortionMinor).toBe(3000);
    expect(inv.totalMinor).toBe(8000);
    expect(inv.status).toBe("issued"); // patient now owes 30.00
  });

  it("writes off instead of billing the patient", async () => {
    const id = await bill(insuredId);
    await T((t) => settleInsurerShortfall(t, ctx, { invoiceId: id, mode: "write_off", reason: "Goodwill" }));
    const inv = await invoice(id);
    expect(inv.insurerWriteoffMinor).toBe(8000);
    expect(inv.insurerPortionMinor).toBe(0);
    expect(inv.patientPortionMinor).toBe(0);
    expect(inv.totalMinor).toBe(0);
    expect(await T((t) => settleInsurerShortfall(t, ctx, { invoiceId: id, mode: "write_off" }))).toBe(0);
  });
});

describe("stock CHECK constraint", () => {
  it("rejects negative stock at the database level", async () => {
    const [item] = await adminDb().insert(s.items).values({ tenantId: ctx.tenant.id, name: "Paracetamol" }).returning();
    const [b] = await adminDb().insert(s.stockBatches).values({ tenantId: ctx.tenant.id, itemId: item.id, branchId: ctx.branchId, qtyOnHand: 2 }).returning();
    const err = await T((t) => t.update(s.stockBatches).set({ qtyOnHand: sql`${s.stockBatches.qtyOnHand} - 3` }).where(eq(s.stockBatches.id, b.id))).catch((e) => e);
    expect(String(err?.cause?.message ?? err)).toMatch(/stock_batches_qty_nonnegative/);
  });
});
