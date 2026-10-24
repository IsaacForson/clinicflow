import { adminDb } from "@/db";
import { branches, fxRates, labTests, messageTemplates, services, tenants, users } from "@/db/schema";
import { convertMinor, DEFAULT_PER_USD, nicePrice } from "./money";
import { hashPassword } from "./crypto";
import { DEFAULT_TEMPLATES } from "./messaging";
import { TRIAL_DAYS } from "./plans";
import { COUNTRIES } from "./countries";

export { COUNTRIES } from "./countries";

// Starter prices are written in Ghana cedi minor units and converted to the clinic's currency at signup.
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
  // Keep the title separate from the name so documents don't print "Dr. Dr. Ama".
  const m = /^(dr|prof|nurse|mr|mrs|ms)\.?\s+/i.exec(o.ownerName.trim());
  const ownerName = m ? o.ownerName.trim().slice(m[0].length) : o.ownerName.trim();
  const title = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + "." : null;
  const rateRows = await adminDb().select().from(fxRates);
  const rates = { ...DEFAULT_PER_USD, ...Object.fromEntries(rateRows.map((r) => [r.currency, r.perUsd])) };
  const localPrice = (ghsMinor: number) => c.currency === "GHS" ? ghsMinor : nicePrice(convertMinor(ghsMinor, "GHS", c.currency, rates) / 100) * 100;
  return adminDb().transaction(async (t) => {
    const [tenant] = await t.insert(tenants).values({
      name: o.clinicName, slug: `${slugify(o.clinicName)}-${Math.random().toString(36).slice(2, 7)}`,
      country: o.country, currency: c.currency, timezone: c.timezone, phone: o.phone, email: o.email,
      plan: "clinic", planStatus: "trialing", trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86400_000),
    }).returning();
    await t.insert(branches).values({ tenantId: tenant.id, name: "Main branch", isMain: true, phone: o.phone });
    const [owner] = await t.insert(users).values({
      tenantId: tenant.id, name: ownerName, email: o.email?.toLowerCase() || null, phone: o.phone || null,
      passwordHash, role: "owner", isPractitioner: true, title,
    }).returning();
    const svc = await t.insert(services).values(STARTER_SERVICES.map(([name, category, priceMinor, durationMin]) => ({ tenantId: tenant.id, name, category, priceMinor: localPrice(priceMinor), durationMin }))).returning();
    await t.insert(labTests).values(svc.filter((s) => s.category === "lab" || s.category === "imaging").map((s) => ({ tenantId: tenant.id, name: s.name, kind: s.category === "imaging" ? "imaging" : "lab", serviceId: s.id })));
    await t.insert(messageTemplates).values(Object.entries(DEFAULT_TEMPLATES).map(([key, body]) => ({ tenantId: tenant.id, key, body })));
    return { tenant, owner };
  });
}
