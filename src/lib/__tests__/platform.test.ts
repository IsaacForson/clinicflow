import { describe, expect, it } from "vitest";
import { platformCan } from "../platform-auth";
import { priceListFor } from "../money";
import { clinicMrr, type MoneyCtx } from "../platform-metrics";

describe("clinicMrr", () => {
  const rates = { USD: 1, GHS: 15.5, NGN: 1550 };
  const m: MoneyCtx = { display: "GHS", rates, lists: new Map([["USD", priceListFor("USD", rates)], ["GHS", priceListFor("GHS", rates)], ["NGN", priceListFor("NGN", rates)]]) };
  const base = { currency: "USD", plan: "clinic" as const, planStatus: "active", billingCycle: "monthly", scribeSeats: 0, suspendedAt: null };
  it("counts only active, unsuspended clinics", () => {
    expect(clinicMrr(m, base).local).toBe(7900);
    expect(clinicMrr(m, { ...base, planStatus: "trialing" }).local).toBe(0);
    expect(clinicMrr(m, { ...base, suspendedAt: new Date() }).local).toBe(0);
  });
  it("prices each clinic in its own currency and converts to the admin's", () => {
    const ng = clinicMrr(m, { ...base, currency: "NGN" });
    expect(ng.local).toBe(12250000); // NGN 122,500 list price
    expect(ng.display).toBe(122500); // shown to a GHS admin as GHS 1,225
    expect(clinicMrr(m, { ...base, scribeSeats: 2 }).local).toBe(7900 + 3800);
    expect(clinicMrr(m, { ...base, billingCycle: "annual" }).local).toBe(Math.round((7900 * 10) / 12));
  });
});

describe("platform roles", () => {
  it("limits destructive actions to super admins", () => {
    expect(platformCan("super_admin", "clinics.delete")).toBe(true);
    expect(platformCan("support", "clinics.delete")).toBe(false);
    expect(platformCan("finance", "clinics.suspend")).toBe(false);
    expect(platformCan("support", "clinics.impersonate")).toBe(true);
    expect(platformCan("finance", "revenue.view")).toBe(true);
    expect(platformCan("support", "revenue.view")).toBe(false);
    expect(platformCan("support", "team.manage")).toBe(false);
  });
});
