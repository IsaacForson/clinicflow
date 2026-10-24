"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cashUps, claimItems, expenses, invoiceLines, invoices, patients, payments } from "@/db/schema";
import { formObject, run, UserError, zInt, zMoney, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { activeInsurer, addLine, createInvoice, issueInvoice, recalcInvoice, recordPayment } from "@/lib/billing";
import { dayRange, money } from "@/lib/format";
import { queuePatientMessage } from "@/lib/messaging";
import { initializePayment } from "@/lib/paystack";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function createInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.write");
    const o = z.object({ patientId: uuid, billInsurer: z.string().optional() }).parse(formObject(fd));
    const inv = await tx(ctx, async (t) => {
      if (o.billInsurer && !(await activeInsurer(t, o.patientId))) throw new UserError("This patient has no active insurance cover");
      return createInvoice(t, ctx, { patientId: o.patientId, useInsurance: !!o.billInsurer });
    });
    revalidatePath("/billing");
    return { ok: true, id: inv.id };
  });
}

export async function addLineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.write");
    const o = z.object({
      invoiceId: uuid, catalog: z.string().optional(), description: z.string().optional(),
      price: zMoney.optional(), quantity: zInt.min(1).max(10000).default(1),
    }).parse(formObject(fd));
    const [kind, refId] = o.catalog?.split(":") ?? [];
    if (!refId && (!o.description || o.price === undefined)) throw new UserError("Pick a service or item, or type a description and price");
    await tx(ctx, async (t) => {
      const inv = await addLine(t, o.invoiceId, {
        serviceId: kind === "s" ? uuid.parse(refId) : null, itemId: kind === "i" ? uuid.parse(refId) : null,
        description: o.description, unitPriceMinor: o.price, quantity: o.quantity,
      });
      await audit(t, ctx, "update", "invoice", o.invoiceId, { patientId: inv.patientId, details: { addLine: o.description ?? o.catalog } });
    });
    revalidatePath(`/billing/${o.invoiceId}`);
  });
}

export async function removeLineAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.write");
    const o = z.object({ id: uuid, invoiceId: uuid }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [inv] = await t.select().from(invoices).where(eq(invoices.id, o.invoiceId));
      if (inv?.status !== "draft") throw new UserError("Lines can only be removed while the invoice is a draft");
      await t.delete(invoiceLines).where(and(eq(invoiceLines.id, o.id), eq(invoiceLines.invoiceId, o.invoiceId)));
      await recalcInvoice(t, o.invoiceId);
      await audit(t, ctx, "update", "invoice", o.invoiceId, { patientId: inv.patientId, details: { removeLine: o.id } });
    });
    revalidatePath(`/billing/${o.invoiceId}`);
  });
}

export async function discountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.void");
    const o = z.object({ invoiceId: uuid, discount: zMoney }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [inv] = await t.select().from(invoices).where(eq(invoices.id, o.invoiceId));
      if (!inv || inv.status === "void" || inv.status === "paid") throw new UserError("This invoice is closed");
      await t.update(invoices).set({ discountMinor: o.discount }).where(eq(invoices.id, inv.id));
      const after = await recalcInvoice(t, inv.id);
      if (after.paidMinor > after.patientPortionMinor) throw new UserError("Discount is more than the remaining balance");
      await audit(t, ctx, "discount", "invoice", inv.id, { patientId: inv.patientId, details: { discountMinor: after.discountMinor } });
    });
    revalidatePath(`/billing/${o.invoiceId}`);
  });
}

export async function issueInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.write");
    const id = uuid.parse(fd.get("invoiceId"));
    await tx(ctx, async (t) => {
      const [{ n }] = await t.select({ n: sql<number>`count(*)::int` }).from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
      if (!n) throw new UserError("Add at least one line first");
      await issueInvoice(t, ctx, id);
    });
    revalidatePath(`/billing/${id}`);
    revalidatePath("/billing");
  });
}

