"use server";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { consents, messageLog, messageTemplates } from "@/db/schema";
import { formObject, run, UserError, zBool, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { queuePatientMessage, sendNow, type Channel } from "@/lib/messaging";

const PURPOSES = ["reminder", "results", "follow_up", "billing", "portal", "care", "marketing"] as const;

/** Free-text reply to an inbound message, only inside WhatsApp's 24h customer-service window. */
export async function quickReplyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("messaging.send");
    const o = z.object({ inboundId: z.string().uuid(), body: z.string().min(1).max(1000) }).parse(formObject(fd));
    const log = await tx(ctx, async (t) => {
      const [m] = await t.select().from(messageLog).where(and(eq(messageLog.id, o.inboundId), eq(messageLog.direction, "in")));
      if (!m) throw new UserError("Message not found");
      if (Date.now() - m.createdAt.getTime() > 24 * 3600_000) throw new UserError("More than 24 hours have passed. Send a template message from the Send tab instead.");
      if (m.patientId) {
        const [c] = await t.select().from(consents).where(and(eq(consents.patientId, m.patientId), eq(consents.type, "messaging"))).orderBy(desc(consents.createdAt)).limit(1);
        if (c && (!c.granted || c.revokedAt)) throw new UserError("This patient has opted out of messages.");
      }
      const [out] = await t.insert(messageLog).values({ tenantId: ctx.tenant.id, patientId: m.patientId, channel: m.channel, to: m.to, purpose: "reply", body: o.body, templateKey: "reply" }).returning();
      await audit(t, ctx, "send", "message", out.id, { patientId: m.patientId });
      return out;
    });
    try {
      const r = await sendNow({ tenantId: ctx.tenant.id, channel: log.channel as Channel, to: log.to, body: log.body });
      await tx(ctx, (t) => t.update(messageLog).set({ status: "sent", channel: r.channel, provider: r.provider, providerId: r.providerId ?? null, sentAt: new Date() }).where(eq(messageLog.id, log.id)));
    } catch (e) {
      await tx(ctx, (t) => t.update(messageLog).set({ status: "failed", error: (e as Error).message.slice(0, 500) }).where(eq(messageLog.id, log.id)));
      throw new UserError(`Could not send: ${(e as Error).message}`);
    }
    revalidatePath("/messages/inbox");
    return { ok: true, message: "Reply sent" };
  });
}

/** Ad-hoc message: a template key, or free text (custom). Goes through queuePatientMessage for consent + logging. */
export async function sendAdhocAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("messaging.send");
    const o = z.object({
      patientId: z.string().uuid(), purpose: z.enum(PURPOSES), templateKey: z.string().min(1).max(60),
      body: z.string().max(1000).optional(), channel: z.enum(["whatsapp", "sms", "email"]).optional(),
    }).parse(formObject(fd));
    const custom = o.templateKey === "custom";
    if (custom && !o.body) throw new UserError("Write the message");
    const id = await tx(ctx, async (t) => {
      const id = await queuePatientMessage(t, { tenantId: ctx.tenant.id, patientId: o.patientId, templateKey: o.templateKey, purpose: o.purpose, vars: {}, channel: o.channel });
      // Custom text: replace the (empty) rendered body before the worker can see the uncommitted row. Outside the 24h window WhatsApp falls back to SMS.
      if (id && custom) await t.update(messageLog).set({ body: o.body! }).where(eq(messageLog.id, id));
      if (id) await audit(t, ctx, "send", "message", id, { patientId: o.patientId, details: { purpose: o.purpose, templateKey: o.templateKey } });
      return id;
    });
    if (!id) throw new UserError("Not sent: the patient has opted out or has no contact details for that channel.");
    revalidatePath("/messages");
    return { ok: true, message: "Message queued" };
  });
}

export async function saveTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("settings.manage");
    const o = z.object({
      key: z.string().regex(/^[a-z_]{2,60}$/), language: z.string().regex(/^[a-z]{2,3}$/), body: z.string().min(1).max(1000),
      waTemplateName: z.string().regex(/^[a-z0-9_]+$/, "WhatsApp template names use lowercase letters, digits and _").optional(), active: zBool,
    }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.insert(messageTemplates).values({ tenantId: ctx.tenant.id, key: o.key, language: o.language, body: o.body, waTemplateName: o.waTemplateName ?? null, active: o.active })
        .onConflictDoUpdate({ target: [messageTemplates.tenantId, messageTemplates.key, messageTemplates.language], set: { body: o.body, waTemplateName: o.waTemplateName ?? null, active: o.active } });
      await audit(t, ctx, "update", "message_template", null, { details: { key: o.key, language: o.language } });
    });
    revalidatePath("/messages/templates");
    return { ok: true, message: "Template saved" };
  });
}
