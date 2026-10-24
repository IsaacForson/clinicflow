import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { adminDb } from "@/db";
import { fxRates, priceBook } from "@/db/schema";
import { clinicMrrMinor, convertMinor, DEFAULT_PER_USD, priceListFor, type PriceList, type Rates } from "./money";
import { PLANS, type PlanKey } from "./plans";

type R = Record<string, unknown>;
const q = async <T extends R>(s: SQL) => (await adminDb().execute(s)) as unknown as T[];

/** Money context for Control: every figure is converted into the viewing admin's currency. */
export type MoneyCtx = { display: string; rates: Rates; lists: Map<string, PriceList> };

export async function moneyCtx(display: string): Promise<MoneyCtx> {
  const [rateRows, books] = await Promise.all([adminDb().select().from(fxRates), adminDb().select().from(priceBook)]);
  const rates = { ...DEFAULT_PER_USD, ...Object.fromEntries(rateRows.map((r) => [r.currency, r.perUsd])) };
  const custom = new Map(books.map((b) => [b.currency, b]));
  const lists = new Map<string, PriceList>();
  for (const c of new Set([...Object.keys(rates), ...custom.keys()])) lists.set(c, priceListFor(c, rates, custom.get(c) ?? null));
  return { display, rates, lists };
}

const listFor = (m: MoneyCtx, currency: string) => m.lists.get(currency) ?? priceListFor(currency, m.rates);
const toDisplay = (m: MoneyCtx, minor: number, from: string) => convertMinor(minor, from, m.display, m.rates);

/** A clinic's MRR in its own currency (from its local price list) and in the admin's currency. */
export function clinicMrr(m: MoneyCtx, t: { currency: string; plan: PlanKey; planStatus: string; billingCycle: string; scribeSeats: number; suspendedAt?: Date | string | null }) {
  const local = clinicMrrMinor(listFor(m, t.currency), t);
  return { local, display: toDisplay(m, local, t.currency) };
}

