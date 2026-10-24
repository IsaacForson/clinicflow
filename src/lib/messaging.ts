import { and, desc, eq } from "drizzle-orm";
import { adminDb, type Tx } from "@/db";
import { consents, integrations, jobs, messageLog, messageTemplates, patients, tenants } from "@/db/schema";
import { e164 } from "./format";

export type Channel = "whatsapp" | "sms" | "email";
type SendResult = { provider: string; providerId?: string };

/** Per-tenant credentials from the integrations table, falling back to platform env. */
async function providerConfig(tenantId: string | null, provider: string): Promise<Record<string, string> | null> {
  if (tenantId) {
    const [row] = await adminDb().select().from(integrations)
      .where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, provider), eq(integrations.active, true))).limit(1);
    if (row) return JSON.parse(row.config);
  }
  const env = process.env;
  switch (provider) {
    case "whatsapp": return env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? { token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID } : null;
    case "twilio": return env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN ? { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM ?? "" } : null;
    case "africastalking": return env.AFRICASTALKING_API_KEY ? { username: env.AFRICASTALKING_USERNAME ?? "sandbox", apiKey: env.AFRICASTALKING_API_KEY, from: env.AFRICASTALKING_FROM ?? "" } : null;
    case "resend": return env.RESEND_API_KEY ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM ?? "" } : null;
  }
  return null;
}

async function whatsapp(cfg: Record<string, string>, to: string, body: string, template?: { name: string; language: string; params: string[] }): Promise<SendResult> {
  // Outside the 24h service window Meta requires a pre-approved template; free text is used inside it.
  const payload = template
    ? { messaging_product: "whatsapp", to: to.replace("+", ""), type: "template", template: { name: template.name, language: { code: template.language }, components: [{ type: "body", parameters: template.params.map((text) => ({ type: "text", text })) }] } }
    : { messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body, preview_url: true } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneNumberId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`WhatsApp: ${json?.error?.message ?? res.status}`);
  return { provider: "whatsapp", providerId: json.messages?.[0]?.id };
}

