import { PLANS, SCRIBE_PRICE_USD, type PlanKey } from "@/lib/plans";

export type Cycle = "monthly" | "annual";
/** Annual = 10 months (2 months free). */
export const cycleMonths = (c: Cycle) => (c === "annual" ? 10 : 1);
export const priceUsd = (plan: PlanKey, cycle: Cycle, scribeSeats: number) => (PLANS[plan].priceUsd + scribeSeats * SCRIBE_PRICE_USD) * cycleMonths(cycle);

export const MIGRATION_TIERS = {
  basic: { name: "Spreadsheet import", priceUsd: 99, detail: "Patients and price list from Excel/CSV, up to 5,000 patients." },
  standard: { name: "Software switch", priceUsd: 199, detail: "Patients, appointments and balances from your current system." },
  full: { name: "Full migration", priceUsd: 299, detail: "Everything including visit history and documents, multi-branch, with a verification call." },
} as const;
export type MigrationTier = keyof typeof MIGRATION_TIERS;
