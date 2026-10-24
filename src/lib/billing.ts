import { and, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { insurers, insurerTariffs, invoiceLines, invoices, items, patients, payments, services } from "@/db/schema";
import { UserError } from "./action";
import type { Ctx } from "./auth";
import { audit } from "./auth";
import { emit } from "./events";
import { nextNumber } from "./numbers";

type Invoice = typeof invoices.$inferSelect;

/** Insurer applies when the patient has one and the cover hasn't expired. */
async function activeInsurer(t: Tx, patientId: string) {
  const [p] = await t.select({ insurerId: patients.insurerId, expiry: patients.insuranceExpiry }).from(patients).where(eq(patients.id, patientId));
  if (!p?.insurerId) return null;
  if (p.expiry && new Date(p.expiry) < new Date(new Date().toISOString().slice(0, 10))) return null;
  const [ins] = await t.select().from(insurers).where(and(eq(insurers.id, p.insurerId), eq(insurers.active, true)));
  return ins ?? null;
}

export async function createInvoice(t: Tx, ctx: Ctx, o: { patientId: string; visitId?: string | null; branchId?: string; useInsurance?: boolean }): Promise<Invoice> {
  const ins = o.useInsurance === false ? null : await activeInsurer(t, o.patientId);
  const [inv] = await t.insert(invoices).values({
    tenantId: ctx.tenant.id, branchId: o.branchId ?? ctx.branchId, patientId: o.patientId, visitId: o.visitId ?? null,
    invoiceNo: await nextNumber(t, ctx.tenant.id, "invoice"), insurerId: ins?.id ?? null, createdBy: ctx.user.id,
  }).returning();
  await audit(t, ctx, "create", "invoice", inv.id, { patientId: o.patientId });
  return inv;
}

/** The open (draft/issued, unpaid) invoice for a visit, created on first charge. */
export async function ensureVisitInvoice(t: Tx, ctx: Ctx, o: { patientId: string; visitId: string; branchId: string }): Promise<Invoice> {
  const [existing] = await t.select().from(invoices)
    .where(and(eq(invoices.visitId, o.visitId), ne(invoices.status, "void"), ne(invoices.status, "paid"))).limit(1);
  return existing ?? createInvoice(t, ctx, o);
}

export async function addLine(t: Tx, invoiceId: string, o: { serviceId?: string | null; itemId?: string | null; description?: string; quantity?: number; unitPriceMinor?: number }) {
  const [inv] = await t.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw new UserError("Invoice not found");
  if (inv.status === "void" || inv.status === "paid") throw new UserError("This invoice is closed. Start a new invoice.");
  let description = o.description ?? "";
  let price = o.unitPriceMinor;
  let covered = false;
  if (o.serviceId) {
    const [s] = await t.select().from(services).where(eq(services.id, o.serviceId));
    if (!s) throw new UserError("Service not found");
    description ||= s.name;
    price ??= s.priceMinor;
    if (inv.insurerId) {
      const [tariff] = await t.select().from(insurerTariffs).where(and(eq(insurerTariffs.insurerId, inv.insurerId), eq(insurerTariffs.serviceId, s.id)));
      covered = tariff ? tariff.covered : true;
      if (tariff?.covered && o.unitPriceMinor === undefined) price = tariff.priceMinor;
    }
  } else if (o.itemId) {
    const [it] = await t.select().from(items).where(eq(items.id, o.itemId));
    if (!it) throw new UserError("Item not found");
    description ||= [it.name, it.strength].filter(Boolean).join(" ");
    price ??= it.sellPriceMinor;
    covered = !!inv.insurerId;
  }
  if (!description) throw new UserError("Description is required");
  const quantity = Math.max(1, o.quantity ?? 1);
  await t.insert(invoiceLines).values({
    tenantId: inv.tenantId, invoiceId, serviceId: o.serviceId ?? null, itemId: o.itemId ?? null, description,
    quantity, unitPriceMinor: price ?? 0, totalMinor: (price ?? 0) * quantity, insurerCovered: covered,
  });
  return recalcInvoice(t, invoiceId);
}

/** Recomputes totals, insurer/patient split, paid amount and status from lines + payments. */
export async function recalcInvoice(t: Tx, invoiceId: string): Promise<Invoice> {
  const [inv] = await t.select().from(invoices).where(eq(invoices.id, invoiceId));
  const lines = await t.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const subtotal = lines.reduce((s, l) => s + l.totalMinor, 0);
  const coveredSum = lines.filter((l) => l.insurerCovered).reduce((s, l) => s + l.totalMinor, 0);
  let insurerPortion = 0;
  if (inv.insurerId) {
    const [ins] = await t.select({ pct: insurers.coveragePercent }).from(insurers).where(eq(insurers.id, inv.insurerId));
    insurerPortion = Math.round((coveredSum * (ins?.pct ?? 100)) / 100);
  }
  const discount = Math.min(inv.discountMinor, subtotal - insurerPortion);
  const total = subtotal - discount;
  const patientPortion = total - insurerPortion;
  const [{ paid }] = await t.select({ paid: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::int` }).from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "succeeded"), ne(payments.method, "insurance")));
  const [{ insPaid }] = await t.select({ insPaid: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::int` }).from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, "succeeded"), eq(payments.method, "insurance")));
  let status = inv.status;
  if (status !== "void" && status !== "draft") status = paid >= patientPortion ? "paid" : paid > 0 ? "partially_paid" : "issued";
  const [updated] = await t.update(invoices).set({
    subtotalMinor: subtotal, discountMinor: discount, totalMinor: total, insurerPortionMinor: insurerPortion,
    patientPortionMinor: patientPortion, paidMinor: paid, insurerPaidMinor: insPaid, status,
  }).where(eq(invoices.id, invoiceId)).returning();
  return updated;
}

