import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/db";
import type { Ctx } from "@/lib/auth";
import { AGE_BANDS, AGING_BUCKETS, WEEKDAYS, ageBand, agingBucket, denseSeries, pct, type Preset, type Range } from "./range";

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Col = { key: string; label: string; kind?: "money" | "int" | "pct" | "minutes" | "text" };
export type Report = {
  title: string; group: string; description: string; cols: Col[];
  /** Renders a bar chart of this column against the first column. */
  chart?: string;
  /** Contains identifiable patient data: reads/exports are audited. */
  patientData?: boolean;
  defaultPreset?: Preset;
  run: (t: Tx, ctx: Ctx, r: Range) => Promise<Row[]>;
};

const q = async <T extends Row>(t: Tx, s: SQL) => (await t.execute(s)) as unknown as T[];
const branches = (ctx: Ctx) => ctx.branches.map((b) => b.id);
// ISO strings, not Date: drizzle's postgres-js driver passes timestamp params through unserialized.
const inRange = (col: SQL, r: Range) => sql`${col} >= ${r.start.toISOString()} and ${col} < ${r.end.toISOString()}`;
const localDate = (col: SQL, ctx: Ctx) => sql`(${col} at time zone ${ctx.tenant.timezone})::date::text`;
const toMap = (rows: Row[], key: string, val: string) => new Map(rows.map((x) => [String(x[key]), Number(x[val])]));

// Collections = money received. Deposit applications move existing credit, so they are excluded to avoid double counting.
const COLLECTED = sql`p.status = 'succeeded' and p.method <> 'deposit'`;
// Billed = invoices that were issued (drafts aren't charges yet, voids never were).
const BILLED = sql`i.status not in ('void', 'draft')`;

