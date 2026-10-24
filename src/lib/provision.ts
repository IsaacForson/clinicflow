import { adminDb } from "@/db";
import { branches, labTests, messageTemplates, services, tenants, users } from "@/db/schema";
import { hashPassword } from "./crypto";
import { DEFAULT_TEMPLATES } from "./messaging";
import { TRIAL_DAYS } from "./plans";

export const COUNTRIES: Record<string, { name: string; currency: string; timezone: string }> = {
  GH: { name: "Ghana", currency: "GHS", timezone: "Africa/Accra" },
  NG: { name: "Nigeria", currency: "NGN", timezone: "Africa/Lagos" },
  KE: { name: "Kenya", currency: "KES", timezone: "Africa/Nairobi" },
  UG: { name: "Uganda", currency: "UGX", timezone: "Africa/Kampala" },
  TZ: { name: "Tanzania", currency: "TZS", timezone: "Africa/Dar_es_Salaam" },
  RW: { name: "Rwanda", currency: "RWF", timezone: "Africa/Kigali" },
  ZA: { name: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg" },
  ZM: { name: "Zambia", currency: "ZMW", timezone: "Africa/Lusaka" },
  CI: { name: "Côte d'Ivoire", currency: "XOF", timezone: "Africa/Abidjan" },
  SN: { name: "Senegal", currency: "XOF", timezone: "Africa/Dakar" },
  CM: { name: "Cameroon", currency: "XAF", timezone: "Africa/Douala" },
  GB: { name: "United Kingdom", currency: "GBP", timezone: "Europe/London" },
  US: { name: "United States", currency: "USD", timezone: "America/New_York" },
};

const STARTER_SERVICES: [string, "consultation" | "lab" | "procedure" | "imaging", number, number][] = [
  ["General consultation", "consultation", 15000, 15], ["Follow-up consultation", "consultation", 8000, 10],
  ["Specialist consultation", "consultation", 30000, 20], ["Wound dressing", "procedure", 5000, 15],
  ["Injection administration", "procedure", 2000, 5], ["Full blood count (FBC)", "lab", 8000, 5],
  ["Malaria RDT", "lab", 3000, 5], ["Blood glucose (RBS)", "lab", 2000, 5], ["Urinalysis", "lab", 3000, 5],
  ["Lipid profile", "lab", 15000, 5], ["Pregnancy test", "lab", 3000, 5], ["Ultrasound scan", "imaging", 25000, 20],
];

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clinic";
}

export async function provisionTenant(o: { clinicName: string; country: string; ownerName: string; email?: string; phone?: string; password: string }) {
  const c = COUNTRIES[o.country] ?? COUNTRIES.GH;
  const passwordHash = await hashPassword(o.password);
  return adminDb().transaction(async (t) => {
    const [tenant] = await t.insert(tenants).values({
      name: o.clinicName, slug: `${slugify(o.clinicName)}-${Math.random().toString(36).slice(2, 7)}`,
      country: o.country, currency: c.currency, timezone: c.timezone, phone: o.phone, email: o.email,
      plan: "clinic", planStatus: "trialing", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000),
    }).returning();
    await t.insert(branches).values({ tenantId: tenant.id, name: "Main branch", isMain: true, phone: o.phone });
    const [owner] = await t.insert(users).values({
      tenantId: tenant.id, name: o.ownerName, email: o.email?.toLowerCase() || null, phone: o.phone || null,
      passwordHash, role: "owner", isPractitioner: true, title: "Dr.",
    }).returning();
    const svc = await t.insert(services).values(STARTER_SERVICES.map(([name, category, priceMinor, durationMin]) => ({ tenantId: tenant.id, name, category, priceMinor, durationMin }))).returning();
    await t.insert(labTests).values(svc.filter((s) => s.category === "lab" || s.category === "imaging").map((s) => ({ tenantId: tenant.id, name: s.name, kind: s.category === "imaging" ? "imaging" : "lab", serviceId: s.id })));
    await t.insert(messageTemplates).values(Object.entries(DEFAULT_TEMPLATES).map(([key, body]) => ({ tenantId: tenant.id, key, body })));
    return { tenant, owner };
  });
}
