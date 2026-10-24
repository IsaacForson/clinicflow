import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, withTenant, type Tx } from "@/db";
import * as s from "@/db/schema";
import type { Ctx } from "@/lib/auth";
import { addLine, createInvoice, issueInvoice, patientCredit, recordPayment } from "@/lib/billing";
import { buildClaim, claimableInvoices, settleClaimItem } from "@/lib/billing/claims";

let ctx: Ctx;
let patientId: string, selfPayId: string, serviceId: string, insurerId: string;
const T = <R,>(fn: (t: Tx) => Promise<R>) => withTenant(ctx.tenant.id, fn);
const cid = () => crypto.randomUUID();

beforeAll(async () => {
  const db = adminDb();
  const [tenant] = await db.insert(s.tenants).values({ name: "Money test", slug: `money-${Date.now()}` }).returning();
  const [br] = await db.insert(s.branches).values({ tenantId: tenant.id, name: "Main", isMain: true }).returning();
  const [user] = await db.insert(s.users).values({ tenantId: tenant.id, name: "Cashier", role: "owner" }).returning();
  const [ins] = await db.insert(s.insurers).values({ tenantId: tenant.id, name: "NHIS", coveragePercent: 80 }).returning();
  const [svc] = await db.insert(s.services).values({ tenantId: tenant.id, name: "Consult", priceMinor: 10000 }).returning();
  await db.insert(s.insurerTariffs).values({ tenantId: tenant.id, insurerId: ins.id, serviceId: svc.id, priceMinor: 8000 });
  const [p] = await db.insert(s.patients).values({ tenantId: tenant.id, patientNo: "P-1", firstName: "Ama", lastName: "Mensah", insurerId: ins.id, memberNo: "M1" }).returning();
  const [q] = await db.insert(s.patients).values({ tenantId: tenant.id, patientNo: "P-2", firstName: "Kofi", lastName: "Boateng" }).returning();
  ctx = { tenant, user, branchId: br.id, sessionId: "x", branches: [], access: "full", ip: null, impersonatedBy: null };
  patientId = p.id; selfPayId = q.id; serviceId = svc.id; insurerId = ins.id;
});

afterAll(async () => {
  await adminDb().delete(s.tenants).where(eq(s.tenants.id, ctx.tenant.id));
});

describe("invoice money", () => {
  it("splits insurer and patient share using tariff and coverage %", async () => {
    const inv = await T(async (t) => {
      const i = await createInvoice(t, ctx, { patientId });
      await addLine(t, i.id, { serviceId }); // tariff 80.00, covered
      await addLine(t, i.id, { description: "Bandage", unitPriceMinor: 500, quantity: 2 }); // not covered
      return issueInvoice(t, ctx, i.id);
    });
    expect(inv.subtotalMinor).toBe(9000);
    expect(inv.insurerPortionMinor).toBe(6400); // 80% of 8000
    expect(inv.patientPortionMinor).toBe(2600);
    expect(inv.status).toBe("issued");
  });

  it("handles part payments, refuses overpayment, and is idempotent on clientId", async () => {
    const id = await T(async (t) => {
      const i = await createInvoice(t, ctx, { patientId: selfPayId });
      await addLine(t, i.id, { serviceId });
      await issueInvoice(t, ctx, i.id);
      return i.id;
    });
    const key = cid();
    await T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 4000, method: "cash", clientId: key }));
    await T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 4000, method: "cash", clientId: key }));
    let [inv] = await T((t) => t.select().from(s.invoices).where(eq(s.invoices.id, id)));
    expect(inv.paidMinor).toBe(4000);
    expect(inv.status).toBe("partially_paid");
    await expect(T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 7000, method: "mobile_money" }))).rejects.toThrow(/more than the balance/);
    await T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 6000, method: "mobile_money", reference: "MM1" }));
    [inv] = await T((t) => t.select().from(s.invoices).where(eq(s.invoices.id, id)));
    expect(inv.status).toBe("paid");
  });

  it("takes a deposit and applies it as credit", async () => {
    await T((t) => recordPayment(t, ctx, { patientId: selfPayId, amountMinor: 3000, method: "cash" }));
    expect(await T((t) => patientCredit(t, selfPayId))).toBe(3000);
    const id = await T(async (t) => {
      const i = await createInvoice(t, ctx, { patientId: selfPayId });
      await addLine(t, i.id, { description: "Dressing", unitPriceMinor: 2000 });
      return i.id;
    });
    await T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 2000, method: "deposit" }));
    expect(await T((t) => patientCredit(t, selfPayId))).toBe(1000);
    await expect(T((t) => recordPayment(t, ctx, { invoiceId: id, patientId: selfPayId, amountMinor: 1, method: "deposit" }))).rejects.toThrow();
  });
});

