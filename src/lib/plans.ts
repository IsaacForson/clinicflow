import type { Tenant } from "@/db/schema";

export const PLANS = {
  solo: { name: "Solo", priceUsd: 29, practitioners: 1, users: 2, reminders: 300, branches: 1, features: ["appointments", "records", "billing", "export"] },
  clinic: { name: "Clinic", priceUsd: 79, practitioners: 5, users: 10, reminders: 1500, branches: 1, features: ["appointments", "records", "billing", "export", "queue", "lab", "dispensary", "insurance", "branding"] },
  group: { name: "Group", priceUsd: 199, practitioners: 15, users: 40, reminders: 5000, branches: 20, features: ["appointments", "records", "billing", "export", "queue", "lab", "dispensary", "insurance", "branding", "multi_branch", "api", "accounting"] },
} as const;
export type PlanKey = keyof typeof PLANS;
export type Feature = (typeof PLANS)["group"]["features"][number];

export const SCRIBE_PRICE_USD = 19;
export const SCRIBE_NOTES_CAP = 400; // per practitioner per month, fair use
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 30; // unpaid -> read-only after this, data never locked

export const hasFeature = (t: Pick<Tenant, "plan" | "planStatus">, f: Feature) =>
  t.planStatus === "trialing" || (PLANS[t.plan].features as readonly string[]).includes(f);

/** Effective access: trial and paid accounts can write; unpaid beyond grace becomes read-only (export still allowed). */
export function accessLevel(t: Pick<Tenant, "planStatus" | "trialEndsAt" | "currentPeriodEnd">, now = new Date()): "full" | "read_only" {
  if (t.planStatus === "read_only" || t.planStatus === "cancelled") return "read_only";
  const end = t.planStatus === "trialing" ? t.trialEndsAt : (t.currentPeriodEnd ?? t.trialEndsAt);
  if (!end) return "full";
  const graceEnd = new Date(end.getTime() + GRACE_DAYS * 86400_000);
  return now > graceEnd ? "read_only" : "full";
}

/** Whole days left in the trial, or null when not trialing. */
export function trialDaysLeft(t: Pick<Tenant, "planStatus" | "trialEndsAt">, now = new Date()): number | null {
  if (t.planStatus !== "trialing" || !t.trialEndsAt) return null;
  return Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / 86400_000);
}