export async function issueInvoice(t: Tx, ctx: Ctx, invoiceId: string) {
  const [inv] = await t.update(invoices).set({ status: "issued", issuedAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "draft"))).returning();
  if (!inv) return recalcInvoice(t, invoiceId);
  const updated = await recalcInvoice(t, invoiceId);
  await audit(t, ctx, "issue", "invoice", invoiceId, { patientId: inv.patientId });
  await emit(t, ctx.tenant.id, "invoice.issued", { id: inv.id, invoiceNo: inv.invoiceNo, totalMinor: updated.totalMinor });
  return updated;
}

/** Unallocated money on the patient's account (deposits minus deposit applications). */
export async function patientCredit(t: Tx, patientId: string): Promise<number> {
  const [{ v }] = await t.select({
    v: sql<number>`coalesce(sum(case when ${payments.invoiceId} is null then ${payments.amountMinor} when ${payments.method} = 'deposit' then -${payments.amountMinor} else 0 end), 0)::int`,
  }).from(payments).where(and(eq(payments.patientId, patientId), eq(payments.status, "succeeded")));
  return v;
}

export type PaymentInput = {
  invoiceId?: string | null; patientId: string; amountMinor: number;
  method: (typeof payments.$inferInsert)["method"]; reference?: string | null; clientId?: string | null;
  provider?: string; providerRef?: string; status?: "pending" | "succeeded";
};

/** Records a payment (or a deposit when invoiceId is null) and returns it. Idempotent on clientId/providerRef. */
export async function recordPayment(t: Tx, ctx: Pick<Ctx, "tenant" | "branchId" | "user"> & Partial<Ctx>, o: PaymentInput) {
  if (o.amountMinor <= 0) throw new UserError("Amount must be greater than zero");
  if (o.clientId) {
    const [dup] = await t.select().from(payments).where(eq(payments.clientId, o.clientId));
    if (dup) return dup;
  }
  let branchId = ctx.branchId;
  if (o.invoiceId) {
    const [inv] = await t.select().from(invoices).where(eq(invoices.id, o.invoiceId));
    if (!inv || inv.patientId !== o.patientId) throw new UserError("Invoice not found");
    if (inv.status === "void") throw new UserError("Invoice is void");
    if (inv.status === "draft") await t.update(invoices).set({ status: "issued", issuedAt: new Date() }).where(eq(invoices.id, inv.id));
    branchId = inv.branchId;
    if (o.method !== "insurance" && o.amountMinor > inv.patientPortionMinor - inv.paidMinor) {
      throw new UserError("Amount is more than the balance. Record the extra as a deposit instead.");
    }
  } else if (o.method === "deposit" || o.method === "insurance") {
    throw new UserError("Choose an invoice to apply this payment to");
  }
  if (o.method === "deposit" && (await patientCredit(t, o.patientId)) < o.amountMinor) throw new UserError("Not enough credit on the patient's account");
  const [p] = await t.insert(payments).values({
    tenantId: ctx.tenant.id, branchId, patientId: o.patientId, invoiceId: o.invoiceId ?? null, amountMinor: o.amountMinor,
    method: o.method, reference: o.reference ?? null, clientId: o.clientId ?? null, provider: o.provider ?? "manual",
    providerRef: o.providerRef ?? null, status: o.status ?? "succeeded", receivedBy: ctx.user?.id ?? null,
    receiptNo: await nextNumber(t, ctx.tenant.id, "receipt"),
  }).returning();
  if (o.invoiceId) await recalcInvoice(t, o.invoiceId);
  if (p.status === "succeeded") await emit(t, ctx.tenant.id, "payment.received", { id: p.id, invoiceId: p.invoiceId, amountMinor: p.amountMinor, method: p.method });
  return p;
}

export async function outstandingForPatient(t: Tx, patientId: string) {
  const [{ v }] = await t.select({ v: sql<number>`coalesce(sum(${invoices.patientPortionMinor} - ${invoices.paidMinor}), 0)::int` })
    .from(invoices).where(and(eq(invoices.patientId, patientId), sql`${invoices.status} in ('issued','partially_paid')`));
  return v;
}

