// Built-in schedule templates (tenant_id null): `npx tsx scripts/seed-schedules.mts`. Idempotent (replaces by name).
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "../src/db";
import { scheduleTemplates } from "../src/db/schema";

const w = (weeks: number) => weeks * 7;
const m = (months: number) => Math.round(months * 30.44);

// WHO / Ghana EPI-style childhood schedule, offsets from date of birth.
const epi = [
  ...["BCG", "OPV 0 (birth dose)", "Hepatitis B (birth dose)"].map((name) => ({ name, offsetDays: 0 })),
  ...[6, 10, 14].flatMap((wk, i) => [`OPV ${i + 1}`, `Pentavalent (DTP-HepB-Hib) ${i + 1}`, `Pneumococcal (PCV) ${i + 1}`, ...(i < 2 ? [`Rotavirus ${i + 1}`] : [])]
    .map((name) => ({ name, offsetDays: w(wk) }))),
  { name: "IPV (inactivated polio)", offsetDays: w(14) },
  { name: "Vitamin A (100,000 IU)", offsetDays: m(6) },
  { name: "Measles-Rubella 1", offsetDays: m(9) },
  { name: "Yellow fever", offsetDays: m(9) },
  { name: "Vitamin A (200,000 IU)", offsetDays: m(12) },
  { name: "Measles-Rubella 2", offsetDays: m(18) },
  { name: "Vitamin A (200,000 IU)", offsetDays: m(18) },
];

// WHO 2016 ANC model: 8 contacts, offsets from the first day of the last menstrual period.
const anc = [12, 20, 26, 30, 34, 36, 38, 40].map((wk, i) => ({ name: `ANC contact ${i + 1} (${wk} weeks)`, offsetDays: w(wk) }));

const templates = [
  { kind: "immunization", name: "Childhood immunization (EPI)", items: epi },
  { kind: "antenatal", name: "Antenatal care (WHO 8 contacts)", items: anc },
];

const db = adminDb();
for (const t of templates) {
  const [existing] = await db.select({ id: scheduleTemplates.id }).from(scheduleTemplates).where(and(isNull(scheduleTemplates.tenantId), eq(scheduleTemplates.name, t.name)));
  if (existing) await db.update(scheduleTemplates).set({ kind: t.kind, items: t.items }).where(eq(scheduleTemplates.id, existing.id));
  else await db.insert(scheduleTemplates).values({ tenantId: null, ...t });
  console.log(`${existing ? "updated" : "created"}: ${t.name} (${t.items.length} items)`);
}
process.exit(0);
