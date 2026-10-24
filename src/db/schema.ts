import { sql } from "drizzle-orm";
import {
  boolean, check, customType, date, index, integer, jsonb, pgEnum, pgSchema, pgTable, primaryKey,
  real, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { decrypt, encrypt } from "@/lib/crypto";

/** Free text encrypted at the application layer (AES-256-GCM). Not searchable in SQL. */
const encrypted = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
  toDriver: (v) => encrypt(v),
  fromDriver: (v) => decrypt(v),
});

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => integer(name).notNull().default(0); // minor units (pesewas, kobo, cents)

export type OpeningHours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", [string, string] | null>;
export const DEFAULT_OPENING_HOURS: OpeningHours = {
  "0": null, "1": ["08:00", "17:00"], "2": ["08:00", "17:00"], "3": ["08:00", "17:00"], "4": ["08:00", "17:00"], "5": ["08:00", "17:00"], "6": ["08:00", "13:00"],
};

// ---------- Enums ----------
export const roleEnum = pgEnum("role", ["owner", "admin", "doctor", "nurse", "front_desk", "cashier", "pharmacist", "lab"]);
export const platformRoleEnum = pgEnum("platform_role", ["super_admin", "support", "finance"]);
export const planEnum = pgEnum("plan", ["solo", "clinic", "group"]);
export const planStatusEnum = pgEnum("plan_status", ["trialing", "active", "past_due", "read_only", "cancelled"]);
export const sexEnum = pgEnum("sex", ["female", "male", "other", "unknown"]);
export const apptStatusEnum = pgEnum("appointment_status", ["scheduled", "confirmed", "arrived", "completed", "cancelled", "no_show"]);
export const queueStatusEnum = pgEnum("queue_status", ["waiting", "with_doctor", "lab", "billing", "pharmacy", "done", "left"]);
export const visitStatusEnum = pgEnum("visit_status", ["open", "signed"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "issued", "partially_paid", "paid", "void"]);
export const payMethodEnum = pgEnum("payment_method", ["cash", "mobile_money", "card", "insurance", "bank", "deposit"]);
export const payStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded"]);
export const serviceCategoryEnum = pgEnum("service_category", ["consultation", "lab", "imaging", "procedure", "drug", "other"]);
export const channelEnum = pgEnum("channel", ["whatsapp", "sms", "email"]);
export const msgStatusEnum = pgEnum("message_status", ["queued", "sent", "delivered", "read", "failed", "skipped"]);
export const labStatusEnum = pgEnum("lab_status", ["ordered", "collected", "resulted", "notified", "cancelled"]);
export const claimStatusEnum = pgEnum("claim_status", ["draft", "submitted", "partially_paid", "paid", "rejected"]);
export const stockMoveEnum = pgEnum("stock_movement_type", ["receive", "dispense", "adjust", "transfer_in", "transfer_out", "expire", "return"]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed", "cancelled"]);

// ---------- Tenancy ----------
export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country").notNull().default("GH"),
  currency: text("currency").notNull().default("GHS"),
  timezone: text("timezone").notNull().default("Africa/Accra"),
  locale: text("locale").notNull().default("en"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  logoUrl: text("logo_url"),
  letterhead: text("letterhead"), // extra lines printed under the clinic name
  registrationNo: text("registration_no"),
  taxId: text("tax_id"),
  plan: planEnum("plan").notNull().default("clinic"),
  planStatus: planStatusEnum("plan_status").notNull().default("trialing"),
  trialEndsAt: ts("trial_ends_at"),
  currentPeriodEnd: ts("current_period_end"),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly | annual
  scribeSeats: integer("scribe_seats").notNull().default(0),
  paystackCustomerCode: text("paystack_customer_code"),
  paystackSubscriptionCode: text("paystack_subscription_code"),
  suspendedAt: ts("suspended_at"), // platform suspension (abuse/fraud only): staff can't sign in; data kept
  suspendReason: text("suspend_reason"),
  adminNotes: text("admin_notes"), // internal notes by the ClinicFlow team
  reminderHours: integer("reminder_hours").array().notNull().default(sql`'{24,2}'::int[]`),
  notifiableIcd: text("notifiable_icd").array().notNull().default(sql`'{}'::text[]`),
  createdAt: createdAt(),
});