export const REPORTS = {
  "revenue-day": {
    title: "Revenue by day", group: "Revenue", description: "Money collected each day (all methods, deposits counted once).",
    cols: [{ key: "day", label: "Day" }, { key: "payments", label: "Payments", kind: "int" }, { key: "amount", label: "Collected", kind: "money" }],
    chart: "amount",
    async run(t, ctx, r) {
      const rows = await q(t, sql`select ${localDate(sql`p.received_at`, ctx)} as day, count(*)::int as payments, sum(p.amount_minor)::int as amount
        from payments p where ${COLLECTED} and ${inRange(sql`p.received_at`, r)} and p.branch_id in ${branches(ctx)} group by 1`);
      const n = toMap(rows, "day", "payments");
      return denseSeries(r.from, r.to, toMap(rows, "day", "amount")).map(({ day, value }) => ({ day, payments: n.get(day) ?? 0, amount: value }));
    },
  },
  "revenue-method": {
    title: "Revenue by payment method", group: "Revenue", description: "Cash, mobile money, card, insurance and bank transfers.",
    cols: [{ key: "method", label: "Method" }, { key: "payments", label: "Payments", kind: "int" }, { key: "amount", label: "Collected", kind: "money" }],
    run: (t, ctx, r) => q(t, sql`select replace(p.method::text, '_', ' ') as method, count(*)::int as payments, sum(p.amount_minor)::int as amount
      from payments p where ${COLLECTED} and ${inRange(sql`p.received_at`, r)} and p.branch_id in ${branches(ctx)} group by 1 order by 3 desc`),
  },
  "revenue-service": {
    title: "Revenue by service", group: "Revenue", description: "Amounts billed per service on issued invoices.",
    cols: [{ key: "service", label: "Service" }, { key: "quantity", label: "Qty", kind: "int" }, { key: "amount", label: "Billed", kind: "money" }],
    run: (t, ctx, r) => q(t, sql`select coalesce(s.name, case when l.item_id is not null then 'Pharmacy items' else 'Other charges' end) as service,
        sum(l.quantity)::int as quantity, sum(l.total_minor)::int as amount
      from invoice_lines l join invoices i on i.id = l.invoice_id left join services s on s.id = l.service_id
      where ${BILLED} and ${inRange(sql`coalesce(i.issued_at, i.created_at)`, r)} and i.branch_id in ${branches(ctx)} group by 1 order by 3 desc`),
  },
  "revenue-practitioner": {
    title: "Revenue by practitioner", group: "Revenue", description: "Invoices linked to each practitioner's consultations.",
    cols: [{ key: "practitioner", label: "Practitioner" }, { key: "invoices", label: "Invoices", kind: "int" }, { key: "billed", label: "Billed", kind: "money" }, { key: "collected", label: "Collected", kind: "money" }],
    run: (t, ctx, r) => q(t, sql`select coalesce(u.name, 'No consultation') as practitioner, count(*)::int as invoices,
        sum(i.total_minor)::int as billed, sum(i.paid_minor + i.insurer_paid_minor)::int as collected
      from invoices i left join visits v on v.id = i.visit_id left join users u on u.id = v.practitioner_id
      where ${BILLED} and ${inRange(sql`coalesce(i.issued_at, i.created_at)`, r)} and i.branch_id in ${branches(ctx)} group by 1 order by 3 desc`),
  },
  "revenue-branch": {
    title: "Revenue by branch", group: "Revenue", description: "Money collected at each branch.",
    cols: [{ key: "branch", label: "Branch" }, { key: "payments", label: "Payments", kind: "int" }, { key: "amount", label: "Collected", kind: "money" }],
    run: (t, ctx, r) => q(t, sql`select b.name as branch, count(*)::int as payments, sum(p.amount_minor)::int as amount
      from payments p join branches b on b.id = p.branch_id
      where ${COLLECTED} and ${inRange(sql`p.received_at`, r)} and p.branch_id in ${branches(ctx)} group by 1 order by 3 desc`),
  },
  "issued-collected": {
    title: "Invoices issued vs collected", group: "Revenue", description: "What was billed each day against what came in.",
    cols: [{ key: "day", label: "Day" }, { key: "invoices", label: "Invoices", kind: "int" }, { key: "issued", label: "Issued", kind: "money" }, { key: "collected", label: "Collected", kind: "money" }],
    async run(t, ctx, r) {
      const inv = await q(t, sql`select ${localDate(sql`coalesce(i.issued_at, i.created_at)`, ctx)} as day, count(*)::int as n, sum(i.total_minor)::int as amount
        from invoices i where ${BILLED} and ${inRange(sql`coalesce(i.issued_at, i.created_at)`, r)} and i.branch_id in ${branches(ctx)} group by 1`);
      const pay = await q(t, sql`select ${localDate(sql`p.received_at`, ctx)} as day, sum(p.amount_minor)::int as amount
        from payments p where ${COLLECTED} and ${inRange(sql`p.received_at`, r)} and p.branch_id in ${branches(ctx)} group by 1`);
      const n = toMap(inv, "day", "n"), issued = toMap(inv, "day", "amount");
      return denseSeries(r.from, r.to, toMap(pay, "day", "amount")).map(({ day, value }) => ({ day, invoices: n.get(day) ?? 0, issued: issued.get(day) ?? 0, collected: value }));
    },
  },
  aging: {
    title: "Outstanding balance aging", group: "Revenue", description: "Unpaid balances today by invoice age (date range not applied).",
    cols: [{ key: "bucket", label: "Age" }, { key: "invoices", label: "Invoices", kind: "int" }, { key: "patient", label: "Patient balance", kind: "money" }, { key: "insurer", label: "Insurer balance", kind: "money" }],
    async run(t, ctx) {
      const tz = ctx.tenant.timezone;
      const rows = await q<{ age: number; n: number; patient: number; insurer: number }>(t, sql`select
          ((now() at time zone ${tz})::date - (coalesce(i.issued_at, i.created_at) at time zone ${tz})::date)::int as age, count(*)::int as n,
          sum(greatest(i.patient_portion_minor - i.paid_minor, 0))::int as patient, sum(greatest(i.insurer_portion_minor - i.insurer_paid_minor, 0))::int as insurer
        from invoices i where i.status in ('issued', 'partially_paid', 'paid') and i.branch_id in ${branches(ctx)}
          and (i.patient_portion_minor > i.paid_minor or i.insurer_portion_minor > i.insurer_paid_minor) group by 1`);
      const out = AGING_BUCKETS.map((bucket) => ({ bucket, invoices: 0, patient: 0, insurer: 0 }));
      for (const x of rows) {
        const b = out.find((o) => o.bucket === agingBucket(x.age))!;
        b.invoices += x.n; b.patient += x.patient; b.insurer += x.insurer;
      }
      return out;
    },
  },
  "noshow-practitioner": {
    title: "No-show rate by practitioner", group: "Appointments", description: "Past appointments (excluding cancellations) that were missed.",
    cols: [{ key: "practitioner", label: "Practitioner" }, { key: "appointments", label: "Appointments", kind: "int" }, { key: "noShows", label: "No-shows", kind: "int" }, { key: "rate", label: "No-show rate", kind: "pct" }],
    async run(t, ctx, r) {
      const rows = await q<{ practitioner: string; appointments: number; noShows: number }>(t, sql`select coalesce(u.name, 'Any practitioner') as practitioner,
          count(*)::int as appointments, count(*) filter (where a.status = 'no_show')::int as "noShows"
        from appointments a left join users u on u.id = a.practitioner_id
        where a.status <> 'cancelled' and a.starts_at < now() and ${inRange(sql`a.starts_at`, r)} and a.branch_id in ${branches(ctx)} group by 1 order by 2 desc`);
      return rows.map((x) => ({ ...x, rate: pct(x.noShows, x.appointments) }));
    },
  },
  "noshow-weekday": {
    title: "No-show rate by day of week", group: "Appointments", description: "Which days patients miss appointments most.",
    cols: [{ key: "weekday", label: "Day" }, { key: "appointments", label: "Appointments", kind: "int" }, { key: "noShows", label: "No-shows", kind: "int" }, { key: "rate", label: "No-show rate", kind: "pct" }],
    chart: "rate",
    async run(t, ctx, r) {
      const rows = await q<{ dow: number; appointments: number; noShows: number }>(t, sql`select extract(isodow from a.starts_at at time zone ${ctx.tenant.timezone})::int as dow,
          count(*)::int as appointments, count(*) filter (where a.status = 'no_show')::int as "noShows"
        from appointments a where a.status <> 'cancelled' and a.starts_at < now() and ${inRange(sql`a.starts_at`, r)} and a.branch_id in ${branches(ctx)} group by 1`);
      return WEEKDAYS.map((weekday, i) => {
        const x = rows.find((y) => y.dow === i + 1);
        return { weekday, appointments: x?.appointments ?? 0, noShows: x?.noShows ?? 0, rate: pct(x?.noShows ?? 0, x?.appointments ?? 0) };
      });
    },
  },
  productivity: {
    title: "Practitioner productivity", group: "Clinical", description: "Patients seen, average consultation time (start to sign) and revenue.",
    cols: [{ key: "practitioner", label: "Practitioner" }, { key: "visits", label: "Consultations", kind: "int" }, { key: "patients", label: "Patients", kind: "int" },
      { key: "unsigned", label: "Unsigned", kind: "int" }, { key: "avgMinutes", label: "Avg. duration", kind: "minutes" }, { key: "revenue", label: "Billed", kind: "money" }],
    run: (t, ctx, r) => q(t, sql`select coalesce(u.name, 'Unassigned') as practitioner, count(*)::int as visits, count(distinct v.patient_id)::int as patients,
        count(*) filter (where v.status = 'open')::int as unsigned,
        round(avg(extract(epoch from v.signed_at - v.started_at) / 60) filter (where v.signed_at is not null))::int as "avgMinutes",
        coalesce(sum(inv.total), 0)::int as revenue
      from visits v left join users u on u.id = v.practitioner_id
      left join (select i.visit_id, sum(i.total_minor) as total from invoices i where ${BILLED} and i.visit_id is not null group by 1) inv on inv.visit_id = v.id
      where ${inRange(sql`v.started_at`, r)} and v.branch_id in ${branches(ctx)} group by 1 order by 2 desc`),
  },
  referrals: {
    title: "Referral sources", group: "Patients", description: "How newly registered patients heard about the clinic.",
    cols: [{ key: "source", label: "Source" }, { key: "patients", label: "New patients", kind: "int" }],
    chart: "patients",
    run: (t, _ctx, r) => q(t, sql`select coalesce(nullif(trim(p.referral_source), ''), 'Not recorded') as source, count(*)::int as patients
      from patients p where p.deleted_at is null and p.merged_into_id is null and ${inRange(sql`p.created_at`, r)} group by 1 order by 2 desc`),
  },
  "new-returning": {
    title: "New vs returning patients", group: "Patients", description: "Consultations that were a patient's first visit, by day.",
    cols: [{ key: "day", label: "Day" }, { key: "newPatients", label: "New", kind: "int" }, { key: "returning", label: "Returning", kind: "int" }],
    chart: "newPatients",
    async run(t, ctx, r) {
      const rows = await q(t, sql`with f as (select patient_id, min(started_at) as first from visits group by 1)
        select ${localDate(sql`v.started_at`, ctx)} as day, count(*) filter (where v.started_at = f.first)::int as n,
          count(*) filter (where v.started_at > f.first)::int as ret
        from visits v join f on f.patient_id = v.patient_id where ${inRange(sql`v.started_at`, r)} and v.branch_id in ${branches(ctx)} group by 1`);
      const ret = toMap(rows, "day", "ret");
      return denseSeries(r.from, r.to, toMap(rows, "day", "n")).map(({ day, value }) => ({ day, newPatients: value, returning: ret.get(day) ?? 0 }));
    },
  },
  leakage: {
    title: "Revenue leakage", group: "Revenue", description: "Signed visits with no invoice, unbilled lab tests and dispensed stock, voids and discounts.",
    cols: [{ key: "kind", label: "Issue" }, { key: "day", label: "Date" }, { key: "ref", label: "Reference" }, { key: "detail", label: "Detail" }, { key: "amount", label: "Amount", kind: "money" }],
    async run(t, ctx, r) {
      const b = branches(ctx);
      const day = (col: SQL) => localDate(col, ctx);
      const parts = [
        sql`select 'Signed visit, no invoice' as kind, ${day(sql`v.signed_at`)} as day, p.patient_no as ref, coalesce(u.name, '') as detail, null::int as amount
          from visits v join patients p on p.id = v.patient_id left join users u on u.id = v.practitioner_id
          where v.status = 'signed' and ${inRange(sql`v.signed_at`, r)} and v.branch_id in ${b}
            and not exists (select 1 from invoices i where i.visit_id = v.id and i.status <> 'void')`,
        sql`select 'Lab test not billed', ${day(sql`o.created_at`)}, p.patient_no, li.name, s.price_minor
          from lab_order_items li join lab_orders o on o.id = li.order_id join lab_tests lt on lt.id = li.test_id
          join services s on s.id = lt.service_id join patients p on p.id = o.patient_id
          where o.status <> 'cancelled' and ${inRange(sql`o.created_at`, r)} and o.branch_id in ${b}
            and not exists (select 1 from invoice_lines l join invoices i on i.id = l.invoice_id
              where i.status <> 'void' and l.service_id = lt.service_id
                and (i.visit_id = o.visit_id or (i.patient_id = o.patient_id and i.created_at >= o.created_at - interval '1 day')))`,
        // Stock movements carry no patient link, so compare dispensed vs billed quantity per item over the period.
        sql`select 'Dispensed, not billed', null, it.name, (d.q - coalesce(bl.q, 0)) || ' of ' || d.q || ' ' || it.unit || ' unbilled',
            ((d.q - coalesce(bl.q, 0)) * it.sell_price_minor)::int
          from (select item_id, sum(abs(qty))::int as q from stock_movements where type = 'dispense' and ${inRange(sql`created_at`, r)} and branch_id in ${b} group by 1) d
          join items it on it.id = d.item_id
          left join (select l.item_id, sum(l.quantity)::int as q from invoice_lines l join invoices i on i.id = l.invoice_id
            where i.status <> 'void' and l.item_id is not null and ${inRange(sql`i.created_at`, r)} and i.branch_id in ${b} group by 1) bl on bl.item_id = d.item_id
          where d.q > coalesce(bl.q, 0)`,
        sql`select 'Voided invoice', ${day(sql`i.created_at`)}, i.invoice_no,
            'by ' || coalesce(vu.name, cu.name, 'unknown') || coalesce(' — ' || i.void_reason, ''), i.total_minor
          from invoices i left join users cu on cu.id = i.created_by
          left join lateral (select a.user_id from audit.log a where a.entity = 'invoice' and a.action = 'void' and a.entity_id = i.id::text order by a.at desc limit 1) va on true
          left join users vu on vu.id = va.user_id
          where i.status = 'void' and ${inRange(sql`i.created_at`, r)} and i.branch_id in ${b}`,
        sql`select 'Discounts given', null, coalesce(u.name, 'Unknown user'), count(*) || ' invoice(s)', sum(i.discount_minor)::int
          from invoices i left join users u on u.id = i.created_by
          where i.status <> 'void' and i.discount_minor > 0 and ${inRange(sql`i.created_at`, r)} and i.branch_id in ${b} group by u.name`,
      ];
      return q(t, sql`select * from (${sql.join(parts, sql` union all `)}) x order by kind, day nulls last`);
    },
  },
  diagnoses: {
    title: "Top diagnoses", group: "Clinical", description: "Most frequent diagnoses recorded in consultations.",
    cols: [{ key: "code", label: "ICD-10" }, { key: "description", label: "Diagnosis" }, { key: "cases", label: "Cases", kind: "int" }, { key: "patients", label: "Patients", kind: "int" }],
    run: (t, ctx, r) => q(t, sql`select coalesce(d.icd10_code, '') as code, min(d.description) as description, count(*)::int as cases, count(distinct d.patient_id)::int as patients
      from diagnoses d join visits v on v.id = d.visit_id where ${inRange(sql`v.started_at`, r)} and v.branch_id in ${branches(ctx)}
      group by coalesce(d.icd10_code, lower(d.description)), 1 order by 3 desc limit 50`),
  },
  messaging: {
    title: "Messaging volume & delivery", group: "Messaging", description: "Outgoing WhatsApp, SMS and email messages and delivery rate.",
    cols: [{ key: "channel", label: "Channel" }, { key: "purpose", label: "Purpose" }, { key: "total", label: "Messages", kind: "int" }, { key: "delivered", label: "Delivered", kind: "int" },
      { key: "failed", label: "Failed", kind: "int" }, { key: "skipped", label: "Skipped (no consent)", kind: "int" }, { key: "rate", label: "Delivery rate", kind: "pct" }],
    async run(t, _ctx, r) {
      const rows = await q<{ channel: string; purpose: string; total: number; delivered: number; failed: number; skipped: number }>(t, sql`select m.channel::text as channel, m.purpose,
          count(*)::int as total, count(*) filter (where m.status in ('delivered', 'read'))::int as delivered,
          count(*) filter (where m.status = 'failed')::int as failed, count(*) filter (where m.status = 'skipped')::int as skipped
        from message_log m where m.direction = 'out' and ${inRange(sql`m.created_at`, r)} group by 1, 2 order by 3 desc`);
      return rows.map((x) => ({ ...x, rate: pct(x.delivered, x.total - x.skipped) }));
    },
  },
  notifiable: {
    title: "Notifiable diseases line list", group: "Public health", patientData: true,
    description: "Diagnoses matching the clinic's notifiable ICD-10 codes or prefixes (Settings).",
    cols: [{ key: "day", label: "Date" }, { key: "patientNo", label: "Patient no." }, { key: "name", label: "Name" }, { key: "sex", label: "Sex" }, { key: "ageYears", label: "Age (y)", kind: "int" },
      { key: "phone", label: "Phone" }, { key: "address", label: "Address" }, { key: "code", label: "ICD-10" }, { key: "description", label: "Diagnosis" }, { key: "practitioner", label: "Practitioner" }],
    async run(t, ctx, r) {
      const list = ctx.tenant.notifiableIcd.map((c) => c.trim().toUpperCase()).filter(Boolean);
      if (!list.length) return [];
      return q(t, sql`select ${localDate(sql`v.started_at`, ctx)} as day, p.patient_no as "patientNo", p.first_name || ' ' || p.last_name as name, p.sex::text as sex,
          extract(year from age((v.started_at at time zone ${ctx.tenant.timezone})::date, p.dob))::int as "ageYears", p.phone, p.address,
          d.icd10_code as code, d.description, u.name as practitioner
        from diagnoses d join visits v on v.id = d.visit_id join patients p on p.id = d.patient_id left join users u on u.id = v.practitioner_id
        where ${inRange(sql`v.started_at`, r)} and v.branch_id in ${branches(ctx)}
          and exists (select 1 from unnest(array[${sql.join(list.map((c) => sql`${c}`), sql`, `)}]::text[]) as n(prefix) where upper(d.icd10_code) like n.prefix || '%')
        order by v.started_at`);
    },
  },
  hmis: {
    title: "Monthly HMIS summary", group: "Public health", defaultPreset: "lastMonth",
    description: "Outpatient attendance by age band and sex, and the top 20 diagnoses.",
    cols: [{ key: "section", label: "Section" }, { key: "label", label: "Group" }, { key: "female", label: "Female", kind: "int" },
      { key: "male", label: "Male", kind: "int" }, { key: "other", label: "Other / unknown", kind: "int" }, { key: "total", label: "Total", kind: "int" }],
    async run(t, ctx, r) {
      const tz = ctx.tenant.timezone;
      const att = await q<{ years: number | null; sex: string; n: number }>(t, sql`select extract(year from age((v.started_at at time zone ${tz})::date, p.dob))::int as years,
          p.sex::text as sex, count(*)::int as n
        from visits v join patients p on p.id = v.patient_id where ${inRange(sql`v.started_at`, r)} and v.branch_id in ${branches(ctx)} group by 1, 2`);
      const dx = await q<{ code: string; description: string; sex: string; n: number }>(t, sql`select coalesce(d.icd10_code, '') as code, min(d.description) as description,
          p.sex::text as sex, count(*)::int as n
        from diagnoses d join visits v on v.id = d.visit_id join patients p on p.id = d.patient_id
        where ${inRange(sql`v.started_at`, r)} and v.branch_id in ${branches(ctx)} group by coalesce(d.icd10_code, lower(d.description)), 1, 3`);
      type Acc = { section: string; label: string; female: number; male: number; other: number; total: number };
      const add = (m: Map<string, Acc>, section: string, label: string, sex: string, n: number) => {
        const a = m.get(label) ?? { section, label, female: 0, male: 0, other: 0, total: 0 };
        a[sex === "female" ? "female" : sex === "male" ? "male" : "other"] += n;
        a.total += n;
        m.set(label, a);
      };
      const bands = new Map<string, Acc>(AGE_BANDS.map((b) => [b, { section: "Outpatient attendance", label: b, female: 0, male: 0, other: 0, total: 0 }]));
      for (const x of att) add(bands, "Outpatient attendance", ageBand(x.years), x.sex, x.n);
      const all: Acc = { section: "Outpatient attendance", label: "All ages", female: 0, male: 0, other: 0, total: 0 };
      for (const b of bands.values()) { all.female += b.female; all.male += b.male; all.other += b.other; all.total += b.total; }
      const diag = new Map<string, Acc>();
      for (const x of dx) add(diag, "Top diagnoses", [x.code, x.description].filter(Boolean).join(" "), x.sex, x.n);
      const top = [...diag.values()].sort((a, b) => b.total - a.total).slice(0, 20);
      return [...[...bands.values()].filter((b) => b.label !== "Unknown" || b.total), all, ...top];
    },
  },
} satisfies Record<string, Report>;

export type ReportName = keyof typeof REPORTS;
export const getReport = (name: string): Report | undefined => (REPORTS as Record<string, Report>)[name];
