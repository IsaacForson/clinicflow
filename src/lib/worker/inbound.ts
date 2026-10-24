import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { adminDb, withTenant, type Tx } from "@/db";
import { appointments, carePlans, consents, messageLog, patients, tenants, vitals } from "@/db/schema";
import { dateOnly, timeOnly } from "@/lib/format";
import { sendNow, type Channel } from "@/lib/messaging";
import { createPortalLink } from "@/lib/portal";

export type Command =
  | { kind: "confirm" } | { kind: "reschedule" } | { kind: "stop" } | { kind: "start" } | { kind: "taken" } | { kind: "portal" }
  | { kind: "bp"; sys: number; dia: number } | { kind: "sugar"; value: number } | { kind: "unknown" };

/** Parses a patient's reply. Anything unrecognised is left for the clinic inbox. */
export function parseCommand(raw: string): Command {
  const s = raw.trim().toUpperCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  if (["1", "YES", "Y", "CONFIRM", "CONFIRMED"].includes(s)) return { kind: "confirm" };
  if (["2", "RESCHEDULE", "CHANGE"].includes(s)) return { kind: "reschedule" };
  if (["STOP", "UNSUBSCRIBE", "STOP ALL", "OPT OUT"].includes(s)) return { kind: "stop" };
  if (["START", "SUBSCRIBE", "UNSTOP"].includes(s)) return { kind: "start" };
  if (["TAKEN", "DONE", "TOOK"].includes(s)) return { kind: "taken" };
  if (["BOOK", "PORTAL", "LINK"].includes(s)) return { kind: "portal" };
  const bp = /^BP:? ?(\d{2,3}) ?[/\\ ] ?(\d{2,3})$/.exec(s);
  if (bp) {
    const sys = +bp[1], dia = +bp[2];
    if (sys >= 60 && sys <= 300 && dia >= 30 && dia <= 200 && sys > dia) return { kind: "bp", sys, dia };
  }
  const sugar = /^(?:SUGAR|GLUCOSE|BS|FBS|RBS):? ?(\d{1,2}(?:[.,]\d{1,2})?)$/.exec(s);
  if (sugar) {
    const value = Number(sugar[1].replace(",", "."));
    if (value >= 1 && value <= 40) return { kind: "sugar", value };
  }
  return { kind: "unknown" };
}

const PURPOSE: Record<Command["kind"], string> = {
  confirm: "reminder", reschedule: "reminder", stop: "consent", start: "consent", taken: "care", portal: "portal", bp: "care", sugar: "care", unknown: "inbound",
};

/** Normalises a provider sender id to E.164 (WhatsApp sends digits without "+"). */
export const senderE164 = (from: string) => "+" + from.replace(/\D/g, "").replace(/^00/, "");

/** Finds the patient by phone across tenants; with several clinics, the one that messaged this number most recently wins. */
export async function identifySender(phone: string) {
  const db = adminDb();
  const matches = await db.select({ id: patients.id, tenantId: patients.tenantId }).from(patients)
    .where(and(or(eq(patients.phone, phone), eq(patients.altPhone, phone)), isNull(patients.deletedAt), isNull(patients.mergedIntoId)))
    .orderBy(desc(patients.createdAt)).limit(50);
  if (!matches.length) return null;
  const [last] = await db.select({ tenantId: messageLog.tenantId, patientId: messageLog.patientId }).from(messageLog)
    .where(and(eq(messageLog.to, phone), eq(messageLog.direction, "out"), inArray(messageLog.tenantId, [...new Set(matches.map((m) => m.tenantId))])))
    .orderBy(desc(messageLog.createdAt)).limit(1);
  if (!last) return matches[0];
  return matches.find((m) => m.id === last.patientId) ?? matches.find((m) => m.tenantId === last.tenantId)!;
}

async function reply(t: Tx, o: { tenantId: string; patientId: string; channel: Channel; to: string; body: string; purpose: string }) {
  const [log] = await t.insert(messageLog).values({ tenantId: o.tenantId, patientId: o.patientId, channel: o.channel, to: o.to, purpose: o.purpose, body: o.body, templateKey: "auto_reply" }).returning({ id: messageLog.id });
  try {
    // Inside WhatsApp's 24h service window (the patient just wrote), free text is allowed.
    const r = await sendNow({ tenantId: o.tenantId, channel: o.channel, to: o.to, body: o.body });
    await t.update(messageLog).set({ status: "sent", channel: r.channel, provider: r.provider, providerId: r.providerId ?? null, sentAt: new Date() }).where(eq(messageLog.id, log.id));
  } catch (e) {
    await t.update(messageLog).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(messageLog.id, log.id));
  }
}

