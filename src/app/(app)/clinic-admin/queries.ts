import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db";
import type { Ctx } from "@/lib/auth";
import { dayRange } from "@/lib/format";
import { pct } from "../reports/range";
import { currentSeats } from "../settings/limits";
import { SETTING_ENTITIES, trendMonths, type ActivityType, type Period } from "./lib";

type R = Record<string, unknown>;
const q = async <T extends R = R>(t: Tx, s: SQL) => (await t.execute(s)) as unknown as T[];
const one = async <T extends R = R>(t: Tx, s: SQL) => (await q<T>(t, s))[0];
const iso = (d: Date) => d.toISOString(); // raw sql params aren't serialized by postgres-js
const between = (col: SQL, start: Date, end: Date) => sql`${col} >= ${iso(start)} and ${col} < ${iso(end)}`;

// Same definitions as /reports: collected excludes deposit applications (already counted when deposited) and refunded rows.
const COLLECTED = sql`p.status = 'succeeded' and p.method <> 'deposit'`;
const BILLED = sql`i.status not in ('void', 'draft')`;
const BILL_DATE = sql`coalesce(i.issued_at, i.created_at)`;
const OPEN = sql`i.status in ('issued', 'partially_paid', 'paid')`;

export type Filter = { branchIds: string[]; period: Period };

