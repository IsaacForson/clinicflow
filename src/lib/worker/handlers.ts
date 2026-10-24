import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { adminDb, withTenant } from "@/db";
import { appointments, messageLog, messageTemplates, patients, tenants, users, webhookDeliveries, webhooks } from "@/db/schema";
import { buildTenantExport } from "@/lib/export";
import { dateOnly, timeOnly } from "@/lib/format";
import type { JobType } from "@/lib/jobs";
import { DEFAULT_TEMPLATES, queuePatientMessage, sendNow, type Channel } from "@/lib/messaging";
import { assertPublicUrl } from "@/lib/net";
import { billingSweep, dailyTenant } from "./daily";
import { MAX_ATTEMPTS, type Handler, type Job } from "./runner";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Recovers WhatsApp template parameters from the rendered body by matching it against the template's {{placeholders}}. */
export function extractParams(tpl: string, rendered: string): string[] {
  const parts = tpl.split(/\{\{\w+\}\}/);
  if (parts.length === 1) return [];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // shortcut: two adjacent placeholders ({{time}}{{with}}) are ambiguous; assume the first is one word. Upgrade by storing params in the job payload at queue time.
  const re = parts.map((p, i) => esc(p) + (i < parts.length - 1 ? (parts[i + 1] === "" && i + 1 < parts.length - 1 ? "(\\S*)" : "([\\s\\S]*?)") : "")).join("");
  const m = new RegExp("^" + re + "$").exec(rendered);
  return m ? m.slice(1).map((v) => v.trim() || "-") : []; // Meta rejects empty parameters
}

const messageSend: Handler = async (job) => {
  const db = adminDb();
  const [m] = await db.select().from(messageLog).where(and(eq(messageLog.id, str(job.payload.messageId)), eq(messageLog.tenantId, job.tenantId!)));
  if (!m || m.status !== "queued") return;
  let waTemplate: { name: string; language: string; params: string[] } | undefined;
  const waName = str(job.payload.waTemplate);
  if (waName && m.channel === "whatsapp") {
    const [p] = m.patientId ? await db.select({ language: patients.language }).from(patients).where(eq(patients.id, m.patientId)) : [];
    const language = p?.language ?? "en";
    const [tpl] = await db.select().from(messageTemplates)
      .where(and(eq(messageTemplates.tenantId, m.tenantId), eq(messageTemplates.key, m.templateKey ?? ""), eq(messageTemplates.language, language)));
    const queued = job.payload.waParams;
    waTemplate = { name: waName, language, params: Array.isArray(queued) ? queued.map(String) : extractParams(tpl?.body ?? DEFAULT_TEMPLATES[m.templateKey ?? ""] ?? "", m.body) };
  }
  try {
    const r = await sendNow({ tenantId: m.tenantId, channel: m.channel as Channel, to: m.to, body: m.body, waTemplate });
    await db.update(messageLog).set({ status: "sent", channel: r.channel, provider: r.provider, providerId: r.providerId ?? null, sentAt: new Date(), error: null }).where(eq(messageLog.id, m.id));
  } catch (e) {
    const last = job.attempts >= MAX_ATTEMPTS;
    await db.update(messageLog).set({ status: last ? "failed" : "queued", error: (e as Error).message.slice(0, 500) }).where(eq(messageLog.id, m.id));
    throw e;
  }
};

const appointmentRemind: Handler = async (job) => {
  const tenantId = job.tenantId!;
  const db = adminDb();
  const [row] = await db.select({ a: appointments, tz: tenants.timezone, doctor: users.name, title: users.title })
    .from(appointments).innerJoin(tenants, eq(tenants.id, appointments.tenantId)).leftJoin(users, eq(users.id, appointments.practitionerId))
    .where(and(eq(appointments.id, str(job.payload.appointmentId)), eq(appointments.tenantId, tenantId)));
  if (!row) return;
  const { a, tz } = row;
  if (a.status !== "scheduled" && a.status !== "confirmed") return;
  if (job.payload.startsAt && a.startsAt.toISOString() !== new Date(str(job.payload.startsAt)).toISOString()) return; // rescheduled: a fresh job exists
  await withTenant(tenantId, (t) => queuePatientMessage(t, {
    tenantId, patientId: a.patientId, templateKey: "appointment_reminder", purpose: "reminder",
    vars: { date: dateOnly(a.startsAt, tz), time: timeOnly(a.startsAt, tz), with: row.doctor ? ` with ${[row.title, row.doctor].filter(Boolean).join(" ")}` : "" },
    dedupeKey: `remindmsg:${job.id}`,
  }));
};

export const signBody = (body: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

const webhookDeliver: Handler = async (job) => {
  const db = adminDb();
  const [row] = await db.select({ d: webhookDeliveries, h: webhooks }).from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhookDeliveries.id, str(job.payload.deliveryId)), eq(webhookDeliveries.tenantId, job.tenantId!)));
  if (!row || row.d.status === "delivered") return;
  if (!row.h.active) {
    await db.update(webhookDeliveries).set({ status: "skipped" }).where(eq(webhookDeliveries.id, row.d.id));
    return;
  }
  const body = JSON.stringify(row.d.payload);
  let code: number | null = null;
  let err: Error | null = null;
  try {
    await assertPublicUrl(row.h.url);
    const res = await fetch(row.h.url, {
      method: "POST", body, signal: AbortSignal.timeout(10_000), redirect: "manual",
      headers: { "Content-Type": "application/json", "User-Agent": "ClinicFlow-Webhooks/1", "X-ClinicFlow-Event": row.d.event, "X-ClinicFlow-Delivery": row.d.id, "X-ClinicFlow-Signature": signBody(body, row.h.secret) },
    });
    code = res.status;
    if (!res.ok) err = new Error(`Webhook responded ${res.status}`);
  } catch (e) {
    err = e as Error;
  }
  const status = !err ? "delivered" : job.attempts >= MAX_ATTEMPTS ? "failed" : "retrying";
  await db.update(webhookDeliveries).set({ status, responseCode: code, attempts: job.attempts }).where(eq(webhookDeliveries.id, row.d.id));
  if (err) throw err;
};

const exportRun: Handler = async (job) => {
  await buildTenantExport(job.tenantId!, str(job.payload.exportJobId));
};

export const HANDLERS: Record<JobType, (job: Job) => Promise<void>> = {
  "message.send": messageSend,
  "appointment.remind": appointmentRemind,
  "webhook.deliver": webhookDeliver,
  "export.run": exportRun,
  "daily.tenant": (job) => dailyTenant(job.tenantId!),
  "billing.sweep": () => billingSweep(),
};