export async function voidInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.void");
    const o = z.object({ invoiceId: uuid, reason: z.string().min(3, "Enter a reason") }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [inv] = await t.select().from(invoices).where(eq(invoices.id, o.invoiceId));
      if (!inv || inv.status === "void") throw new UserError("Invoice not found or already void");
      if (inv.paidMinor + inv.insurerPaidMinor > 0) throw new UserError("This invoice has payments. Reverse them before voiding.");
      const [claimed] = await t.select({ id: claimItems.id }).from(claimItems).where(eq(claimItems.invoiceId, inv.id));
      if (claimed) throw new UserError("This invoice is in an insurance claim. Remove it from the claim first.");
      await t.update(invoices).set({ status: "void", voidReason: o.reason }).where(eq(invoices.id, inv.id));
      await audit(t, ctx, "void", "invoice", inv.id, { patientId: inv.patientId, details: { reason: o.reason } });
    });
    revalidatePath(`/billing/${o.invoiceId}`);
    revalidatePath("/billing");
  });
}

const paymentSchema = z.object({
  patientId: uuid, invoiceId: uuid.optional(), amount: zMoney, clientId: z.string().min(8),
  method: z.enum(["cash", "mobile_money", "card", "bank", "insurance", "deposit"]), reference: z.string().max(100).optional(),
});

export async function takePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("payments.receive");
    const o = paymentSchema.parse(formObject(fd));
    if (!o.invoiceId) throw new UserError("Invoice is required");
    if (o.method === "mobile_money" && !o.reference) throw new UserError("Enter the mobile money transaction reference");
    const p = await tx(ctx, async (t) => {
      const p = await recordPayment(t, ctx, { invoiceId: o.invoiceId, patientId: o.patientId, amountMinor: o.amount, method: o.method, reference: o.reference, clientId: o.clientId });
      await audit(t, ctx, "payment", "invoice", o.invoiceId, { patientId: o.patientId, details: { paymentId: p.id, amountMinor: p.amountMinor, method: p.method } });
      return p;
    });
    revalidatePath(`/billing/${o.invoiceId}`);
    revalidatePath("/billing");
    return { ok: true, id: p.id, message: `Received ${money(p.amountMinor, ctx.tenant.currency)} · ${p.receiptNo}` };
  });
}

export async function depositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("payments.receive");
    const o = paymentSchema.parse(formObject(fd));
    if (o.method === "deposit" || o.method === "insurance") throw new UserError("Choose how the money was paid");
    const p = await tx(ctx, async (t) => {
      const p = await recordPayment(t, ctx, { patientId: o.patientId, amountMinor: o.amount, method: o.method, reference: o.reference, clientId: o.clientId });
      await audit(t, ctx, "deposit", "payment", p.id, { patientId: o.patientId, details: { amountMinor: p.amountMinor } });
      return p;
    });
    revalidatePath("/billing");
    return { ok: true, id: p.id };
  });
}

export async function sendInvoiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("billing.write");
    const id = uuid.parse(fd.get("invoiceId"));
    const sent = await tx(ctx, async (t) => {
      const [inv] = await t.select().from(invoices).where(eq(invoices.id, id));
      if (!inv) throw new UserError("Invoice not found");
      const msg = await queuePatientMessage(t, {
        tenantId: ctx.tenant.id, patientId: inv.patientId, templateKey: "invoice", purpose: "billing",
        vars: { amount: money(inv.patientPortionMinor, ctx.tenant.currency), balance: money(inv.patientPortionMinor - inv.paidMinor, ctx.tenant.currency), link: inv.invoiceNo },
      });
      await audit(t, ctx, "send", "invoice", id, { patientId: inv.patientId });
      return msg;
    });
    if (!sent) throw new UserError("Not sent: the patient has no phone/email on file or has opted out");
    return { ok: true, message: "Invoice sent to the patient" };
  });
}

