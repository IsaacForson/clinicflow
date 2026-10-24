export type Cycle = "monthly" | "annual";
/** Annual = 10 months (2 months free). */
export const cycleMonths = (c: Cycle) => (c === "annual" ? 10 : 1);

export const MIGRATION_TIERS = {
  basic: { name: "Spreadsheet import", detail: "Patients and price list from Excel/CSV, up to 5,000 patients." },
  standard: { name: "Software switch", detail: "Patients, appointments and balances from your current system." },
  full: { name: "Full migration", detail: "Everything including visit history and documents, multi-branch, with a verification call." },
} as const;
export type MigrationTier = keyof typeof MIGRATION_TIERS;