export async function overview(t: Tx, ctx: Ctx, { branchIds: b, period: p }: Filter) {
  const tz = ctx.tenant.timezone;
  const inCur = (col: SQL) => between(col, p.start, p.end);
  const inPrev = (col: SQL) => between(col, p.prevStart, p.prevEnd);
  const tr = trendMonths(p.to);
  const trStart = dayRange(tr.from, tz).start, trEnd = dayRange(tr.until, tz).start;
  const month = (col: SQL) => sql`to_char(${col} at time zone ${tz}, 'YYYY-MM')`;

  const money = await one<{ collected: number; prevCollected: number; patientCollected: number; prevPatientCollected: number }>(t, sql`select
      coalesce(sum(p.amount_minor) filter (where ${inCur(sql`p.received_at`)}), 0)::int as collected,
      coalesce(sum(p.amount_minor) filter (where ${inPrev(sql`p.received_at`)}), 0)::int as "prevCollected",
      coalesce(sum(p.amount_minor) filter (where p.method <> 'insurance' and ${inCur(sql`p.received_at`)}), 0)::int as "patientCollected",
      coalesce(sum(p.amount_minor) filter (where p.method <> 'insurance' and ${inPrev(sql`p.received_at`)}), 0)::int as "prevPatientCollected"
    from payments p where ${COLLECTED} and p.branch_id in ${b} and ${between(sql`p.received_at`, p.prevStart, p.end)}`);

  const billed = await one<{ invoiced: number; prevInvoiced: number; patientBilled: number; prevPatientBilled: number }>(t, sql`select
      coalesce(sum(i.total_minor) filter (where ${inCur(BILL_DATE)}), 0)::int as invoiced,
      coalesce(sum(i.total_minor) filter (where ${inPrev(BILL_DATE)}), 0)::int as "prevInvoiced",
      coalesce(sum(i.patient_portion_minor) filter (where ${inCur(BILL_DATE)}), 0)::int as "patientBilled",
      coalesce(sum(i.patient_portion_minor) filter (where ${inPrev(BILL_DATE)}), 0)::int as "prevPatientBilled"
    from invoices i where ${BILLED} and i.branch_id in ${b} and ${between(BILL_DATE, p.prevStart, p.end)}`);

  const ops = await one<{ visits: number; prevVisits: number; appts: number; noShows: number; prevAppts: number; prevNoShows: number; waitMin: number | null; prevWaitMin: number | null }>(t, sql`select
      (select count(*) from visits v where v.branch_id in ${b} and ${inCur(sql`v.started_at`)})::int as visits,
      (select count(*) from visits v where v.branch_id in ${b} and ${inPrev(sql`v.started_at`)})::int as "prevVisits",
      a.appts, a."noShows", a."prevAppts", a."prevNoShows",
      (select round(avg(extract(epoch from q.called_at - q.created_at) / 60)::numeric, 1)::float from queue_tickets q
        where q.called_at is not null and q.branch_id in ${b} and ${inCur(sql`q.created_at`)}) as "waitMin",
      (select round(avg(extract(epoch from q.called_at - q.created_at) / 60)::numeric, 1)::float from queue_tickets q
        where q.called_at is not null and q.branch_id in ${b} and ${inPrev(sql`q.created_at`)}) as "prevWaitMin"
    from (select count(*) filter (where ${inCur(sql`starts_at`)})::int as appts,
        count(*) filter (where status = 'no_show' and ${inCur(sql`starts_at`)})::int as "noShows",
        count(*) filter (where ${inPrev(sql`starts_at`)})::int as "prevAppts",
        count(*) filter (where status = 'no_show' and ${inPrev(sql`starts_at`)})::int as "prevNoShows"
      from appointments where status <> 'cancelled' and starts_at < now() and branch_id in ${b} and ${between(sql`starts_at`, p.prevStart, p.end)}) a`);

  // Patients aren't tied to a branch, so these are clinic-wide.
  const patients = await one<{ total: number; fresh: number; prevFresh: number }>(t, sql`select count(*)::int as total,
      count(*) filter (where ${inCur(sql`created_at`)})::int as fresh, count(*) filter (where ${inPrev(sql`created_at`)})::int as "prevFresh"
    from patients where deleted_at is null and merged_into_id is null`);

  const balances = await one<{ patientOwes: number; debtors: number; insurerOwes: number }>(t, sql`select
      coalesce(sum(greatest(i.patient_portion_minor - i.paid_minor, 0)), 0)::int as "patientOwes",
      count(distinct i.patient_id) filter (where i.patient_portion_minor > i.paid_minor)::int as debtors,
      coalesce(sum(greatest(i.insurer_portion_minor - i.insurer_paid_minor, 0)), 0)::int as "insurerOwes"
    from invoices i where ${OPEN} and i.branch_id in ${b}`);

  const expenses = await one<{ cur: number; prev: number }>(t, sql`select
      coalesce(sum(amount_minor) filter (where day between ${p.from} and ${p.to}), 0)::int as cur,
      coalesce(sum(amount_minor) filter (where day between ${p.prevFrom} and ${p.prevTo}), 0)::int as prev
    from expenses where branch_id in ${b} and day between ${p.prevFrom} and ${p.to}`);

  // 12-month series (one row per month per source).
  const trend = await q<{ m: string; kind: string; v: number; v2: number }>(t, sql`
      select ${month(sql`p.received_at`)} as m, 'collected' as kind, sum(p.amount_minor)::int as v,
          coalesce(sum(p.amount_minor) filter (where p.method <> 'insurance'), 0)::int as v2
        from payments p where ${COLLECTED} and p.branch_id in ${b} and ${between(sql`p.received_at`, trStart, trEnd)} group by 1
      union all
      select ${month(BILL_DATE)}, 'billed', sum(i.total_minor)::int, sum(i.patient_portion_minor)::int
        from invoices i where ${BILLED} and i.branch_id in ${b} and ${between(BILL_DATE, trStart, trEnd)} group by 1
      union all
      select ${month(sql`v.started_at`)}, 'visits', count(*)::int, 0 from visits v where v.branch_id in ${b} and ${between(sql`v.started_at`, trStart, trEnd)} group by 1
      union all
      select to_char(e.day, 'YYYY-MM'), 'expenses', sum(e.amount_minor)::int, 0 from expenses e
        where e.branch_id in ${b} and e.day >= ${tr.from} and e.day < ${tr.until} group by 1`);
  const series = (kind: string, field: "v" | "v2" = "v") => tr.months.map((m) => Number(trend.find((x) => x.m === m && x.kind === kind)?.[field] ?? 0));
  const months = {
    labels: tr.months, collected: series("collected"), patientCollected: series("collected", "v2"),
    invoiced: series("billed"), patientBilled: series("billed", "v2"), visits: series("visits"), expenses: series("expenses"),
  };

  const mix = {
    methods: await q<{ label: string; amount: number; n: number }>(t, sql`select replace(p.method::text, '_', ' ') as label, sum(p.amount_minor)::int as amount, count(*)::int as n
      from payments p where ${COLLECTED} and p.branch_id in ${b} and ${inCur(sql`p.received_at`)} group by 1 order by 2 desc`),
    payers: await q<{ label: string; amount: number; n: number }>(t, sql`select case when p.method = 'insurance' then coalesce(ins.name, 'Insurer') else 'Self-pay' end as label,
        sum(p.amount_minor)::int as amount, count(*)::int as n
      from payments p left join invoices i on i.id = p.invoice_id left join insurers ins on ins.id = i.insurer_id
      where ${COLLECTED} and p.branch_id in ${b} and ${inCur(sql`p.received_at`)} group by 1 order by 2 desc`),
    services: await q<{ label: string; qty: number; amount: number }>(t, sql`select s.name as label, sum(l.quantity)::int as qty, sum(l.total_minor)::int as amount
      from invoice_lines l join invoices i on i.id = l.invoice_id join services s on s.id = l.service_id
      where ${BILLED} and i.branch_id in ${b} and ${inCur(BILL_DATE)} group by s.id, s.name order by 3 desc limit 8`),
    practitioners: await q<{ label: string; invoices: number; amount: number }>(t, sql`select coalesce(u.name, 'No consultation') as label, count(*)::int as invoices, sum(i.total_minor)::int as amount
      from invoices i left join visits v on v.id = i.visit_id left join users u on u.id = v.practitioner_id
      where ${BILLED} and i.branch_id in ${b} and ${inCur(BILL_DATE)} group by 1 order by 3 desc limit 10`),
  };

  const insurance = {
    receivables: await q<{ label: string; amount: number; invoices: number }>(t, sql`select coalesce(ins.name, 'Unknown insurer') as label,
        sum(i.insurer_portion_minor - i.insurer_paid_minor)::int as amount, count(*)::int as invoices
      from invoices i left join insurers ins on ins.id = i.insurer_id
      where ${OPEN} and i.branch_id in ${b} and i.insurer_portion_minor > i.insurer_paid_minor group by 1 order by 2 desc`),
    claims: await one<{ claims: number; claimed: number; paid: number; decided: number; rejected: number }>(t, sql`select count(distinct c.id)::int as claims,
        coalesce(sum(ci.amount_claimed_minor), 0)::int as claimed, coalesce(sum(ci.amount_paid_minor), 0)::int as paid,
        count(*) filter (where ci.status <> 'pending')::int as decided, count(*) filter (where ci.status = 'rejected')::int as rejected
      from claims c join claim_items ci on ci.claim_id = c.id join invoices i on i.id = ci.invoice_id
      where c.status <> 'draft' and i.branch_id in ${b} and ${inCur(sql`c.submitted_at`)}`),
  };

  return {
    money, billed, ops, patients, balances, expenses, months, mix, insurance,
    rates: {
      collection: pct(money.patientCollected, billed.patientBilled), prevCollection: pct(money.prevPatientCollected, billed.prevPatientBilled),
      noShow: pct(ops.noShows, ops.appts), prevNoShow: pct(ops.prevNoShows, ops.prevAppts),
      rejection: pct(insurance.claims.rejected, insurance.claims.decided),
    },
  };
}