/** Handles one inbound WhatsApp/SMS message: logs it, then acts on recognised commands. Returns what happened. */
export async function handleInbound(o: { channel: Channel; from: string; text: string; provider: string; providerId?: string | null }) {
  const phone = senderE164(o.from);
  const who = await identifySender(phone);
  if (!who) return { status: "unknown_sender" as const };
  const { tenantId, id: patientId } = who;
  if (o.providerId) {
    const [seen] = await adminDb().select({ id: messageLog.id }).from(messageLog).where(and(eq(messageLog.providerId, o.providerId), eq(messageLog.direction, "in"))).limit(1);
    if (seen) return { status: "duplicate" as const }; // providers retry webhooks
  }
  const cmd = parseCommand(o.text);
  return withTenant(tenantId, async (t) => {
    const [tenant] = await t.select().from(tenants).where(eq(tenants.id, tenantId));
    const tz = tenant.timezone;
    await t.insert(messageLog).values({
      tenantId, patientId, channel: o.channel, to: phone, purpose: PURPOSE[cmd.kind], body: o.text.slice(0, 4000), status: "delivered",
      provider: o.provider, providerId: o.providerId ?? null, direction: "in", templateKey: cmd.kind === "unknown" ? null : `cmd:${cmd.kind}`, sentAt: new Date(),
    });
    const send = (body: string) => reply(t, { tenantId, patientId, channel: o.channel, to: phone, body, purpose: PURPOSE[cmd.kind] });
    switch (cmd.kind) {
      case "confirm": {
        const [a] = await t.select().from(appointments)
          .where(and(eq(appointments.patientId, patientId), inArray(appointments.status, ["scheduled", "confirmed"]), gt(appointments.startsAt, new Date())))
          .orderBy(asc(appointments.startsAt)).limit(1);
        if (!a) { await send(`We couldn't find an upcoming appointment at ${tenant.name}. Reply BOOK for a booking link.`); break; }
        if (a.status === "scheduled") await t.update(appointments).set({ status: "confirmed" }).where(eq(appointments.id, a.id));
        await send(`Thank you. Your appointment at ${tenant.name} on ${dateOnly(a.startsAt, tz)} at ${timeOnly(a.startsAt, tz)} is confirmed.`);
        break;
      }
      case "reschedule":
        await send(`To choose a new time, open your ${tenant.name} portal: ${await createPortalLink(t, tenantId, patientId)}`);
        break;
      case "portal":
        await send(`Your secure ${tenant.name} portal (valid 7 days): ${await createPortalLink(t, tenantId, patientId)}`);
        break;
      case "stop":
      case "start": {
        const granted = cmd.kind === "start";
        await t.insert(consents).values({ tenantId, patientId, type: "messaging", granted, method: o.channel === "whatsapp" ? "whatsapp" : "sms" });
        await send(granted ? `You're subscribed to messages from ${tenant.name} again. Reply STOP to opt out.` : `You've been unsubscribed from ${tenant.name} messages. Reply START to subscribe again.`);
        break;
      }
      case "bp":
      case "sugar": {
        await t.insert(vitals).values({ tenantId, patientId, source: "patient", ...(cmd.kind === "bp" ? { bpSys: cmd.sys, bpDia: cmd.dia } : { glucose: cmd.value }) });
        const [plan] = await t.select().from(carePlans).where(and(eq(carePlans.patientId, patientId), eq(carePlans.active, true))).orderBy(desc(carePlans.createdAt)).limit(1);
        const tg = plan?.targets ?? {};
        const out = cmd.kind === "bp" ? (tg.bpSys != null && cmd.sys > tg.bpSys) || (tg.bpDia != null && cmd.dia > tg.bpDia) : tg.glucose != null && cmd.value > tg.glucose;
        const label = cmd.kind === "bp" ? `BP ${cmd.sys}/${cmd.dia}` : `sugar ${cmd.value}`;
        await send(`Thank you, we've recorded your ${label}.${out ? " Your clinic will review this reading." : ""}`);
        break;
      }
      case "taken":
        await send("Thank you, noted. Keep it up!");
        break;
    }
    return { status: "ok" as const, tenantId, patientId, command: cmd.kind };
  });
}
