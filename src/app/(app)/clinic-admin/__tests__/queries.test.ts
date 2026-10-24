import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, withTenant, type Tx } from "@/db";
import * as s from "@/db/schema";
import type { Ctx } from "@/lib/auth";
import { addLine, createInvoice, issueInvoice, recordPayment, reversePayment } from "@/lib/billing";
import { localDay } from "@/lib/format";
import { resolvePeriod } from "../lib";
import { activity, overview, team, usage } from "../queries";

let ctx: Ctx;
const T = <R,>(fn: (t: Tx) => Promise<R>) => withTenant(ctx.tenant.id, fn);
const filter = () => ({ branchIds: ctx.branches.map((b) => b.id), period: resolvePeriod("month", ctx.tenant.timezone) });

beforeAll(async () => {
  const db = adminDb();
  const [tenant] = await db.insert(s.tenants).values({ name: "Console test", slug: `console-${Date.now()}` }).returning();
  const [br] = await db.insert(s.branches).values({ tenantId: tenant.id, name: "Main", isMain: true }).returning();
  const [other] = await db.insert(s.branches).values({ tenantId: tenant.id, name: "Other" }).returning();
  const [user] = await db.insert(s.users).values({ tenantId: tenant.id, name: "Owner", role: "owner" }).returning();
  const [ins] = await db.insert(s.insurers).values({ tenantId: tenant.id, name: "NHIS", coveragePercent: 100 }).returning();
  const [svc] = await db.insert(s.services).values({ tenantId: tenant.id, name: "Consult", priceMinor: 10000 }).returning();
  await db.insert(s.insurerTariffs).values({ tenantId: tenant.id, insurerId: ins.id, serviceId: svc.id, priceMinor: 8000 });
  const [insured] = await db.insert(s.patients).values({ tenantId: tenant.id, patientNo: "P-1", firstName: "Ama", lastName: "Mensah", insurerId: ins.id }).returning();
  const [self] = await db.insert(s.patients).values({ tenantId: tenant.id, patientNo: "P-2", firstName: "Kofi", lastName: "Boateng" }).returning();
  ctx = { tenant, user, branchId: br.id, sessionId: "x", branches: [{ id: br.id, name: "Main" }, { id: other.id, name: "Other" }], access: "full", ip: null, impersonatedBy: null };

  await T(async (t) => {
    const bill = async (patientId: string) => {
      const i = await createInvoice(t, ctx, { patientId });
      await addLine(t, i.id, { serviceId: svc.id });
      return (await issueInvoice(t, ctx, i.id)).id;
    };
    const a = await bill(self.id); // 100.00, all patient
    const b = await bill(insured.id); // 80.00, all insurer
    await recordPayment(t, ctx, { invoiceId: a, patientId: self.id, amountMinor: 6000, method: "cash" });
    const oops = await recordPayment(t, ctx, { invoiceId: a, patientId: self.id, amountMinor: 1000, method: "card" });
    await reversePayment(t, ctx, { paymentId: oops.id, reason: "Wrong card" });
    await recordPayment(t, ctx, { patientId: self.id, amountMinor: 2000, method: "mobile_money" }); // deposit
    await recordPayment(t, ctx, { invoiceId: a, patientId: self.id, amountMinor: 2000, method: "deposit" }); // applied: not new money
    await recordPayment(t, ctx, { invoiceId: b, patientId: insured.id, amountMinor: 5000, method: "insurance" });
    await t.insert(s.expenses).values({ tenantId: tenant.id, branchId: br.id, category: "Rent", amountMinor: 3000, day: localDay(tenant.timezone) });
    // Other branch money: only visible when that branch is selected.
    await t.insert(s.payments).values({ tenantId: tenant.id, branchId: other.id, amountMinor: 999, method: "cash", patientId: self.id });
  });
});

afterAll(async () => {
  await adminDb().delete(s.tenants).where(eq(s.tenants.id, ctx.tenant.id));
});

describe("admin console overview", () => {
  it("counts collected money once, excludes refunds and deposit applications, and splits by payer", async () => {
    const d = await T((t) => overview(t, ctx, { ...filter(), branchIds: [ctx.branchId] }));
    expect(d.money.collected).toBe(6000 + 2000 + 5000);
    expect(d.money.patientCollected).toBe(8000);
    expect(d.billed).toMatchObject({ invoiced: 18000, patientBilled: 10000 });
    expect(d.rates.collection).toBe(80);
    expect(d.balances).toMatchObject({ patientOwes: 2000, insurerOwes: 3000, debtors: 1 });
    expect(d.expenses.cur).toBe(3000);
    expect(d.mix.payers).toEqual([{ label: "Self-pay", amount: 8000, n: 2 }, { label: "NHIS", amount: 5000, n: 1 }]);
    expect(d.mix.services).toEqual([{ label: "Consult", qty: 2, amount: 18000 }]);
    expect(d.insurance.receivables).toEqual([{ label: "NHIS", amount: 3000, invoices: 1 }]);
    expect(d.months.collected.at(-1)).toBe(13000);
    expect(d.months.collected).toHaveLength(12);
    expect(d.patients.total).toBe(2);
  });

  it("respects the branch filter", async () => {
    const all = await T((t) => overview(t, ctx, filter()));
    expect(all.money.collected).toBe(13999);
    const [, other] = ctx.branches;
    const one = await T((t) => overview(t, ctx, { ...filter(), branchIds: [other.id] }));
    expect(one.money.collected).toBe(999);
    expect(one.billed.invoiced).toBe(0);
  });

  it("reports team activity, usage and the activity feed", async () => {
    const [me] = await T((t) => team(t, ctx, filter()));
    expect(me).toMatchObject({ name: "Owner", invoices: 2, payments: 3, collected: 13000 });
    expect(await T((t) => usage(t, ctx, `${localDay(ctx.tenant.timezone).slice(0, 7)}-01`))).toMatchObject({ users: 1, branches: 2, reminders: 0 });
    const refunds = await T((t) => activity(t, { type: "refunds", userId: ctx.user.id, limit: 10, offset: 0 }));
    expect(refunds).toHaveLength(1);
    const feed = await T((t) => activity(t, { type: null, userId: null, limit: 50, offset: 0 }));
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((r) => r.action !== "issue")).toBe(true); // routine actions stay out of the feed
  });
});
