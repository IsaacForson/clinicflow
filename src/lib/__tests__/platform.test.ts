import { describe, expect, it } from "vitest";
import { platformCan } from "../platform-auth";
import { clinicMrrUsd } from "../platform-metrics";

describe("clinicMrrUsd", () => {
  const base = { plan: "clinic" as const, planStatus: "active", billingCycle: "monthly", scribeSeats: 0, suspendedAt: null };
  it("counts only active, unsuspended clinics", () => {
    expect(clinicMrrUsd(base)).toBe(79);
    expect(clinicMrrUsd({ ...base, planStatus: "trialing" })).toBe(0);
    expect(clinicMrrUsd({ ...base, suspendedAt: new Date() })).toBe(0);
  });
  it("adds scribe seats and spreads annual (10 months) over 12", () => {
    expect(clinicMrrUsd({ ...base, scribeSeats: 2 })).toBe(79 + 38);
    expect(clinicMrrUsd({ ...base, billingCycle: "annual" })).toBeCloseTo((79 * 10) / 12);
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