export async function sendPaymentLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("payments.receive");
    const id = uuid.parse(fd.get("invoiceId"));
    const { inv, email } = await tx(ctx, async (t) => {
      const [row] = await t.select({ inv: invoices, email: patients.email }).from(invoices).innerJoin(patients, eq(patients.id, invoices.patientId)).where(eq(invoices.id, id));
      if (!row) throw new UserError("Invoice not found");
      return row;
    });
    const balance = inv.patientPortionMinor - inv.paidMinor;
    if (inv.status === "void" || balance <= 0) throw new UserError("Nothing to pay on this invoice");
    const payEmail = email ?? ctx.tenant.email ?? "payments@clinicflow.app"; // Paystack requires an email
    const link = await initializePayment({
      tenantId: ctx.tenant.id, email: payEmail, amountMinor: balance, currency: ctx.tenant.currency,
      metadata: { kind: "patient_payment", tenantId: ctx.tenant.id, invoiceId: inv.id, patientId: inv.patientId },
    });
    if (!link) throw new UserError("Online payments are not set up. Connect Paystack in Settings.");
    const sent = await tx(ctx, async (t) => {
      const msg = await queuePatientMessage(t, {
        tenantId: ctx.tenant.id, patientId: inv.patientId, templateKey: "payment_link", purpose: "billing",
        vars: { amount: money(balance, ctx.tenant.currency), link: link.url },
      });
      await audit(t, ctx, "send", "payment_link", inv.id, { patientId: inv.patientId, details: { reference: link.reference } });
      return msg;
    });
    return sent ? { ok: true, message: "Payment link sent" } : { ok: true, message: `Patient has no contact on file or opted out. Link: ${link.url}` };
  });
}

export async function saveCashUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("cashup");
    const o = z.object({ day, counted: zMoney, notes: z.string().max(1000).optional() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const { start, end } = dayRange(o.day, ctx.tenant.timezone);
      const rows = await t.select({ method: payments.method, total: sql<number>`sum(${payments.amountMinor})::int` }).from(payments)
        .where(and(eq(payments.branchId, ctx.branchId), eq(payments.status, "succeeded"), sql`${payments.receivedAt} >= ${start.toISOString()} and ${payments.receivedAt} < ${end.toISOString()}`))
        .groupBy(payments.method);
      const [{ cashOut }] = await t.select({ cashOut: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int` }).from(expenses)
        .where(and(eq(expenses.branchId, ctx.branchId), eq(expenses.day, o.day), eq(expenses.method, "cash")));
      const expected = Object.fromEntries(rows.map((r) => [r.method, r.total]));
      const expectedCash = (expected.cash ?? 0) - cashOut;
      const [c] = await t.insert(cashUps).values({
        tenantId: ctx.tenant.id, branchId: ctx.branchId, day: o.day, userId: ctx.user.id, expected: { ...expected, cash_expenses: cashOut },
        countedCashMinor: o.counted, varianceMinor: o.counted - expectedCash, notes: o.notes ?? null,
      }).returning({ id: cashUps.id });
      await audit(t, ctx, "create", "cash_up", c.id, { details: { day: o.day, variance: o.counted - expectedCash } });
    });
    revalidatePath("/billing/cashup");
    return { ok: true, message: "Cash-up saved" };
  });
}

const expenseSchema = z.object({
  id: uuid.optional(), category: z.string().min(1).max(60), description: z.string().max(300).optional(), paidTo: z.string().max(120).optional(),
  amount: zMoney, method: z.enum(["cash", "mobile_money", "card", "bank"]), day,
});

export async function saveExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("expenses.manage");
    const o = expenseSchema.parse(formObject(fd));
    const row = { category: o.category, description: o.description ?? null, paidTo: o.paidTo ?? null, amountMinor: o.amount, method: o.method, day: o.day };
    await tx(ctx, async (t) => {
      if (o.id) {
        const [e] = await t.update(expenses).set(row).where(eq(expenses.id, o.id)).returning({ id: expenses.id });
        if (!e) throw new UserError("Expense not found");
        await audit(t, ctx, "update", "expense", o.id, { details: row });
      } else {
        const [e] = await t.insert(expenses).values({ ...row, tenantId: ctx.tenant.id, branchId: ctx.branchId, createdBy: ctx.user.id }).returning({ id: expenses.id });
        await audit(t, ctx, "create", "expense", e.id, { details: row });
      }
    });
    revalidatePath("/billing/expenses");
    return { ok: true, message: "Expense saved" };
  });
}

export async function deleteExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("expenses.manage");
    const id = uuid.parse(fd.get("id"));
    await tx(ctx, async (t) => {
      await t.delete(expenses).where(eq(expenses.id, id));
      await audit(t, ctx, "delete", "expense", id);
    });
    revalidatePath("/billing/expenses");
  });
}