async function sms(tenantId: string | null, to: string, body: string): Promise<SendResult> {
  const at = await providerConfig(tenantId, "africastalking");
  if (at) {
    const form = new URLSearchParams({ username: at.username, to, message: body, ...(at.from ? { from: at.from } : {}) });
    const host = at.username === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const res = await fetch(`https://${host}/version1/messaging`, { method: "POST", headers: { apiKey: at.apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    const json = await res.json();
    const r = json?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !r || r.statusCode >= 400) throw new Error(`Africa's Talking: ${r?.status ?? json?.SMSMessageData?.Message ?? res.status}`);
    return { provider: "africastalking", providerId: r.messageId };
  }
  const tw = await providerConfig(tenantId, "twilio");
  if (tw) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${tw.sid}/Messages.json`, {
      method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${tw.sid}:${tw.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: tw.from, Body: body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`Twilio: ${json?.message ?? res.status}`);
    return { provider: "twilio", providerId: json.sid };
  }
  return devLog("sms", to, body);
}

async function email(tenantId: string | null, to: string, subject: string, body: string): Promise<SendResult> {
  const cfg = await providerConfig(tenantId, "resend");
  if (!cfg) return devLog("email", to, `${subject}\n${body}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to, subject, text: body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Resend: ${json?.message ?? res.status}`);
  return { provider: "resend", providerId: json.id };
}

function devLog(channel: string, to: string, body: string): SendResult {
  if (process.env.NODE_ENV === "production") throw new Error(`No ${channel} provider configured`);
  console.log(`\n[dev ${channel} → ${to}]\n${body}\n`);
  return { provider: "dev-log" };
}

/** Send immediately. WhatsApp falls back to SMS when not configured or when it fails. */
export async function sendNow(opts: { tenantId: string | null; channel: Channel; to: string; body: string; subject?: string; waTemplate?: { name: string; language: string; params: string[] } }): Promise<SendResult & { channel: Channel }> {
  const { tenantId, channel, to, body } = opts;
  if (channel === "email") return { ...(await email(tenantId, to, opts.subject ?? "Message from your clinic", body)), channel };
  if (channel === "whatsapp") {
    const cfg = await providerConfig(tenantId, "whatsapp");
    if (cfg) {
      try {
        return { ...(await whatsapp(cfg, to, body, opts.waTemplate)), channel };
      } catch (e) {
        console.warn("WhatsApp failed, falling back to SMS:", (e as Error).message);
      }
    }
  }
  return { ...(await sms(tenantId, to, body)), channel: "sms" };
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  appointment_reminder: "Hello {{name}}, this is a reminder of your appointment at {{clinic}} on {{date}} at {{time}}{{with}}. Reply 1 to confirm, 2 to reschedule. Reply STOP to opt out.",
  appointment_booked: "Hello {{name}}, your appointment at {{clinic}} is booked for {{date}} at {{time}}{{with}}.",
  results_ready: "Hello {{name}}, your test results are ready at {{clinic}}. {{link}}",
  follow_up: "Hello {{name}}, {{clinic}} is checking in after your visit. Your follow-up is due on {{date}}. Reply 1 to book.",
  invoice: "Hello {{name}}, your bill at {{clinic}} is {{amount}}. Balance due: {{balance}}. {{link}}",
  receipt: "Thank you {{name}}. {{clinic}} received {{amount}} ({{method}}). Receipt {{receipt}}.",
  intake: "Hello {{name}}, please complete your registration form for {{clinic}} before your visit: {{link}}",
  portal_link: "Hello {{name}}, here is your secure {{clinic}} patient portal link (valid 7 days): {{link}}",
  schedule_due: "Hello {{name}}, {{item}} is due on {{date}} at {{clinic}}. Reply 1 to book.",
  care_check: "Hello {{name}}, it's time for your {{condition}} check-up at {{clinic}}. Reply 1 to book or send your latest reading, e.g. BP 130/85 or SUGAR 6.2.",
  med_nudge: "Hi {{name}}, a reminder from {{clinic}} to take your medication today. Reply TAKEN when done.",
  telehealth: "Hello {{name}}, your video consultation with {{clinic}} is on {{date}} at {{time}}. Join here: {{link}}",
  payment_link: "Hello {{name}}, pay {{amount}} to {{clinic}} securely here: {{link}}",
};

export const render = (tpl: string, vars: Record<string, string | number | null | undefined>) =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));

const PURPOSE_CONSENT: Record<string, string | null> = {
  reminder: "messaging", results: "messaging", follow_up: "messaging", billing: null, portal: "messaging", care: "messaging", marketing: "messaging",
};

/**
 * Queue a templated message to a patient. Checks messaging consent (opt-out wins), renders the tenant's
 * template, logs purpose+consent, and schedules delivery via the jobs table. Returns null if skipped.
 */
export async function queuePatientMessage(t: Tx, o: {
  tenantId: string; patientId: string; templateKey: string; purpose: string; vars: Record<string, string | number | null | undefined>;
  runAt?: Date; dedupeKey?: string; channel?: Channel;
}) {
  const [p] = await t.select().from(patients).where(eq(patients.id, o.patientId)).limit(1);
  const [tenant] = await t.select().from(tenants).where(eq(tenants.id, o.tenantId)).limit(1);
  if (!p || !tenant) return null;
  const channel = o.channel ?? p.preferredChannel;
  const to = channel === "email" ? p.email : e164(p.phone, tenant.country);
  const consentType = PURPOSE_CONSENT[o.purpose] ?? null;
  let consentId: string | null = null;
  if (consentType) {
    const [latest] = await t.select().from(consents)
      .where(and(eq(consents.patientId, p.id), eq(consents.type, consentType)))
      .orderBy(desc(consents.createdAt)).limit(1);
    if (latest && (!latest.granted || latest.revokedAt)) return null; // opted out
    consentId = latest?.id ?? null;
  }
  const [tpl] = await t.select().from(messageTemplates)
    .where(and(eq(messageTemplates.key, o.templateKey), eq(messageTemplates.language, p.language), eq(messageTemplates.active, true))).limit(1);
  const tplBody = tpl?.body ?? DEFAULT_TEMPLATES[o.templateKey] ?? "";
  const vars = { name: p.firstName, clinic: tenant.name, ...o.vars };
  const body = render(tplBody, vars);
  // WhatsApp template parameters in placeholder order (Meta rejects empty parameters).
  const waParams = [...tplBody.matchAll(/\{\{(\w+)\}\}/g)].map((m) => String(vars[m[1] as keyof typeof vars] ?? "").trim() || "-");
  const [log] = await t.insert(messageLog).values({
    tenantId: o.tenantId, patientId: p.id, channel, to: to ?? "", templateKey: o.templateKey, purpose: o.purpose, body,
    status: to ? "queued" : "skipped", error: to ? null : "No contact on file", consentId,
  }).returning({ id: messageLog.id });
  if (!to) return null;
  await t.insert(jobs).values({
    tenantId: o.tenantId, type: "message.send", payload: { messageId: log.id, waTemplate: tpl?.waTemplateName ?? null, waParams },
    runAt: o.runAt ?? new Date(), dedupeKey: o.dedupeKey,
  }).onConflictDoNothing();
  return log.id;
}