export const branches = pgTable("branches", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  isMain: boolean("is_main").notNull().default(false),
  active: boolean("active").notNull().default(true),
  /** Weekly opening hours keyed by weekday 0 (Sun)–6 (Sat): ["08:00","17:00"], or null when closed. */
  openingHours: jsonb("opening_hours").$type<OpeningHours>().notNull().default(DEFAULT_OPENING_HOURS),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull(),
  isPractitioner: boolean("is_practitioner").notNull().default(false),
  title: text("title"), // e.g. "Dr.", "Physio"
  licenseNo: text("license_no"),
  branchIds: uuid("branch_ids").array(), // null = all branches
  totpSecret: encrypted("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  scribeEnabled: boolean("scribe_enabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
}, (t) => [index("users_tenant_idx").on(t.tenantId)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: tenantId(),
  mfaPending: boolean("mfa_pending").notNull().default(false),
  impersonatedBy: uuid("impersonated_by"), // platform admin viewing this clinic (read-only support session)
  expiresAt: ts("expires_at").notNull(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});

export const otpCodes = pgTable("otp_codes", {
  id: id(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("otp_phone_idx").on(t.phone)]);

// ---------- Patients ----------
export const insurers = pgTable("insurers", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  code: text("code"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  claimEmail: text("claim_email"),
  coveragePercent: integer("coverage_percent").notNull().default(100), // default share insurer pays
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const patients = pgTable("patients", {
  id: id(),
  tenantId: tenantId(),
  patientNo: text("patient_no").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  otherNames: text("other_names"),
  sex: sexEnum("sex").notNull().default("unknown"),
  dob: date("dob"),
  phone: text("phone"),
  altPhone: text("alt_phone"),
  email: text("email"),
  nationalId: encrypted("national_id"),
  nationalIdIndex: text("national_id_index"), // blind index for exact search
  address: text("address"),
  occupation: text("occupation"),
  bloodGroup: text("blood_group"),
  photoKey: text("photo_key"),
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  insurerId: uuid("insurer_id").references(() => insurers.id),
  memberNo: text("member_no"),
  insuranceExpiry: date("insurance_expiry"),
  referralSource: text("referral_source"),
  preferredChannel: channelEnum("preferred_channel").notNull().default("whatsapp"),
  language: text("language").notNull().default("en"),
  notes: encrypted("notes"),
  mergedIntoId: uuid("merged_into_id"),
  deletedAt: ts("deleted_at"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("patients_no_uq").on(t.tenantId, t.patientNo),
  index("patients_phone_idx").on(t.tenantId, t.phone),
  index("patients_name_idx").on(t.tenantId, t.lastName, t.firstName),
  index("patients_nid_idx").on(t.tenantId, t.nationalIdIndex),
]);

export const guardians = pgTable("guardians", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  guardianPatientId: uuid("guardian_patient_id").references(() => patients.id),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  phone: text("phone"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: createdAt(),
});

export const allergies = pgTable("allergies", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  substance: text("substance").notNull(),
  reaction: text("reaction"),
  severity: text("severity").notNull().default("moderate"), // mild | moderate | severe
  createdAt: createdAt(),
});

export const consents = pgTable("consents", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // messaging | data_processing | portal | ai_scribe | telehealth | treatment
  granted: boolean("granted").notNull(),
  method: text("method").notNull(), // verbal | signature | whatsapp | form
  signature: text("signature"), // data URL from tablet signature pad
  recordedBy: uuid("recorded_by"),
  createdAt: createdAt(),
  revokedAt: ts("revoked_at"),
}, (t) => [index("consents_patient_idx").on(t.patientId, t.type)]);

export const documents = pgTable("documents", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "cascade" }),
  visitId: uuid("visit_id"),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  category: text("category").notNull().default("other"), // lab_result | imaging | referral | id | other
  uploadedBy: uuid("uploaded_by"),
  createdAt: createdAt(),
});