/** Plan usage: active seats and reminder messages sent this calendar month (clinic timezone). */
export async function usage(t: Tx, ctx: Ctx, monthFrom: string) {
  const seats = await currentSeats(t, ctx.tenant.id);
  const r = await one<{ n: number }>(t, sql`select count(*)::int as n from message_log
    where direction = 'out' and purpose = 'reminder' and status not in ('failed', 'skipped') and created_at >= ${iso(dayRange(monthFrom, ctx.tenant.timezone).start)}`);
  return { ...seats, reminders: r.n };
}

// ---------- Team ----------
export type StaffRow = {
  id: string; name: string; role: string; title: string | null; active: boolean; isPractitioner: boolean; lastLoginAt: string | null;
  signed: number; invoices: number; patients: number; payments: number; collected: number;
};

/** Staff with their activity in the period: counts from the audit log, money received from payments (refunds excluded). */
export async function team(t: Tx, ctx: Ctx, { branchIds: b, period: p }: Filter) {
  return q<StaffRow>(t, sql`select u.id, u.name, u.role::text as role, u.title, u.active, u.is_practitioner as "isPractitioner", u.last_login_at as "lastLoginAt",
      coalesce(a.signed, 0)::int as signed, coalesce(a.invoices, 0)::int as invoices, coalesce(a.patients, 0)::int as patients,
      coalesce(pay.n, 0)::int as payments, coalesce(pay.amount, 0)::int as collected
    from users u
    left join (select user_id, count(*) filter (where action = 'sign' and entity = 'visit') as signed,
        count(*) filter (where action = 'create' and entity = 'invoice') as invoices,
        count(*) filter (where action = 'create' and entity = 'patient') as patients
      from audit.log where user_id is not null and not coalesce(details ? 'impersonatedBy', false) and ${between(sql`at`, p.start, p.end)} group by 1) a on a.user_id = u.id
    left join (select p.received_by, count(*) as n, sum(p.amount_minor) as amount from payments p
      where ${COLLECTED} and p.branch_id in ${b} and ${between(sql`p.received_at`, p.start, p.end)} group by 1) pay on pay.received_by = u.id
    order by u.active desc, (coalesce(a.signed, 0) + coalesce(a.invoices, 0) + coalesce(a.patients, 0) + coalesce(pay.n, 0)) desc, u.name`);
}

