import { eq, or } from "drizzle-orm";
import { adminDb, withTenant } from "@/db";
import { billingEvents, invoices, payments, tenants } from "@/db/schema";
import { recordPayment } from "@/lib/billing";
import { money } from "@/lib/format";
import { queuePatientMessage } from "@/lib/messaging";
import { paystackKey, verifyWebhookSignature } from "@/lib/paystack";

type Evt = {
  event: string;
  data: {
    reference?: string; amount?: number; currency?: string; channel?: string; status?: string;
    metadata?: Record<string, unknown> | string | null; plan?: { plan_code?: string } | string | null;
    customer?: { customer_code?: string; email?: string }; subscription_code?: string; subscription?: { subscription_code?: string };
  };
};

const PLANS = ["solo", "clinic", "group"] as const;
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const ok = () => new Response("ok");

export async function POST(req: Request) {
  const raw = await req.text();
  let evt: Evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const meta = (typeof evt.data?.metadata === "string" ? safeJson(evt.data.metadata) : evt.data?.metadata) ?? {};
  const kind = typeof meta.kind === "string" ? meta.kind : null;
  const tenantId = isUuid(meta.tenantId) ? meta.tenantId : null;
  const sig = req.headers.get("x-paystack-signature");
  const platformKey = process.env.PAYSTACK_SECRET_KEY;
  const byPlatform = !!platformKey && verifyWebhookSignature(raw, sig, platformKey);

  // Patient payments may be signed by the clinic's own key; anything touching plans must be signed by the platform key.
  if (evt.event === "charge.success" && kind === "patient_payment" && tenantId) {
    const tenantKey = await paystackKey(tenantId);
    if (!byPlatform && !(tenantKey && verifyWebhookSignature(raw, sig, tenantKey))) return new Response("Bad signature", { status: 401 });
    try {
      await patientPayment(tenantId, meta, evt.data);
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if ((err.cause?.code ?? err.code) !== "23505") throw e; // concurrent duplicate delivery lost the race: already recorded
    }
    return ok();
  }
  if (!byPlatform) return new Response("Bad signature", { status: 401 });

  if (evt.event === "charge.success" && (kind === "subscription" || kind === "migration") && tenantId) {
    await subscriptionCharge(tenantId, kind, meta, evt);
  } else if (evt.event === "subscription.create") {
    const t = await tenantByCustomer(evt);
    const code = evt.data.subscription_code;
    if (t && code) await adminDb().update(tenants).set({ paystackSubscriptionCode: code }).where(eq(tenants.id, t.id));
  } else if (evt.event === "subscription.disable" || evt.event === "subscription.not_renew" || evt.event === "invoice.payment_failed") {
    const t = await tenantByCustomer(evt);
    if (t) {
      const inserted = await logEvent(t.id, evt, `${evt.event}:${evt.data.subscription_code ?? evt.data.subscription?.subscription_code ?? ""}:${new Date().toISOString().slice(0, 10)}`);
      if (inserted && evt.event !== "subscription.not_renew") await adminDb().update(tenants).set({ planStatus: "past_due" }).where(eq(tenants.id, t.id));
    }
  } else if (evt.event === "charge.success" && !kind) {
    // Recurring plan renewal charged by Paystack itself: no metadata, matched by customer code.
    const t = await tenantByCustomer(evt);
    if (t && (await logEvent(t.id, evt, evt.data.reference ?? null))) await extendPeriod(t.id, t.billingCycle === "annual" ? "annual" : "monthly", {});
  }
  return ok();
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function patientPayment(tenantId: string, meta: Record<string, unknown>, data: Evt["data"]) {
  const ref = data.reference;
  const amount = Math.round(data.amount ?? 0);
  if (!ref || amount <= 0 || !isUuid(meta.patientId)) return;
  const patientId = meta.patientId;
  const method = data.channel === "mobile_money" ? "mobile_money" : data.channel === "bank_transfer" || data.channel === "bank" ? "bank" : "card";
  await withTenant(tenantId, async (t) => {
    const [dup] = await t.select({ id: payments.id }).from(payments).where(eq(payments.providerRef, ref));
    if (dup) return;
    const [inv] = isUuid(meta.invoiceId) ? await t.select().from(invoices).where(eq(invoices.id, meta.invoiceId)) : [];
    const [tenant] = await t.select({ currency: tenants.currency }).from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant || (inv && inv.patientId !== patientId)) return;
    if (data.currency && data.currency !== tenant.currency) console.warn(`Paystack ${ref}: currency ${data.currency} differs from tenant ${tenant.currency}`);
    let branchId = inv?.branchId;
    if (!branchId) {
      const [anyPay] = await t.select({ b: payments.branchId }).from(payments).where(eq(payments.patientId, patientId)).limit(1);
      branchId = anyPay?.b;
    }
    if (!branchId) return; // no invoice and no history: nothing sensible to attach the money to
    const ctx = { tenant: { id: tenantId }, branchId, user: null };
    const balance = inv && inv.status !== "void" && inv.status !== "paid" ? Math.max(0, inv.patientPortionMinor - inv.paidMinor) : 0;
    const toInvoice = Math.min(amount, balance);
    const base = { patientId, method, provider: "paystack", reference: ref } as const;
    // Money already taken: anything beyond the invoice balance becomes credit on account rather than being lost.
    const p = toInvoice > 0
      ? await recordPayment(t, ctx, { ...base, invoiceId: inv!.id, amountMinor: toInvoice, providerRef: ref })
      : await recordPayment(t, ctx, { ...base, amountMinor: amount, providerRef: ref });
    if (toInvoice > 0 && amount > toInvoice) await recordPayment(t, ctx, { ...base, amountMinor: amount - toInvoice, providerRef: `${ref}:credit` });
    await queuePatientMessage(t, {
      tenantId, patientId, templateKey: "receipt", purpose: "billing",
      vars: { amount: money(amount, tenant.currency), method: method === "mobile_money" ? "mobile money" : method, receipt: p.receiptNo },
    });
  });
}

