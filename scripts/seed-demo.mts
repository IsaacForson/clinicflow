/**
 * Demo clinic with staff for every role, patients, today's appointments/queue, a signed visit, invoices and stock.
 * Usage: npx tsx scripts/seed-demo.mts   (idempotent: skips if the demo tenant exists; --reset recreates it)
 *
 * Test logins (local development only), password for all: demo-password-123
 *   owner@demo.test (owner) · doctor@demo.test · nurse@demo.test · desk@demo.test · cashier@demo.test · pharmacy@demo.test · lab@demo.test
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { adminDb } from "../src/db/index";
import * as s from "../src/db/schema";
import { hashPassword } from "../src/lib/crypto";
import { addDays, localDay, zonedToUtc } from "../src/lib/format";
import { provisionTenant } from "../src/lib/provision";

const db = adminDb();
const SLUG_PREFIX = "demo-family-clinic";
const PASSWORD = "demo-password-123";

const existing = (await db.select().from(s.users).where(eq(s.users.email, "owner@demo.test")))[0];
if (existing && !process.argv.includes("--reset")) {
  console.log("Demo clinic already seeded. Use --reset to recreate.");
  process.exit(0);
}
if (existing) await db.delete(s.tenants).where(eq(s.tenants.id, existing.tenantId));

const { tenant, owner } = await provisionTenant({ clinicName: "Demo Family Clinic", country: "GH", ownerName: "Dr. Ama Mensah", email: "owner@demo.test", phone: "+233200000001", password: PASSWORD });
await db.update(s.tenants).set({ slug: `${SLUG_PREFIX}-${tenant.id.slice(0, 5)}`, address: "12 Ring Road, Accra", letterhead: "Open Mon–Sat 8am–6pm", registrationNo: "HeFRA/AC/1234", scribeSeats: 1 }).where(eq(s.tenants.id, tenant.id));
const [branch] = await db.select().from(s.branches).where(eq(s.branches.tenantId, tenant.id));
const T = tenant.id;
const tz = tenant.timezone;
const hash = await hashPassword(PASSWORD);

const staff = await db.insert(s.users).values([
  { tenantId: T, name: "Dr. Kofi Boateng", email: "doctor@demo.test", phone: "+233200000002", role: "doctor", isPractitioner: true, title: "Dr.", licenseNo: "MDC/RN/5678", passwordHash: hash, scribeEnabled: true },
  { tenantId: T, name: "Nurse Efua Owusu", email: "nurse@demo.test", phone: "+233200000003", role: "nurse", passwordHash: hash },
  { tenantId: T, name: "Abena Front Desk", email: "desk@demo.test", phone: "+233200000004", role: "front_desk", passwordHash: hash },
  { tenantId: T, name: "Yaw Cashier", email: "cashier@demo.test", phone: "+233200000005", role: "cashier", passwordHash: hash },
  { tenantId: T, name: "Akosua Pharmacist", email: "pharmacy@demo.test", phone: "+233200000006", role: "pharmacist", passwordHash: hash },
  { tenantId: T, name: "Kwesi Lab", email: "lab@demo.test", phone: "+233200000007", role: "lab", passwordHash: hash },
]).returning();
const doctor = staff[0];

const [nhis] = await db.insert(s.insurers).values([
  { tenantId: T, name: "NHIS", code: "NHIS", coveragePercent: 100 },
  { tenantId: T, name: "Acacia Health", code: "ACA", coveragePercent: 80 },
]).returning();

const people: [string, string, "female" | "male", string, string][] = [
  ["Kwame", "Asante", "male", "1985-03-14", "+233241110001"], ["Ama", "Owusu", "female", "1992-07-02", "+233241110002"],
  ["Yaa", "Boakye", "female", "2021-11-20", "+233241110003"], ["Kojo", "Mensah", "male", "1958-01-30", "+233241110004"],
  ["Esi", "Appiah", "female", "1999-05-17", "+233241110005"], ["Kwabena", "Darko", "male", "1974-09-09", "+233241110006"],
  ["Akua", "Frimpong", "female", "1988-12-25", "+233241110007"], ["Fiifi", "Quaye", "male", "2010-04-04", "+233241110008"],
];
const patients = await db.insert(s.patients).values(people.map(([firstName, lastName, sex, dob, phone], i) => ({
  tenantId: T, patientNo: `P-${String(i + 1).padStart(6, "0")}`, firstName, lastName, sex, dob, phone,
  insurerId: i % 3 === 0 ? nhis.id : null, memberNo: i % 3 === 0 ? `NHIS-${10000 + i}` : null, referralSource: ["Referral", "Google", "Walk-in", "Church"][i % 4],
}))).returning();
await db.insert(s.counters).values({ tenantId: T, key: "patient", value: patients.length });
await db.insert(s.consents).values(patients.flatMap((p) => [
  { tenantId: T, patientId: p.id, type: "messaging", granted: true, method: "verbal", recordedBy: owner.id },
  { tenantId: T, patientId: p.id, type: "data_processing", granted: true, method: "verbal", recordedBy: owner.id },
]));
await db.insert(s.allergies).values({ tenantId: T, patientId: patients[3].id, substance: "Penicillin", reaction: "Rash", severity: "severe" });

const today = localDay(tz);
const svc = await db.select().from(s.services).where(eq(s.services.tenantId, T));
const consult = svc.find((x) => x.name === "General consultation")!;
const times = ["09:00", "09:30", "10:00", "11:00", "14:00", "15:30"];
await db.insert(s.appointments).values(times.map((t, i) => ({
  tenantId: T, branchId: branch.id, patientId: patients[i].id, practitionerId: i % 2 ? owner.id : doctor.id, serviceId: consult.id,
  startsAt: zonedToUtc(today, t, tz), endsAt: new Date(zonedToUtc(today, t, tz).getTime() + 15 * 60_000),
  status: i < 2 ? "arrived" as const : "scheduled" as const, reason: ["Fever", "Follow-up BP", "Cough", "Diabetes review", "Antenatal", "Back pain"][i],
})));
await db.insert(s.queueTickets).values([
  { tenantId: T, branchId: branch.id, patientId: patients[0].id, day: today, ticketNo: 1, status: "with_doctor", practitionerId: doctor.id },
  { tenantId: T, branchId: branch.id, patientId: patients[1].id, day: today, ticketNo: 2, status: "waiting" },
  { tenantId: T, branchId: branch.id, patientId: patients[6].id, day: today, ticketNo: 3, status: "waiting", priority: 1, note: "Walk-in, high fever" },
]);

// A signed visit from last week with diagnosis, prescription and a paid invoice.
const lastWeek = zonedToUtc(addDays(today, -7), "10:00", tz);
const [visit] = await db.insert(s.visits).values({
  tenantId: T, branchId: branch.id, patientId: patients[3].id, practitionerId: doctor.id, startedAt: lastWeek, status: "signed", signedAt: lastWeek, signedBy: doctor.id,
  complaint: "Headaches and dizziness for 2 weeks", subjective: "Known hypertensive, ran out of medication 3 weeks ago.", objective: "BP 168/102, pulse 88. No focal deficits.",
  assessment: "Uncontrolled essential hypertension", plan: "Restart amlodipine 10mg daily. Low-salt diet. Review in 2 weeks.", followUpDate: addDays(today, 7),
}).returning();
await db.insert(s.vitals).values({ tenantId: T, patientId: patients[3].id, visitId: visit.id, bpSys: 168, bpDia: 102, pulse: 88, tempC: 36.8, weightKg: 82, heightCm: 172, recordedAt: lastWeek });
await db.insert(s.diagnoses).values({ tenantId: T, visitId: visit.id, patientId: patients[3].id, icd10Code: "I10", description: "Essential (primary) hypertension", isPrimary: true });
const items = await db.insert(s.items).values([
  { tenantId: T, name: "Amlodipine", strength: "10mg", form: "tablet", unit: "tablet", reorderLevel: 100, sellPriceMinor: 100, favorite: true },
  { tenantId: T, name: "Paracetamol", strength: "500mg", form: "tablet", unit: "tablet", reorderLevel: 200, sellPriceMinor: 50, favorite: true },
  { tenantId: T, name: "Artemether-Lumefantrine", strength: "20/120mg", form: "tablet", unit: "pack", reorderLevel: 20, sellPriceMinor: 3500, favorite: true },
  { tenantId: T, name: "Amoxicillin", strength: "500mg", form: "capsule", unit: "capsule", reorderLevel: 100, sellPriceMinor: 80 },
  { tenantId: T, name: "Metformin", strength: "500mg", form: "tablet", unit: "tablet", reorderLevel: 100, sellPriceMinor: 60 },
]).returning();
await db.insert(s.stockBatches).values(items.map((it, i) => ({ tenantId: T, itemId: it.id, branchId: branch.id, batchNo: `B${2026}${i}`, expiry: addDays(today, 90 + i * 120), qtyOnHand: i === 2 ? 12 : 500, costMinor: Math.round(it.sellPriceMinor * 0.6) })));
const [rx] = await db.insert(s.prescriptions).values({ tenantId: T, visitId: visit.id, patientId: patients[3].id, prescriberId: doctor.id, status: "dispensed" }).returning();
await db.insert(s.prescriptionItems).values({ tenantId: T, prescriptionId: rx.id, itemId: items[0].id, drugName: "Amlodipine 10mg", dose: "10mg", route: "oral", frequency: "once daily", duration: "30 days", quantity: 30, dispensedQty: 30 });
const [inv] = await db.insert(s.invoices).values({
  tenantId: T, branchId: branch.id, patientId: patients[3].id, visitId: visit.id, invoiceNo: "INV-000001", status: "paid", issuedAt: lastWeek,
  subtotalMinor: 18000, totalMinor: 18000, patientPortionMinor: 18000, paidMinor: 18000, createdBy: owner.id, createdAt: lastWeek,
}).returning();
await db.insert(s.invoiceLines).values([
  { tenantId: T, invoiceId: inv.id, serviceId: consult.id, description: consult.name, unitPriceMinor: 15000, totalMinor: 15000 },
  { tenantId: T, invoiceId: inv.id, itemId: items[0].id, description: "Amlodipine 10mg", quantity: 30, unitPriceMinor: 100, totalMinor: 3000 },
]);
await db.insert(s.payments).values({ tenantId: T, branchId: branch.id, patientId: patients[3].id, invoiceId: inv.id, amountMinor: 18000, method: "mobile_money", reference: "MOMO-88231", receiptNo: "RCT-000001", receivedBy: staff[3].id, receivedAt: lastWeek });
await db.insert(s.counters).values([{ tenantId: T, key: "invoice", value: 1 }, { tenantId: T, key: "receipt", value: 1 }]);
await db.insert(s.carePlans).values({ tenantId: T, patientId: patients[3].id, condition: "hypertension", intervalDays: 30, nextDueAt: addDays(today, 7), targets: { bpSys: 140, bpDia: 90 }, createdBy: doctor.id });

console.log(`Seeded "${tenant.name}" (${tenant.id}). Sign in at /login with owner@demo.test / ${PASSWORD}`);
process.exit(0);