// ---------- Catalogue ----------
export const services = pgTable("services", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  code: text("code"),
  category: serviceCategoryEnum("category").notNull().default("consultation"),
  priceMinor: money("price_minor"),
  durationMin: integer("duration_min").notNull().default(15),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const insurerTariffs = pgTable("insurer_tariffs", {
  tenantId: tenantId(),
  insurerId: uuid("insurer_id").notNull().references(() => insurers.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  priceMinor: money("price_minor"),
  covered: boolean("covered").notNull().default(true),
}, (t) => [primaryKey({ columns: [t.insurerId, t.serviceId] })]);

export const labTests = pgTable("lab_tests", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  code: text("code"),
  kind: text("kind").notNull().default("lab"), // lab | imaging
  unit: text("unit"),
  refRange: text("ref_range"),
  serviceId: uuid("service_id").references(() => services.id),
  active: boolean("active").notNull().default(true),
});

export const icd10Codes = pgTable("icd10_codes", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
}, (t) => [index("icd10_desc_idx").on(t.description)]);

// ---------- Scheduling ----------
export const appointments = pgTable("appointments", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  practitionerId: uuid("practitioner_id").references(() => users.id),
  serviceId: uuid("service_id").references(() => services.id),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  status: apptStatusEnum("status").notNull().default("scheduled"),
  source: text("source").notNull().default("front_desk"), // front_desk | portal | whatsapp | api
  reason: text("reason"),
  telehealth: boolean("telehealth").notNull().default(false),
  telehealthUrl: text("telehealth_url"),
  prepaidInvoiceId: uuid("prepaid_invoice_id"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [index("appt_day_idx").on(t.tenantId, t.branchId, t.startsAt), index("appt_patient_idx").on(t.patientId)]);

export const queueTickets = pgTable("queue_tickets", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  visitId: uuid("visit_id"),
  practitionerId: uuid("practitioner_id").references(() => users.id),
  day: date("day").notNull(),
  ticketNo: integer("ticket_no").notNull(),
  status: queueStatusEnum("status").notNull().default("waiting"),
  priority: integer("priority").notNull().default(0), // 1 = urgent
  note: text("note"),
  calledAt: ts("called_at"),
  doneAt: ts("done_at"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("queue_ticket_uq").on(t.branchId, t.day, t.ticketNo)]);

// ---------- Clinical ----------
export const visits = pgTable("visits", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  practitionerId: uuid("practitioner_id").references(() => users.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  template: text("template").notNull().default("general"),
  status: visitStatusEnum("status").notNull().default("open"),
  complaint: encrypted("complaint"),
  subjective: encrypted("subjective"),
  objective: encrypted("objective"),
  assessment: encrypted("assessment"),
  plan: encrypted("plan"),
  extra: jsonb("extra").$type<Record<string, string>>().notNull().default({}), // specialty template fields
  followUpDate: date("follow_up_date"),
  version: integer("version").notNull().default(1),
  startedAt: ts("started_at").notNull().defaultNow(),
  signedAt: ts("signed_at"),
  signedBy: uuid("signed_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("visits_patient_idx").on(t.patientId, t.startedAt)]);

export const visitRevisions = pgTable("visit_revisions", {
  id: id(),
  tenantId: tenantId(),
  visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: encrypted("snapshot").notNull(), // JSON of note fields at that version
  editedBy: uuid("edited_by"),
  createdAt: createdAt(),
});

export const vitals = pgTable("vitals", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  visitId: uuid("visit_id").references(() => visits.id, { onDelete: "cascade" }),
  tempC: real("temp_c"),
  pulse: integer("pulse"),
  respRate: integer("resp_rate"),
  bpSys: integer("bp_sys"),
  bpDia: integer("bp_dia"),
  spo2: integer("spo2"),
  weightKg: real("weight_kg"),
  heightCm: real("height_cm"),
  glucose: real("glucose"), // mmol/L
  source: text("source").notNull().default("clinic"), // clinic | patient
  recordedBy: uuid("recorded_by"),
  recordedAt: ts("recorded_at").notNull().defaultNow(),
}, (t) => [index("vitals_patient_idx").on(t.patientId, t.recordedAt)]);

export const diagnoses = pgTable("diagnoses", {
  id: id(),
  tenantId: tenantId(),
  visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  icd10Code: text("icd10_code"),
  description: text("description").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("diag_code_idx").on(t.tenantId, t.icd10Code, t.createdAt)]);

export const prescriptions = pgTable("prescriptions", {
  id: id(),
  tenantId: tenantId(),
  visitId: uuid("visit_id").references(() => visits.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  prescriberId: uuid("prescriber_id").references(() => users.id),
  notes: text("notes"),
  status: text("status").notNull().default("issued"), // issued | partially_dispensed | dispensed | cancelled
  createdAt: createdAt(),
});

export const prescriptionItems = pgTable("prescription_items", {
  id: id(),
  tenantId: tenantId(),
  prescriptionId: uuid("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
  itemId: uuid("item_id"),
  drugName: text("drug_name").notNull(),
  dose: text("dose"),
  route: text("route"),
  frequency: text("frequency"),
  duration: text("duration"),
  quantity: integer("quantity").notNull().default(1),
  instructions: text("instructions"),
  dispensedQty: integer("dispensed_qty").notNull().default(0),
});

export const referrals = pgTable("referrals", {
  id: id(),
  tenantId: tenantId(),
  visitId: uuid("visit_id").references(() => visits.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  toName: text("to_name"),
  toFacility: text("to_facility").notNull(),
  specialty: text("specialty"),
  reason: text("reason").notNull(),
  letter: encrypted("letter"),
  urgency: text("urgency").notNull().default("routine"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const labOrders = pgTable("lab_orders", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  visitId: uuid("visit_id").references(() => visits.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  orderedBy: uuid("ordered_by"),
  status: labStatusEnum("status").notNull().default("ordered"),
  externalLab: text("external_lab"),
  notes: text("notes"),
  notifiedAt: ts("notified_at"),
  createdAt: createdAt(),
}, (t) => [index("lab_orders_status_idx").on(t.tenantId, t.status)]);

export const labOrderItems = pgTable("lab_order_items", {
  id: id(),
  tenantId: tenantId(),
  orderId: uuid("order_id").notNull().references(() => labOrders.id, { onDelete: "cascade" }),
  testId: uuid("test_id").references(() => labTests.id),
  name: text("name").notNull(),
  resultValue: text("result_value"),
  resultText: encrypted("result_text"),
  unit: text("unit"),
  refRange: text("ref_range"),
  flag: text("flag"), // low | high | critical | normal
  documentId: uuid("document_id"),
  resultedBy: uuid("resulted_by"),
  resultedAt: ts("resulted_at"),
});

// ---------- Billing ----------
export const invoices = pgTable("invoices", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  patientId: uuid("patient_id").notNull().references(() => patients.id),
  visitId: uuid("visit_id").references(() => visits.id),
  invoiceNo: text("invoice_no").notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  insurerId: uuid("insurer_id").references(() => insurers.id),
  subtotalMinor: money("subtotal_minor"),
  discountMinor: money("discount_minor"),
  totalMinor: money("total_minor"),
  insurerPortionMinor: money("insurer_portion_minor"),
  patientPortionMinor: money("patient_portion_minor"),
  paidMinor: money("paid_minor"), // patient payments only
  insurerPaidMinor: money("insurer_paid_minor"),
  /** Part of the insurer share the insurer rejected/underpaid, moved onto the patient's balance. */
  insurerShortfallMinor: money("insurer_shortfall_minor"),
  /** Part of the insurer share the clinic chose to absorb instead of billing the patient. */
  insurerWriteoffMinor: money("insurer_writeoff_minor"),
  notes: text("notes"),
  voidReason: text("void_reason"),
  issuedAt: ts("issued_at"),
  dueAt: ts("due_at"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("invoice_no_uq").on(t.tenantId, t.invoiceNo), index("invoices_patient_idx").on(t.patientId)]);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  tenantId: tenantId(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").references(() => services.id),
  itemId: uuid("item_id"),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceMinor: money("unit_price_minor"),
  totalMinor: money("total_minor"),
  insurerCovered: boolean("insurer_covered").notNull().default(false),
});

export const payments = pgTable("payments", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  patientId: uuid("patient_id").references(() => patients.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id), // null = deposit / credit on account
  amountMinor: integer("amount_minor").notNull(),
  method: payMethodEnum("method").notNull(),
  status: payStatusEnum("status").notNull().default("succeeded"),
  reference: text("reference"),
  provider: text("provider"), // paystack | flutterwave | manual
  providerRef: text("provider_ref").unique(),
  receiptNo: text("receipt_no"),
  receivedBy: uuid("received_by"),
  receivedAt: ts("received_at").notNull().defaultNow(),
  clientId: text("client_id").unique(), // idempotency key from offline outbox
  refundedAt: ts("refunded_at"),
  refundedBy: uuid("refunded_by"),
  refundReason: text("refund_reason"),
  refundProviderRef: text("refund_provider_ref"),
}, (t) => [index("payments_day_idx").on(t.tenantId, t.branchId, t.receivedAt), index("payments_refund_idx").on(t.tenantId, t.branchId, t.refundedAt)]);

export const cashUps = pgTable("cash_ups", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  day: date("day").notNull(),
  userId: uuid("user_id").notNull(),
  expected: jsonb("expected").$type<Record<string, number>>().notNull(),
  countedCashMinor: money("counted_cash_minor"),
  varianceMinor: integer("variance_minor").notNull().default(0),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const claims = pgTable("claims", {
  id: id(),
  tenantId: tenantId(),
  insurerId: uuid("insurer_id").notNull().references(() => insurers.id),
  batchNo: text("batch_no").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: claimStatusEnum("status").notNull().default("draft"),
  totalClaimedMinor: money("total_claimed_minor"),
  totalPaidMinor: money("total_paid_minor"),
  submittedAt: ts("submitted_at"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const claimItems = pgTable("claim_items", {
  id: id(),
  tenantId: tenantId(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  amountClaimedMinor: money("amount_claimed_minor"),
  amountPaidMinor: money("amount_paid_minor"),
  status: text("status").notNull().default("pending"), // pending | paid | partially_paid | rejected
  rejectionReason: text("rejection_reason"),
}, (t) => [uniqueIndex("claim_invoice_uq").on(t.invoiceId)]);

export const expenses = pgTable("expenses", {
  id: id(),
  tenantId: tenantId(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  category: text("category").notNull(),
  description: text("description"),
  paidTo: text("paid_to"),
  amountMinor: integer("amount_minor").notNull(),
  method: payMethodEnum("method").notNull().default("cash"),
  day: date("day").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

// ---------- Dispensary ----------
export const items = pgTable("items", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  genericName: text("generic_name"),
  form: text("form"), // tablet | syrup | injection ...
  strength: text("strength"),
  unit: text("unit").notNull().default("unit"),
  sku: text("sku"),
  isDrug: boolean("is_drug").notNull().default(true),
  favorite: boolean("favorite").notNull().default(false),
  reorderLevel: integer("reorder_level").notNull().default(0),
  sellPriceMinor: money("sell_price_minor"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const stockBatches = pgTable("stock_batches", {
  id: id(),
  tenantId: tenantId(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  batchNo: text("batch_no"),
  expiry: date("expiry"),
  qtyOnHand: integer("qty_on_hand").notNull().default(0), // CHECK (qty_on_hand >= 0) below
  costMinor: money("cost_minor"),
  supplier: text("supplier"),
  receivedAt: ts("received_at").notNull().defaultNow(),
}, (t) => [index("batches_item_idx").on(t.itemId, t.branchId, t.expiry), check("stock_batches_qty_nonnegative", sql`${t.qtyOnHand} >= 0`)]);

export const stockMovements = pgTable("stock_movements", {
  id: id(),
  tenantId: tenantId(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  batchId: uuid("batch_id").references(() => stockBatches.id),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  qty: integer("qty").notNull(), // + in, - out
  type: stockMoveEnum("type").notNull(),
  ref: text("ref"),
  reason: text("reason"),
  userId: uuid("user_id"),
  createdAt: createdAt(),
});

// ---------- Messaging ----------
export const messageTemplates = pgTable("message_templates", {
  id: id(),
  tenantId: tenantId(),
  key: text("key").notNull(), // appointment_reminder | results_ready | follow_up | invoice | intake | portal_link ...
  language: text("language").notNull().default("en"),
  body: text("body").notNull(),
  waTemplateName: text("wa_template_name"), // approved WhatsApp template name, if any
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("tpl_uq").on(t.tenantId, t.key, t.language)]);

export const messageLog = pgTable("message_log", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  to: text("to").notNull(),
  templateKey: text("template_key"),
  purpose: text("purpose").notNull(), // reminder | results | follow_up | billing | portal | marketing
  body: text("body").notNull(),
  status: msgStatusEnum("status").notNull().default("queued"),
  provider: text("provider"),
  providerId: text("provider_id"),
  error: text("error"),
  consentId: uuid("consent_id"),
  direction: text("direction").notNull().default("out"), // out | in
  createdAt: createdAt(),
  sentAt: ts("sent_at"),
}, (t) => [index("msg_tenant_idx").on(t.tenantId, t.createdAt), index("msg_provider_idx").on(t.providerId)]);

export const jobs = pgTable("jobs", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  runAt: ts("run_at").notNull().defaultNow(),
  status: jobStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  dedupeKey: text("dedupe_key").unique(),
  lockedAt: ts("locked_at"),
  createdAt: createdAt(),
}, (t) => [index("jobs_due_idx").on(t.status, t.runAt)]);

// ---------- Patient-facing ----------
export const intakeForms = pgTable("intake_forms", {
  id: id(),
  tenantId: tenantId(),
  tokenHash: text("token_hash").notNull().unique(),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  data: encrypted("data"), // JSON answers
  signature: text("signature"),
  status: text("status").notNull().default("sent"), // sent | submitted | reviewed
  expiresAt: ts("expires_at").notNull(),
  submittedAt: ts("submitted_at"),
  createdAt: createdAt(),
});

export const portalTokens = pgTable("portal_tokens", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  lastUsedAt: ts("last_used_at"),
  createdAt: createdAt(),
});

// ---------- Chronic care & schedules ----------
export const carePlans = pgTable("care_plans", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  condition: text("condition").notNull(), // hypertension | diabetes | asthma | hiv | other
  intervalDays: integer("interval_days").notNull().default(30),
  nextDueAt: date("next_due_at"),
  targets: jsonb("targets").$type<{ bpSys?: number; bpDia?: number; glucose?: number }>().notNull().default({}),
  adherenceNudges: boolean("adherence_nudges").notNull().default(true),
  nudgeTime: text("nudge_time"), // HH:MM local, daily medication reminder
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const scheduleTemplates = pgTable("schedule_templates", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // null = built-in
  kind: text("kind").notNull(), // immunization | antenatal
  name: text("name").notNull(),
  items: jsonb("items").$type<{ name: string; offsetDays: number }[]>().notNull(),
});

export const patientScheduleItems = pgTable("patient_schedule_items", {
  id: id(),
  tenantId: tenantId(),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => scheduleTemplates.id),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  dueDate: date("due_date").notNull(),
  status: text("status").notNull().default("due"), // due | done | missed | skipped
  doneAt: ts("done_at"),
  visitId: uuid("visit_id"),
  batchNo: text("batch_no"),
  remindedAt: ts("reminded_at"),
}, (t) => [index("psi_due_idx").on(t.tenantId, t.status, t.dueDate)]);

// ---------- AI scribe ----------
export const scribeSessions = pgTable("scribe_sessions", {
  id: id(),
  tenantId: tenantId(),
  visitId: uuid("visit_id").notNull().references(() => visits.id, { onDelete: "cascade" }),
  practitionerId: uuid("practitioner_id").notNull(),
  status: text("status").notNull().default("drafted"), // drafted | accepted | discarded | failed
  transcript: encrypted("transcript"),
  draft: encrypted("draft"), // JSON SOAP draft
  model: text("model"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  audioSeconds: integer("audio_seconds").notNull().default(0),
  createdAt: createdAt(),
  acceptedAt: ts("accepted_at"),
});

// ---------- Platform / API ----------
export const apiKeys = pgTable("api_keys", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const webhooks = pgTable("webhooks", {
  id: id(),
  tenantId: tenantId(),
  url: text("url").notNull(),
  secret: encrypted("secret").notNull(),
  events: text("events").array().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: id(),
  tenantId: tenantId(),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  responseCode: integer("response_code"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: createdAt(),
});

/** Per-tenant provider credentials (marketplace). Secrets are encrypted. Falls back to platform env config. */
export const integrations = pgTable("integrations", {
  id: id(),
  tenantId: tenantId(),
  provider: text("provider").notNull(), // whatsapp | twilio | africastalking | paystack | flutterwave | deepgram | lab:<name> ...
  config: encrypted("config").notNull(), // JSON
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("integration_uq").on(t.tenantId, t.provider)]);

export const exportJobs = pgTable("export_jobs", {
  id: id(),
  tenantId: tenantId(),
  requestedBy: uuid("requested_by").notNull(),
  kind: text("kind").notNull().default("full"), // full | accounting | hmis | claims
  status: text("status").notNull().default("pending"),
  storageKey: text("storage_key"),
  error: text("error"),
  createdAt: createdAt(),
  completedAt: ts("completed_at"),
});

export const billingEvents = pgTable("billing_events", {
  id: id(),
  tenantId: tenantId(),
  type: text("type").notNull(), // charge.success | subscription.disable | plan.change ...
  amountMinor: integer("amount_minor"),
  currency: text("currency"),
  providerRef: text("provider_ref").unique(),
  data: jsonb("data"),
  createdAt: createdAt(),
});

export const counters = pgTable("counters", {
  tenantId: tenantId(),
  key: text("key").notNull(), // patient | invoice | receipt | claim
  value: integer("value").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.tenantId, t.key] })]);

// ---------- Platform (ClinicFlow team) ----------
export const platformAdmins = pgTable("platform_admins", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: platformRoleEnum("role").notNull().default("support"),
  totpSecret: encrypted("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

export const platformSessions = pgTable("platform_sessions", {
  id: text("id").primaryKey(), // sha256 of cookie token
  adminId: uuid("admin_id").notNull().references(() => platformAdmins.id, { onDelete: "cascade" }),
  mfaPending: boolean("mfa_pending").notNull().default(true),
  expiresAt: ts("expires_at").notNull(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});

// ---------- Audit (separate schema, append-only) ----------
export const audit = pgSchema("audit");
export const auditLog = audit.table("log", {
  id: id(),
  tenantId: uuid("tenant_id").notNull(),
  userId: uuid("user_id"),
  action: text("action").notNull(), // view | create | update | delete | sign | export | login | print | send
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  patientId: uuid("patient_id"),
  details: jsonb("details"),
  ip: text("ip"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_tenant_idx").on(t.tenantId, t.at), index("audit_patient_idx").on(t.patientId, t.at)]);

/** Every action taken by the ClinicFlow team (append-only). */
export const platformAudit = audit.table("platform_log", {
  id: id(),
  adminId: uuid("admin_id"),
  action: text("action").notNull(),
  tenantId: uuid("tenant_id"),
  entity: text("entity"),
  entityId: text("entity_id"),
  details: jsonb("details"),
  ip: text("ip"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("platform_audit_at_idx").on(t.at), index("platform_audit_tenant_idx").on(t.tenantId, t.at)]);

export type Role = (typeof roleEnum.enumValues)[number];
export type PlatformRole = (typeof platformRoleEnum.enumValues)[number];
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
