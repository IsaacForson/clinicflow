/**
 * Demo rows for the existing Sample Clinic owner (owner@clinicflow.test).
 * Idempotent: exits if that clinic already has patients. Run: pnpm tsx scripts/seed-owner.mts
 */
import "dotenv/config";
if (process.env.DATABASE_URL?.includes(":5432/")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(":5432/", ":6543/");
}
import { and, eq, isNull } from "drizzle-orm";
import { adminDb } from "../src/db/index";
import * as s from "../src/db/schema";
import { hashPassword } from "../src/lib/crypto";
import { addDays, localDay, zonedToUtc } from "../src/lib/format";

const EMAIL = "owner@clinicflow.test";
const db = adminDb();

const owner = (await db.select().from(s.users).where(eq(s.users.email, EMAIL)))[0];
if (!owner) throw new Error(`no user ${EMAIL}`);
const tenant = (await db.select().from(s.tenants).where(eq(s.tenants.id, owner.tenantId)))[0];
if (!tenant) throw new Error("tenant missing");
const existing = (await db.select({ id: s.patients.id }).from(s.patients).where(eq(s.patients.tenantId, tenant.id)))[0];
if (existing) {
  console.log(`skip: ${tenant.name} already has patients`);
  process.exit(0);
}

const branch = (await db.select().from(s.branches).where(eq(s.branches.tenantId, tenant.id)))[0];
if (!branch) throw new Error("branch missing");
const tz = tenant.timezone;
const day = localDay(tz);
const at = (hhmm: string) => zonedToUtc(day, hhmm, tz);
const tid = tenant.id;
const bid = branch.id;

const staffHash = await hashPassword("demo-password-123");
const roles = [
  { role: "doctor", name: "Dr. Kojo Mensah", email: "doctor.sample@clinicflow.test", phone: "+233200000111", isPractitioner: true, scribeEnabled: true },
  { role: "nurse", name: "Nurse Akua", email: "nurse.sample@clinicflow.test", phone: "+233200000112" },
  { role: "front_desk", name: "Front Desk", email: "desk.sample@clinicflow.test", phone: "+233200000113" },
  { role: "cashier", name: "Cashier", email: "cashier.sample@clinicflow.test", phone: "+233200000114" },
  { role: "pharmacist", name: "Pharmacist", email: "pharmacy.sample@clinicflow.test", phone: "+233200000115" },
  { role: "lab", name: "Lab Tech", email: "lab.sample@clinicflow.test", phone: "+233200000116" },
] as const;
const staff: Record<string, string> = {};
for (const r of roles) {
  const [u] = await db.insert(s.users).values({ tenantId: tid, ...r, passwordHash: staffHash, active: true }).returning();
  staff[r.role] = u!.id;
}
const [nhis] = await db.insert(s.insurers).values({ tenantId: tid, name: "NHIS", coveragePercent: 100, active: true }).returning();
await db.insert(s.insurers).values({ tenantId: tid, name: "Acacia Health", coveragePercent: 80, active: true });

const people: { first: string; last: string; sex: "female" | "male"; dob: string; phone: string }[] = [
  { first: "Ama", last: "Mensah", sex: "female", dob: "1992-04-12", phone: "+233244100001" },
  { first: "Kwame", last: "Boateng", sex: "male", dob: "1985-11-03", phone: "+233244100002" },
  { first: "Abena", last: "Owusu", sex: "female", dob: "1978-01-22", phone: "+233244100003" },
  { first: "Kofi", last: "Asante", sex: "male", dob: "2019-07-19", phone: "+233244100004" },
  { first: "Efua", last: "Darko", sex: "female", dob: "2001-09-30", phone: "+233244100005" },
  { first: "Yaw", last: "Mensah", sex: "male", dob: "1964-02-14", phone: "+233244100006" },
];
const ids: string[] = [];
for (const [i, p] of people.entries()) {
  const [row] = await db.insert(s.patients).values({
    tenantId: tid, patientNo: `PT-${String(i + 1).padStart(4, "0")}`,
    firstName: p.first, lastName: p.last, sex: p.sex, dob: p.dob, phone: p.phone,
    address: "Accra", insurerId: i % 2 === 0 ? nhis!.id : null,
    memberNo: i % 2 === 0 ? `NHIS-${1000 + i}` : null,
    preferredChannel: "whatsapp", createdBy: owner.id,
  }).returning();
  ids.push(row!.id);
  await db.insert(s.consents).values({ tenantId: tid, patientId: row!.id, type: "messaging", granted: true, method: "verbal", recordedBy: owner.id });
}
await db.insert(s.allergies).values({ tenantId: tid, patientId: ids[0]!, substance: "Penicillin", reaction: "Rash", severity: "severe" });
await db.insert(s.guardians).values({ tenantId: tid, patientId: ids[3]!, name: "Akosua Asante", relationship: "mother", phone: "+233244100004", isPrimary: true });