async function logEvent(tenantId: string, evt: Evt, providerRef: string | null) {
  const rows = await adminDb().insert(billingEvents).values({
    tenantId, type: evt.event, amountMinor: evt.data.amount ?? null, currency: evt.data.currency ?? null, providerRef, data: evt.data,
  }).onConflictDoNothing({ target: billingEvents.providerRef }).returning({ id: billingEvents.id });
  return rows.length > 0;
}

async function subscriptionCharge(tenantId: string, kind: string, meta: Record<string, unknown>, evt: Evt) {
  if (!(await logEvent(tenantId, evt, evt.data.reference ?? null))) return; // duplicate delivery
  const customer = evt.data.customer?.customer_code;
  if (customer) await adminDb().update(tenants).set({ paystackCustomerCode: customer }).where(eq(tenants.id, tenantId));
  if (kind !== "subscription" && !meta.plan) return;
  const cycle = meta.cycle === "annual" ? "annual" : "monthly";
  const plan = PLANS.find((p) => p === meta.plan);
  const seats = Number(meta.scribeSeats);
  await extendPeriod(tenantId, cycle, { plan, scribeSeats: Number.isInteger(seats) && seats >= 0 ? seats : undefined });
}

async function extendPeriod(tenantId: string, cycle: "monthly" | "annual", o: { plan?: (typeof PLANS)[number]; scribeSeats?: number }) {
  const [t] = await adminDb().select({ end: tenants.currentPeriodEnd }).from(tenants).where(eq(tenants.id, tenantId));
  if (!t) return;
  const from = t.end && t.end > new Date() ? new Date(t.end) : new Date();
  if (cycle === "annual") from.setUTCFullYear(from.getUTCFullYear() + 1);
  else from.setUTCMonth(from.getUTCMonth() + 1);
  await adminDb().update(tenants).set({
    planStatus: "active", billingCycle: cycle, currentPeriodEnd: from,
    ...(o.plan ? { plan: o.plan } : {}), ...(o.scribeSeats !== undefined ? { scribeSeats: o.scribeSeats } : {}),
  }).where(eq(tenants.id, tenantId));
}

async function tenantByCustomer(evt: Evt) {
  const customer = evt.data.customer?.customer_code;
  const sub = evt.data.subscription_code ?? evt.data.subscription?.subscription_code;
  if (!customer && !sub) return null;
  const [t] = await adminDb().select().from(tenants).where(or(
    customer ? eq(tenants.paystackCustomerCode, customer) : undefined, sub ? eq(tenants.paystackSubscriptionCode, sub) : undefined,
  )).limit(1);
  return t ?? null;
}
