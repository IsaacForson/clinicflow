/**
 * Pure currency maths shared by server and client. Amounts are integer minor units (1/100 of the major unit) in every currency.
 * Rates are "units of currency per 1 USD".
 */
import { PLANS, SCRIBE_PRICE_USD, type PlanKey } from "./plans";

/** Fallback rates used until the daily refresh (or an admin) sets real ones. Approximate; for display maths only. */
export const DEFAULT_PER_USD: Record<string, number> = {
  USD: 1, GHS: 15.5, NGN: 1550, KES: 129, UGX: 3700, TZS: 2700, RWF: 1420, ZAR: 18.2, ZMW: 26.5, XOF: 600, XAF: 600, GBP: 0.78,
};
export type Rates = Record<string, number>;

export function convertMinor(minor: number, from: string, to: string, rates: Rates): number {
  if (from === to) return minor;
  const f = rates[from] ?? DEFAULT_PER_USD[from], t = rates[to] ?? DEFAULT_PER_USD[to];
  if (!f || !t) throw new Error(`No exchange rate for ${from} or ${to}`);
  return Math.round((minor / f) * t);
}

/** Rounds a price (major units) to a clean figure customers expect: 79 → 79, 1224.5 → 1,225, 122,450 → 122,500. */
export function nicePrice(major: number): number {
  const step = major < 100 ? 1 : major < 1_000 ? 5 : major < 10_000 ? 25 : major < 100_000 ? 100 : major < 1_000_000 ? 500 : 1_000;
  return Math.ceil(major / step) * step;
}

export const MIGRATION_USD = { basic: 99, standard: 199, full: 299 } as const;
export type MigrationKey = keyof typeof MIGRATION_USD;

export type PriceList = { currency: string; plans: Record<PlanKey, number>; scribe: number; migration: Record<MigrationKey, number>; custom: boolean };

/** List prices in a currency (minor units), converted from USD and rounded, unless a custom row is given. */
export function priceListFor(currency: string, rates: Rates, custom?: { solo: number; clinic: number; group: number; scribe: number; migrationBasic: number; migrationStandard: number; migrationFull: number } | null): PriceList {
  if (custom) {
    return { currency, custom: true, plans: { solo: custom.solo, clinic: custom.clinic, group: custom.group }, scribe: custom.scribe,
      migration: { basic: custom.migrationBasic, standard: custom.migrationStandard, full: custom.migrationFull } };
  }
  const conv = (usd: number) => nicePrice(convertMinor(usd * 100, "USD", currency, rates) / 100) * 100;
  return {
    currency, custom: false,
    plans: { solo: conv(PLANS.solo.priceUsd), clinic: conv(PLANS.clinic.priceUsd), group: conv(PLANS.group.priceUsd) },
    scribe: conv(SCRIBE_PRICE_USD),
    migration: { basic: conv(MIGRATION_USD.basic), standard: conv(MIGRATION_USD.standard), full: conv(MIGRATION_USD.full) },
  };
}

/** Amount for a subscription checkout: monthly, or annual = 10 months (2 months free). */
export const subscriptionTotal = (list: PriceList, plan: PlanKey, cycle: "monthly" | "annual", scribeSeats: number) =>
  (list.plans[plan] + scribeSeats * list.scribe) * (cycle === "annual" ? 10 : 1);

/** Monthly recurring value of a clinic in its own currency (annual spread over 12; non-paying = 0). */
export function clinicMrrMinor(list: PriceList, t: { plan: PlanKey; planStatus: string; billingCycle: string; scribeSeats: number; suspendedAt?: Date | string | null }) {
  if (t.planStatus !== "active" || t.suspendedAt) return 0;
  const base = list.plans[t.plan] + t.scribeSeats * list.scribe;
  return t.billingCycle === "annual" ? Math.round((base * 10) / 12) : base;
}

/** Currencies Paystack can charge. Others are billed in USD at the USD list price (shown with a local estimate). */
export const PAYSTACK_CURRENCIES = new Set(["GHS", "NGN", "KES", "ZAR", "USD", "XOF"]);