const svc = (await db.select().from(s.services).where(and(eq(s.services.tenantId, tid), eq(s.services.name, "General consultation"))))[0];
const follow = (await db.select().from(s.services).where(and(eq(s.services.tenantId, tid), eq(s.services.name, "Follow-up consultation"))))[0];
const malaria = (await db.select().from(s.labTests).where(and(eq(s.labTests.tenantId, tid), eq(s.labTests.name, "Malaria RDT"))))[0];

const slots = ["08:30", "09:00", "09:30", "10:00", "11:00", "14:00"];
const apptIds: string[] = [];
for (const [i, hhmm] of slots.entries()) {
  const start = at(hhmm);
  const [a] = await db.insert(s.appointments).values({
    tenantId: tid, branchId: bid, patientId: ids[i]!, practitionerId: owner.id, serviceId: svc?.id,
    startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000),
    status: i < 2 ? "arrived" : "scheduled", reason: i === 0 ? "Fever and headache" : "Review", createdBy: owner.id,
  }).returning();
  apptIds.push(a!.id);
}
for (const [i, n] of [1, 2].entries()) {
  await db.insert(s.queueTickets).values({
    tenantId: tid, branchId: bid, patientId: ids[i]!, appointmentId: apptIds[i], practitionerId: owner.id,
    day, ticketNo: n, status: i === 0 ? "with_doctor" : "waiting",
  });
}

const [visit] = await db.insert(s.visits).values({
  tenantId: tid, branchId: bid, patientId: ids[0]!, practitionerId: owner.id, appointmentId: apptIds[0],
  status: "signed", complaint: "Fever and headache for 2 days",
  assessment: "Uncomplicated malaria", plan: "ACT for 3 days, review if worse",
  signedAt: new Date(), signedBy: owner.id, startedAt: at("08:40"),
}).returning();
await db.insert(s.vitals).values({ tenantId: tid, patientId: ids[0]!, visitId: visit!.id, tempC: 38.2, pulse: 96, bpSys: 118, bpDia: 76, weightKg: 64, spo2: 98, recordedBy: staff.nurse });
await db.insert(s.diagnoses).values({ tenantId: tid, visitId: visit!.id, patientId: ids[0]!, icd10Code: "B50.9", description: "Plasmodium falciparum malaria, unspecified", isPrimary: true });
await db.insert(s.referrals).values({
  tenantId: tid, visitId: visit!.id, patientId: ids[5]!, toFacility: "Korle Bu Teaching Hospital", specialty: "Cardiology",
  reason: "Uncontrolled hypertension", urgency: "soon", createdBy: owner.id,
});
const [openVisit] = await db.insert(s.visits).values({
  tenantId: tid, branchId: bid, patientId: ids[1]!, practitionerId: owner.id, appointmentId: apptIds[1],
  status: "open", complaint: "Cough for a week", startedAt: at("09:05"),
}).returning();
await db.insert(s.scribeSessions).values({
  tenantId: tid, visitId: visit!.id, practitionerId: owner.id, status: "accepted",
  transcript: "Patient reports fever and headache for two days. No vomiting.",
  draft: JSON.stringify({ assessment: "Uncomplicated malaria", plan: "ACT for 3 days" }),
  model: "demo", acceptedAt: new Date(),
});

const [item] = await db.insert(s.items).values({
  tenantId: tid, name: "Artemether/Lumefantrine", genericName: "Artemether/Lumefantrine", form: "tablet", strength: "20/120mg",
  sku: "ALU-20", reorderLevel: 20, sellPriceMinor: 7000, favorite: true,
}).returning();
const [batch] = await db.insert(s.stockBatches).values({
  tenantId: tid, itemId: item!.id, branchId: bid, batchNo: "B-2401", expiry: addDays(day, 400), qtyOnHand: 116, costMinor: 800, supplier: "Kinapharma",
}).returning();
await db.insert(s.stockMovements).values({ tenantId: tid, itemId: item!.id, batchId: batch!.id, branchId: bid, qty: 140, type: "receive", ref: "GRN-001", userId: staff.pharmacist });
const [rx] = await db.insert(s.prescriptions).values({ tenantId: tid, visitId: visit!.id, patientId: ids[0]!, prescriberId: owner.id, status: "dispensed" }).returning();
await db.insert(s.prescriptionItems).values({ tenantId: tid, prescriptionId: rx!.id, itemId: item!.id, drugName: "Artemether/Lumefantrine 20/120mg", dose: "4 tablets", frequency: "twice daily", duration: "3 days", quantity: 24, dispensedQty: 24 });
const [openRx] = await db.insert(s.prescriptions).values({ tenantId: tid, visitId: openVisit!.id, patientId: ids[1]!, prescriberId: owner.id, status: "issued" }).returning();
await db.insert(s.prescriptionItems).values({ tenantId: tid, prescriptionId: openRx!.id, drugName: "Amoxicillin 500mg", dose: "1 capsule", frequency: "three times daily", duration: "5 days", quantity: 15 });
await db.insert(s.stockMovements).values({ tenantId: tid, itemId: item!.id, batchId: batch!.id, branchId: bid, qty: -24, type: "dispense", ref: rx!.id, userId: staff.pharmacist });

