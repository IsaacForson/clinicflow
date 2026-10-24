import { describe, expect, it } from "vitest";
import { clinicMrrMinor, convertMinor, nicePrice, priceListFor, subscriptionTotal } from "../money";

const rates = { USD: 1, GHS: 15.5, NGN: 1550 };

describe("money", () => {
  it("converts between currencies through USD", () => {
    expect(convertMinor(7900, "USD", "GHS", rates)).toBe(122450);
    expect(convertMinor(155000, "GHS", "NGN", rates)).toBe(15500000);
    expect(convertMinor(500, "GHS", "GHS", rates)).toBe(500);
  });
  it("rounds to clean prices", () => {
    expect(nicePrice(79)).toBe(79);
    expect(nicePrice(1224.5)).toBe(1225);
    expect(nicePrice(122450)).toBe(122500);
    expect(nicePrice(449.6)).toBe(450);
  });
  it("builds a local price list, preferring custom prices", () => {
    const ghs = priceListFor("GHS", rates);
    expect(ghs.plans.clinic).toBe(122500); // 79 × 15.5 = 1224.5 → GHS 1,225.00
    expect(ghs.custom).toBe(false);
    const custom = priceListFor("GHS", rates, { solo: 30000, clinic: 75000, group: 180000, scribe: 15000, migrationBasic: 1, migrationStandard: 2, migrationFull: 3 });
    expect(custom.plans.clinic).toBe(75000);
    expect(subscriptionTotal(custom, "clinic", "annual", 1)).toBe((75000 + 15000) * 10);
  });
  it("keeps USD list prices exact", () => {
    expect(priceListFor("USD", rates).plans.group).toBe(19900);
  });
  it("computes MRR in the clinic's currency", () => {
    const ghs = priceListFor("GHS", rates);
    const t = { plan: "clinic" as const, planStatus: "active", billingCycle: "annual", scribeSeats: 0 };
    expect(clinicMrrMinor(ghs, t)).toBe(Math.round((122500 * 10) / 12));
    expect(clinicMrrMinor(ghs, { ...t, planStatus: "trialing" })).toBe(0);
  });
});