describe("claims", () => {
  const start = new Date(Date.now() - 86400_000), end = new Date(Date.now() + 86400_000);
  const day = new Date().toISOString().slice(0, 10);

  it("builds a claim from unclaimed insurer balances and never claims an invoice twice", async () => {
    const claim = await T((t) => buildClaim(t, ctx, { insurerId, periodStart: day, periodEnd: day, start, end }));
    expect(claim.totalClaimedMinor).toBe(6400);
    expect(await T((t) => claimableInvoices(t, insurerId, start, end))).toHaveLength(0);
    await expect(T((t) => buildClaim(t, ctx, { insurerId, periodStart: day, periodEnd: day, start, end }))).rejects.toThrow(/No unclaimed/);
  });

  it("records insurer payments on the invoice and rolls up claim status", async () => {
    const [item] = await T((t) => t.select().from(s.claimItems));
    const key = cid();
    let claim = await T((t) => settleClaimItem(t, ctx, { itemId: item.id, outcome: "partially_paid", amountMinor: 4000, clientId: key }));
    claim = await T((t) => settleClaimItem(t, ctx, { itemId: item.id, outcome: "partially_paid", amountMinor: 4000, clientId: key })); // replay
    expect(claim.totalPaidMinor).toBe(4000);
    expect(claim.status).toBe("partially_paid");
    const [inv] = await T((t) => t.select().from(s.invoices).where(eq(s.invoices.id, item.invoiceId)));
    expect(inv.insurerPaidMinor).toBe(4000);
    expect(inv.paidMinor).toBe(0); // insurer money never counts as patient payment
    claim = await T((t) => settleClaimItem(t, ctx, { itemId: item.id, outcome: "rejected", reason: "Not covered" }));
    expect(claim.status).toBe("paid"); // settled with partial payment
  });
});

describe("paystack webhook", () => {
  const key = "sk_test_webhook";
  const send = async (body: unknown, secret = key) => {
    const { POST } = await import("@/app/api/webhooks/paystack/route");
    const raw = JSON.stringify(body);
    const sig = createHmac("sha512", secret).update(raw).digest("hex");
    return POST(new Request("http://x/api/webhooks/paystack", { method: "POST", body: raw, headers: { "x-paystack-signature": sig } }));
  };
  beforeAll(() => { process.env.PAYSTACK_SECRET_KEY = key; });

  it("records a patient payment once and puts any excess on account", async () => {
    const inv = await T(async (t) => {
      const i = await createInvoice(t, ctx, { patientId: selfPayId });
      await addLine(t, i.id, { description: "Scan", unitPriceMinor: 5000 });
      return issueInvoice(t, ctx, i.id);
    });
    const credit = await T((t) => patientCredit(t, selfPayId));
    const evt = { event: "charge.success", data: { reference: `ref-${cid()}`, amount: 6000, currency: "GHS", channel: "mobile_money", metadata: { kind: "patient_payment", tenantId: ctx.tenant.id, invoiceId: inv.id, patientId: selfPayId } } };
    expect((await send(evt)).status).toBe(200);
    expect((await send(evt)).status).toBe(200); // duplicate delivery
    const [after] = await T((t) => t.select().from(s.invoices).where(eq(s.invoices.id, inv.id)));
    expect(after.status).toBe("paid");
    expect(await T((t) => patientCredit(t, selfPayId))).toBe(credit + 1000);
    expect((await send(evt, "wrong")).status).toBe(401);
  });

  it("activates a subscription only when signed by the platform key", async () => {
    const cus = `CUS_${cid()}`;
    const evt = { event: "charge.success", data: { reference: `sub-${cid()}`, amount: 7900, currency: "USD", customer: { customer_code: cus }, metadata: { kind: "subscription", tenantId: ctx.tenant.id, plan: "group", cycle: "annual", scribeSeats: 2 } } };
    expect((await send(evt, "sk_clinic_own")).status).toBe(401);
    expect((await send(evt)).status).toBe(200);
    expect((await send(evt)).status).toBe(200);
    const [tn] = await adminDb().select().from(s.tenants).where(eq(s.tenants.id, ctx.tenant.id));
    expect([tn.plan, tn.planStatus, tn.billingCycle, tn.scribeSeats]).toEqual(["group", "active", "annual", 2]);
    expect(tn.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 360 * 86400_000);
    expect(tn.currentPeriodEnd!.getTime()).toBeLessThan(Date.now() + 370 * 86400_000); // duplicate didn't extend twice
    await send({ event: "invoice.payment_failed", data: { customer: { customer_code: cus }, subscription: { subscription_code: "SUB_1" } } });
    const [t2] = await adminDb().select().from(s.tenants).where(eq(s.tenants.id, ctx.tenant.id));
    expect(t2.planStatus).toBe("past_due");
  });
});