const [order] = await db.insert(s.labOrders).values({
  tenantId: tid, branchId: bid, visitId: visit!.id, patientId: ids[0]!, orderedBy: owner.id, status: "resulted",
}).returning();
await db.insert(s.labOrderItems).values({
  tenantId: tid, orderId: order!.id, testId: malaria?.id, name: "Malaria RDT", resultValue: "Positive", refRange: "Negative", flag: "high", resultedBy: staff.lab, resultedAt: new Date(),
});
const [pendingLab] = await db.insert(s.labOrders).values({
  tenantId: tid, branchId: bid, patientId: ids[2]!, orderedBy: owner.id, status: "ordered",
}).returning();
await db.insert(s.labOrderItems).values({ tenantId: tid, orderId: pendingLab!.id, name: "Full blood count" });

const [inv] = await db.insert(s.invoices).values({
  tenantId: tid, branchId: bid, patientId: ids[0]!, visitId: visit!.id, invoiceNo: "INV-0001", status: "paid",
  insurerId: nhis!.id, subtotalMinor: 22000, totalMinor: 22000, insurerPortionMinor: 15000, patientPortionMinor: 7000,
  paidMinor: 7000, issuedAt: new Date(), createdBy: owner.id,
}).returning();
await db.insert(s.invoiceLines).values([
  { tenantId: tid, invoiceId: inv!.id, serviceId: svc?.id, description: "General consultation", quantity: 1, unitPriceMinor: 15000, totalMinor: 15000, insurerCovered: true },
  { tenantId: tid, invoiceId: inv!.id, itemId: item!.id, description: "Artemether/Lumefantrine", quantity: 1, unitPriceMinor: 7000, totalMinor: 7000 },
]);
await db.insert(s.payments).values({
  tenantId: tid, branchId: bid, patientId: ids[0]!, invoiceId: inv!.id, amountMinor: 7000, method: "mobile_money",
  reference: "MTN-DEMO-1", receiptNo: "RCT-0001", receivedBy: staff.cashier,
});
const [openInv] = await db.insert(s.invoices).values({
  tenantId: tid, branchId: bid, patientId: ids[1]!, invoiceNo: "INV-0002", status: "issued",
  subtotalMinor: 8000, totalMinor: 8000, patientPortionMinor: 8000, issuedAt: new Date(), createdBy: owner.id,
}).returning();
await db.insert(s.invoiceLines).values({ tenantId: tid, invoiceId: openInv!.id, serviceId: follow?.id, description: "Follow-up consultation", quantity: 1, unitPriceMinor: 8000, totalMinor: 8000 });

const [claim] = await db.insert(s.claims).values({
  tenantId: tid, insurerId: nhis!.id, batchNo: "CLM-0001", periodStart: addDays(day, -7), periodEnd: day,
  status: "submitted", totalClaimedMinor: 15000, submittedAt: new Date(), createdBy: owner.id,
}).returning();
await db.insert(s.claimItems).values({ tenantId: tid, claimId: claim!.id, invoiceId: inv!.id, amountClaimedMinor: 15000 });
await db.insert(s.expenses).values({ tenantId: tid, branchId: bid, category: "supplies", description: "Gloves and syringes", paidTo: "Ernest Chemist", amountMinor: 4500, method: "cash", day, createdBy: staff.cashier });
await db.insert(s.cashUps).values({
  tenantId: tid, branchId: bid, day, userId: staff.cashier!,
  expected: { cash: 12000, mobile_money: 7000 }, countedCashMinor: 12000,
});

await db.insert(s.messageLog).values({
  tenantId: tid, patientId: ids[0]!, channel: "whatsapp", to: "+233244100001", templateKey: "appointment_reminder",
  purpose: "reminder", body: "Ama, your visit at Sample Clinic is today at 08:30.", status: "sent", sentAt: new Date(),
});
await db.insert(s.carePlans).values({
  tenantId: tid, patientId: ids[5]!, condition: "hypertension", intervalDays: 30, nextDueAt: addDays(day, 14),
  targets: { bpSys: 130, bpDia: 80 }, createdBy: owner.id,
});
const tpl = (await db.select().from(s.scheduleTemplates).where(and(isNull(s.scheduleTemplates.tenantId), eq(s.scheduleTemplates.kind, "immunization"))))[0];
await db.insert(s.patientScheduleItems).values({
  tenantId: tid, patientId: ids[3]!, templateId: tpl?.id, kind: "immunization", name: "Measles-Rubella 1", dueDate: addDays(day, 10), status: "due",
});
await db.insert(s.counters).values([
  { tenantId: tid, key: "patient", value: people.length },
  { tenantId: tid, key: "invoice", value: 2 },
  { tenantId: tid, key: "receipt", value: 1 },
  { tenantId: tid, key: "claim", value: 1 },
]);

console.log(`seeded ${tenant.name}: ${people.length} patients`);
process.exit(0);
