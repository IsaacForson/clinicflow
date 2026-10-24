// Pure helpers for the clinic admin console (no DB, unit-tested).
import { addDays, dayRange, localDay } from "@/lib/format";
import { daysBetween } from "../reports/range";

export const PERIODS = { month: "This month", last_month: "Last month", "90d": "Last 90 days", ytd: "Year to date" } as const;
export type PeriodKey = keyof typeof PERIODS;

export type Period = {
  key: PeriodKey; label: string; vs: string; days: number;
  from: string; to: string; start: Date; end: Date;
  prevFrom: string; prevTo: string; prevStart: Date; prevEnd: Date;
};

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const lastOfMonth = (day: string) => addDays(nextMonth(monthStart(day)), -1);
function nextMonth(first: string) {
  const [y, m] = first.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
const prevMonth = (first: string) => monthStart(addDays(first, -1));
/** Same day-of-month in another month, clamped to its last day (Mar 31 -> Feb 28). */
const sameDayIn = (first: string, day: string) => {
  const last = lastOfMonth(first);
  const d = `${first.slice(0, 8)}${day.slice(8)}`;
  return d > last || Number.isNaN(Date.parse(d)) ? last : d;
};

/**
 * Resolves ?period= into local days and UTC [start, end) instants, plus the previous comparable period:
 * month-to-date vs the same days last month, a full month vs the month before, 90 days vs the 90 before, YTD vs the same span last year.
 */
export function resolvePeriod(raw: unknown, tz: string, now = new Date()): Period {
  const key: PeriodKey = typeof raw === "string" && raw in PERIODS ? (raw as PeriodKey) : "month";
  const today = localDay(tz, now);
  let from: string, to: string, prevFrom: string, prevTo: string, vs: string;
  switch (key) {
    case "month": {
      from = monthStart(today); to = today;
      prevFrom = prevMonth(from); prevTo = sameDayIn(prevFrom, today); vs = "vs same days last month";
      break;
    }
    case "last_month": {
      from = prevMonth(monthStart(today)); to = lastOfMonth(from);
      prevFrom = prevMonth(from); prevTo = lastOfMonth(prevFrom); vs = "vs month before";
      break;
    }
    case "90d": {
      from = addDays(today, -89); to = today;
      prevFrom = addDays(today, -179); prevTo = addDays(today, -90); vs = "vs previous 90 days";
      break;
    }
    case "ytd": {
      from = `${today.slice(0, 4)}-01-01`; to = today;
      const y = String(Number(today.slice(0, 4)) - 1);
      prevFrom = `${y}-01-01`; prevTo = sameDayIn(`${y}-${today.slice(5, 7)}-01`, today); vs = "vs same period last year";
      break;
    }
  }
  return {
    key, label: PERIODS[key], vs, days: daysBetween(from, to).length,
    from, to, start: dayRange(from, tz).start, end: dayRange(to, tz).end,
    prevFrom, prevTo, prevStart: dayRange(prevFrom, tz).start, prevEnd: dayRange(prevTo, tz).end,
  };
}

/** The 12 months (YYYY-MM) ending with the month of `to`, and the local first day of the oldest and the month after the newest. */
export function trendMonths(to: string) {
  const months: string[] = [];
  for (let m = monthStart(to); months.length < 12; m = prevMonth(m)) months.unshift(m.slice(0, 7));
  return { months, from: `${months[0]}-01`, until: nextMonth(monthStart(to)) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

/** "+12% vs …" badge for a KPI; undefined when there is nothing to compare against. */
export function delta(cur: number, prev: number, vs: string, lowerIsBetter = false): { value: string; good: boolean } | undefined {
  if (!prev) return undefined;
  const change = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return { value: `${change > 0 ? "+" : ""}${change}% ${vs}`, good: lowerIsBetter ? change <= 0 : change >= 0 };
}

/** Change in percentage points for rates (e.g. collection rate 82% -> 85% = "+3 pts"). */
export function deltaPts(cur: number, prev: number, vs: string, lowerIsBetter = false): { value: string; good: boolean } | undefined {
  if (!prev && !cur) return undefined;
  const d = Math.round((cur - prev) * 10) / 10;
  return { value: `${d > 0 ? "+" : ""}${d} pts ${vs}`, good: lowerIsBetter ? d <= 0 : d >= 0 };
}

/** The selected branch if the user may see it, else null (= all their branches). */
export const pickBranch = (raw: unknown, allowed: string[]) => (typeof raw === "string" && allowed.includes(raw) ? raw : null);

/** Query string with some keys replaced (empty values dropped). */
export function withQuery(base: string, cur: Record<string, string | null | undefined>, patch: Record<string, string | null | undefined> = {}) {
  const q = new URLSearchParams(Object.entries({ ...cur, ...patch }).filter((e): e is [string, string] => !!e[1]));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

// ---------- Activity feed ----------
export const ACTIVITY_TYPES = {
  patients: "New patients", clinical: "Signed notes", payments: "Payments", refunds: "Refunds", voids: "Voids",
  discounts: "Discounts", writeoffs: "Insurer write-offs", logins: "Sign-ins", exports: "Exports", settings: "Setting changes", support: "Support access",
} as const;
export type ActivityType = keyof typeof ACTIVITY_TYPES;

export type ActivityRow = {
  action: string; entity: string; details: unknown; userName: string | null; patientNo: string | null;
};

const ENTITY_LABEL: Record<string, string> = {
  tenant: "clinic settings", branch: "a branch", service: "a service", user: "a staff account", message_template: "a message template",
  integration: "an integration", webhook: "a webhook", insurer: "an insurer", insurer_tariff: "an insurer tariff", api_key: "an API key",
  patient: "a patient record", visit: "a consultation", invoice: "an invoice", payment: "a payment", report: "a report", claim: "a claim",
  accounting: "accounting data", export_job: "a data export", prescription: "a prescription", lab_order: "a lab order", appointment: "an appointment",
  document: "a document", message_log: "the message log", message_inbox: "the message inbox", clinic_admin: "the admin console",
};
const VERB: Record<string, string> = {
  view: "viewed", create: "created", update: "updated", delete: "deleted", revoke: "revoked", export: "exported", download: "downloaded",
  request: "requested", print: "printed", send: "sent", reset_password: "reset the password of", search: "searched",
};
const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

/** Plain-English sentence for an audit entry. `fmt` formats minor-unit money. */
export function describeActivity(r: ActivityRow, fmt: (minor: number) => string): { text: string; type: ActivityType | null } {
  const d = (r.details ?? {}) as Record<string, unknown>;
  const who = r.userName ?? "Someone";
  const pt = r.patientNo ? ` for ${r.patientNo}` : "";
  const amount = (k = "amountMinor") => (n(d[k]) !== null ? ` ${fmt(n(d[k])!)}` : "");
  const thing = ENTITY_LABEL[r.entity] ?? r.entity.replace(/_/g, " ");
  if (d.impersonatedBy) return { text: `ClinicFlow support ${VERB[r.action] ?? r.action.replace(/_/g, " ")} ${thing}${pt}`, type: "support" };
  const key = `${r.action}:${r.entity}`;
  switch (key) {
    case "create:patient": return { text: `${who} registered patient ${r.patientNo ?? ""}`.trim(), type: "patients" };
    case "sign:visit": return { text: `${who} signed a consultation note${pt}`, type: "clinical" };
    case "addendum:visit": return { text: `${who} added an addendum to a signed note${pt}`, type: "clinical" };
    case "payment:invoice": return { text: `${who} received${amount() || " a payment"}${d.method ? ` by ${String(d.method).replace(/_/g, " ")}` : ""}${pt}`, type: "payments" };
    case "create:payment": return { text: `${who} recorded an offline payment${pt}`, type: "payments" };
    case "deposit:payment": return { text: `${who} took a deposit${amount() && ` of${amount()}`}${pt}`, type: "payments" };
    case "refund:payment": return { text: `${who} refunded${amount()}${pt}${d.reason ? ` — ${String(d.reason)}` : ""}`, type: "refunds" };
    case "void:invoice": return { text: `${who} voided an invoice${pt}${d.reason ? ` — ${String(d.reason)}` : ""}`, type: "voids" };
    case "discount:invoice": return { text: `${who} gave a discount${amount("discountMinor") && ` of${amount("discountMinor")}`}${pt}`, type: "discounts" };
    case "insurer_writeoff:invoice": return { text: `${who} wrote off${amount()} of an insurer balance${pt}`, type: "writeoffs" };
    case "insurer_shortfall:invoice": return { text: `${who} moved${amount()} of an unpaid insurer share to the patient${pt}`, type: "writeoffs" };
    case "login:user": return { text: `${who} signed in${d.mfa ? " with 2-step verification" : ""}`, type: "logins" };
  }
  if (["export", "download"].includes(r.action) || key === "request:export_job") return { text: `${who} ${VERB[r.action]} ${thing}`, type: "exports" };
  if (SETTING_ENTITIES.includes(r.entity)) return { text: `${who} ${VERB[r.action] ?? r.action.replace(/_/g, " ")} ${thing}`, type: "settings" };
  return { text: `${who} ${VERB[r.action] ?? r.action.replace(/_/g, " ")} ${thing}${pt}`, type: null };
}

/** Entities whose changes count as "setting changes". Shared with the SQL filter. */
export const SETTING_ENTITIES = ["tenant", "branch", "service", "user", "message_template", "integration", "webhook", "insurer", "insurer_tariff", "api_key"];