export async function platformOverview(m: MoneyCtx) {
  const tenants = await q<{ id: string; currency: string; plan: PlanKey; planStatus: string; billingCycle: string; scribeSeats: number; suspendedAt: string | null; createdAt: string; trialEndsAt: string | null }>(sql`
    select id, currency, plan, plan_status as "planStatus", billing_cycle as "billingCycle", scribe_seats as "scribeSeats", suspended_at as "suspendedAt", created_at as "createdAt", trial_ends_at as "trialEndsAt" from tenants`);
  const mrr = tenants.reduce((s, t) => s + clinicMrr(m, t).display, 0);
  const byStatus = tenants.reduce<Record<string, number>>((m, t) => { const k = t.suspendedAt ? "suspended" : t.planStatus; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const byPlan = tenants.filter((t) => t.planStatus === "active" && !t.suspendedAt).reduce<Record<string, number>>((m, t) => { m[t.plan] = (m[t.plan] ?? 0) + 1; return m; }, {});
  const trialsEndingSoon = tenants.filter((t) => t.planStatus === "trialing" && t.trialEndsAt && new Date(t.trialEndsAt).getTime() - Date.now() < 3 * 86400_000).length;

  const [activity] = await q<{ active7: number; patients: number; visits30: number; payments30: number }>(sql`
    select
      (select count(distinct tenant_id)::int from audit.log where at > now() - interval '7 days') as active7,
      (select count(*)::int from patients where deleted_at is null) as patients,
      (select count(*)::int from visits where started_at > now() - interval '30 days') as visits30,
      (select count(*)::int from payments where status = 'succeeded' and received_at > now() - interval '30 days') as payments30`);
  // Money processed by clinics through ClinicFlow, per currency (never summed across currencies).
  const gmv = await q<{ currency: string; amount: number; clinics: number }>(sql`
    select t.currency, sum(p.amount_minor)::bigint as amount, count(distinct p.tenant_id)::int as clinics
    from payments p join tenants t on t.id = p.tenant_id
    where p.status = 'succeeded' and p.method <> 'deposit' and p.received_at > now() - interval '30 days' group by 1 order by 2 desc`);

  const signups = await q<{ week: string; n: number }>(sql`
    select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as n from tenants
    where created_at > now() - interval '12 weeks' group by 1 order by 1`);
  const collected = await q<{ month: string; currency: string; amount: number }>(sql`
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, coalesce(currency, 'USD') as currency, sum(amount_minor)::bigint as amount
    from billing_events where type = 'charge.success' and created_at > now() - interval '12 months' group by 1, 2 order by 1`);
  const churn = await q<{ month: string; n: number }>(sql`
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*)::int as n from billing_events
    where type in ('subscription.disable', 'invoice.payment_failed') and created_at > now() - interval '12 months' group by 1 order by 1`);
  const [messaging] = await q<{ sent: number; failed: number; whatsapp: number; sms: number }>(sql`
    select count(*) filter (where status in ('sent','delivered','read'))::int as sent, count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where channel = 'whatsapp' and direction = 'out')::int as whatsapp, count(*) filter (where channel = 'sms' and direction = 'out')::int as sms
    from message_log where created_at > now() - interval '30 days'`);
  const [ai] = await q<{ notes: number; inTok: number; outTok: number; audio: number }>(sql`
    select count(*)::int as notes, coalesce(sum(input_tokens), 0)::int as "inTok", coalesce(sum(output_tokens), 0)::int as "outTok", coalesce(sum(audio_seconds), 0)::int as audio
    from scribe_sessions where created_at > now() - interval '30 days'`);
  return {
    clinics: tenants.length, mrr, arr: mrr * 12, byStatus, byPlan, trialsEndingSoon,
    payingClinics: tenants.filter((t) => clinicMrr(m, t).local > 0).length,
    activity, signups, churn, messaging, ai,
    gmv: gmv.map((g) => ({ ...g, amount: Number(g.amount), display: toDisplay(m, Number(g.amount), g.currency) })),
    gmvTotal: gmv.reduce((s, g) => s + toDisplay(m, Number(g.amount), g.currency), 0),
    // Subscription charges in any currency, converted and summed per month.
    collected: [...collected.reduce((acc, c) => acc.set(c.month, (acc.get(c.month) ?? 0) + toDisplay(m, Number(c.amount), c.currency)), new Map<string, number>())]
      .map(([month, amount]) => ({ month, amount })),
    aiCost: toDisplay(m, Math.round(((ai.inTok * 1 + ai.outTok * 5) / 1_000_000 + (ai.audio * 0.0077) / 60) * 100), "USD"), // rough planning estimate
  };
}

export type ClinicRow = {
  id: string; name: string; country: string; currency: string; plan: PlanKey; planStatus: string; billingCycle: string; scribeSeats: number;
  suspendedAt: string | null; trialEndsAt: string | null; currentPeriodEnd: string | null; createdAt: string;
  users: number; patients: number; lastActive: string | null; ownerEmail: string | null; ownerPhone: string | null; ownerName: string | null;
};

export async function listClinics(o: { q?: string; status?: string; limit?: number; offset?: number }) {
  const like = o.q ? `%${o.q}%` : null;
  return q<ClinicRow>(sql`
    select t.id, t.name, t.country, t.currency, t.plan, t.plan_status as "planStatus", t.billing_cycle as "billingCycle", t.scribe_seats as "scribeSeats",
      t.suspended_at as "suspendedAt", t.trial_ends_at as "trialEndsAt", t.current_period_end as "currentPeriodEnd", t.created_at as "createdAt",
      (select count(*)::int from users u where u.tenant_id = t.id and u.active) as users,
      (select count(*)::int from patients p where p.tenant_id = t.id and p.deleted_at is null) as patients,
      (select max(at) from audit.log a where a.tenant_id = t.id) as "lastActive",
      o.email as "ownerEmail", o.phone as "ownerPhone", o.name as "ownerName"
    from tenants t
    left join lateral (select email, phone, name from users where tenant_id = t.id and role = 'owner' and active order by created_at limit 1) o on true
    where (${like}::text is null or t.name ilike ${like} or t.slug ilike ${like} or o.email ilike ${like} or o.phone ilike ${like})
      and (${o.status ?? null}::text is null or (case when t.suspended_at is not null then 'suspended' else t.plan_status::text end) = ${o.status ?? null})
    order by t.created_at desc limit ${o.limit ?? 50} offset ${o.offset ?? 0}`);
}

export async function clinicStats(tenantId: string) {
  const [s] = await q<{ visits30: number; payments30: number; gmv30: number; messages30: number; scribe30: number; invoicesOpen: number; branches: number; lastLogin: string | null }>(sql`
    select
      (select count(*)::int from visits where tenant_id = ${tenantId} and started_at > now() - interval '30 days') as visits30,
      (select count(*)::int from payments where tenant_id = ${tenantId} and status = 'succeeded' and received_at > now() - interval '30 days') as payments30,
      (select coalesce(sum(amount_minor), 0)::bigint from payments where tenant_id = ${tenantId} and status = 'succeeded' and received_at > now() - interval '30 days') as gmv30,
      (select count(*)::int from message_log where tenant_id = ${tenantId} and direction = 'out' and created_at > date_trunc('month', now())) as messages30,
      (select count(*)::int from scribe_sessions where tenant_id = ${tenantId} and created_at > date_trunc('month', now())) as scribe30,
      (select count(*)::int from invoices where tenant_id = ${tenantId} and status in ('issued','partially_paid')) as "invoicesOpen",
      (select count(*)::int from branches where tenant_id = ${tenantId} and active) as branches,
      (select max(last_login_at) from users where tenant_id = ${tenantId}) as "lastLogin"`);
  return { ...s, gmv30: Number(s.gmv30) };
}

/** Clinics that asked to be deleted (owner request in the clinic audit log), newest first, minus ones cancelled since. */
export async function deletionRequests(tenantId?: string) {
  return q<{ tenantId: string; name: string | null; requestedAt: string; deleteAfter: string | null; by: string | null }>(sql`
    select distinct on (a.tenant_id) a.tenant_id as "tenantId", t.name, a.at as "requestedAt", a.details->>'deleteAfter' as "deleteAfter", u.name as by
    from audit.log a left join tenants t on t.id = a.tenant_id left join users u on u.id = a.user_id
    where a.action in ('deletion_request', 'deletion_cancel') ${tenantId ? sql`and a.tenant_id = ${tenantId}` : sql``}
    order by a.tenant_id, a.at desc`).then((rows) => rows.filter((r) => r.deleteAfter !== null || false));
}

export async function systemHealth() {
  const jobs = await q<{ status: string; type: string; n: number }>(sql`select status::text as status, type, count(*)::int as n from jobs group by 1, 2 order by 1, 2`);
  const failedJobs = await q<{ id: string; type: string; tenantId: string | null; attempts: number; lastError: string | null; runAt: string; clinic: string | null }>(sql`
    select j.id, j.type, j.tenant_id as "tenantId", j.attempts, j.last_error as "lastError", j.run_at as "runAt", t.name as clinic
    from jobs j left join tenants t on t.id = j.tenant_id where j.status = 'failed' order by j.run_at desc limit 50`);
  const [backlog] = await q<{ overdue: number; oldest: string | null }>(sql`
    select count(*)::int as overdue, min(run_at) as oldest from jobs where status = 'pending' and run_at < now() - interval '5 minutes'`);
  const msgFailures = await q<{ error: string | null; n: number }>(sql`
    select coalesce(error, 'unknown') as error, count(*)::int as n from message_log where status = 'failed' and created_at > now() - interval '7 days' group by 1 order by 2 desc limit 10`);
  const [hooks] = await q<{ failed: number; pending: number }>(sql`
    select count(*) filter (where status = 'failed')::int as failed, count(*) filter (where status in ('pending','retrying'))::int as pending from webhook_deliveries`);
  return { jobs, failedJobs, backlog, msgFailures, hooks };
}

export async function revenueDetails(m: MoneyCtx) {
  const clinics = await q<{ id: string; name: string; currency: string; plan: PlanKey; planStatus: string; billingCycle: string; scribeSeats: number; suspendedAt: string | null; currentPeriodEnd: string | null; trialEndsAt: string | null }>(sql`
    select id, name, currency, plan, plan_status as "planStatus", billing_cycle as "billingCycle", scribe_seats as "scribeSeats", suspended_at as "suspendedAt",
      current_period_end as "currentPeriodEnd", trial_ends_at as "trialEndsAt" from tenants`);
  const paying = clinics.filter((c) => clinicMrr(m, c).local > 0);
  const byPlan = (Object.keys(PLANS) as PlanKey[]).map((plan) => {
    const rows = paying.filter((c) => c.plan === plan);
    return { plan, clinics: rows.length, annual: rows.filter((r) => r.billingCycle === "annual").length,
      mrr: rows.reduce((s, r) => s + clinicMrr(m, { ...r, scribeSeats: 0 }).display, 0) };
  });
  const scribeMrr = paying.reduce((s, c) => s + clinicMrr(m, c).display - clinicMrr(m, { ...c, scribeSeats: 0 }).display, 0);
  const soon = (d: string | null, days: number) => !!d && new Date(d).getTime() - Date.now() < days * 86400_000 && new Date(d).getTime() > Date.now() - 86400_000;
  const ledger = await q<{ id: string; createdAt: string; type: string; amountMinor: number | null; currency: string | null; providerRef: string | null; tenantId: string; clinic: string | null }>(sql`
    select e.id, e.created_at as "createdAt", e.type, e.amount_minor as "amountMinor", e.currency, e.provider_ref as "providerRef", e.tenant_id as "tenantId", t.name as clinic
    from billing_events e left join tenants t on t.id = e.tenant_id order by e.created_at desc limit 100`);
  const totals = await q<{ currency: string; month: number; year: number }>(sql`
    select coalesce(currency, 'USD') as currency,
      coalesce(sum(amount_minor) filter (where created_at >= date_trunc('month', now())), 0)::bigint as month,
      coalesce(sum(amount_minor) filter (where created_at >= date_trunc('year', now())), 0)::bigint as year
    from billing_events where type = 'charge.success' group by 1`);
  return {
    byPlan, scribeMrr, mrr: paying.reduce((s, c) => s + clinicMrr(m, c).display, 0),
    renewals: paying.filter((c) => soon(c.currentPeriodEnd, 14)).sort((a, b) => String(a.currentPeriodEnd).localeCompare(String(b.currentPeriodEnd))),
    pastDue: clinics.filter((c) => c.planStatus === "past_due" || c.planStatus === "read_only"),
    trialsEnding: clinics.filter((c) => c.planStatus === "trialing" && soon(c.trialEndsAt, 7)),
    ledger: ledger.map((e) => ({ ...e, display: e.amountMinor != null ? toDisplay(m, e.amountMinor, e.currency ?? "USD") : null })),
    collectedMonth: totals.reduce((s, t) => s + toDisplay(m, Number(t.month), t.currency), 0),
    collectedYear: totals.reduce((s, t) => s + toDisplay(m, Number(t.year), t.currency), 0),
  };
}