// ---------- Activity ----------
export const ACTIVITY_SQL: Record<ActivityType, SQL> = {
  patients: sql`(a.action = 'create' and a.entity = 'patient')`,
  clinical: sql`(a.action in ('sign', 'addendum') and a.entity = 'visit')`,
  payments: sql`((a.action = 'payment' and a.entity = 'invoice') or (a.action in ('create', 'deposit') and a.entity = 'payment'))`,
  refunds: sql`(a.action = 'refund' and a.entity = 'payment')`,
  voids: sql`(a.action = 'void' and a.entity = 'invoice')`,
  discounts: sql`(a.action = 'discount' and a.entity = 'invoice')`,
  writeoffs: sql`(a.action in ('insurer_writeoff', 'insurer_shortfall') and a.entity = 'invoice')`,
  logins: sql`(a.action = 'login' and a.entity = 'user')`,
  exports: sql`(a.action in ('export', 'download') or (a.action = 'request' and a.entity = 'export_job'))`,
  settings: sql`(a.action in ('create', 'update', 'delete', 'revoke', 'reset_password') and a.entity in ${SETTING_ENTITIES})`,
  support: sql`(a.details ? 'impersonatedBy')`,
};

export type ActivityFeedRow = { id: string; at: string; action: string; entity: string; entityId: string | null; details: unknown; userId: string | null; userName: string | null; patientId: string | null; patientNo: string | null };

export async function activity(t: Tx, f: { type: ActivityType | null; userId: string | null; limit: number; offset: number }) {
  const types = f.type ? ACTIVITY_SQL[f.type] : sql`(${sql.join(Object.values(ACTIVITY_SQL), sql` or `)})`;
  return q<ActivityFeedRow>(t, sql`select a.id, a.at, a.action, a.entity, a.entity_id as "entityId", a.details, a.user_id as "userId", u.name as "userName",
      a.patient_id as "patientId", p.patient_no as "patientNo"
    from audit.log a left join users u on u.id = a.user_id left join patients p on p.id = a.patient_id
    where ${types} ${f.userId ? sql`and a.user_id = ${f.userId}` : sql``}
    order by a.at desc limit ${f.limit} offset ${f.offset}`);
}
