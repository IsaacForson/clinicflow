import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { enqueue } from "./jobs";

export const WEBHOOK_EVENTS = [
  "patient.created", "patient.updated", "appointment.created", "appointment.updated", "visit.signed",
  "invoice.issued", "payment.received", "lab.resulted", "queue.updated",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Fan an event out to the tenant's subscribed webhooks (delivered async by the worker). */
export async function emit(t: Tx, tenantId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const hooks = await t.select({ id: webhooks.id }).from(webhooks)
    .where(and(eq(webhooks.tenantId, tenantId), eq(webhooks.active, true), sql`${event} = any(${webhooks.events})`));
  for (const h of hooks) {
    const [d] = await t.insert(webhookDeliveries).values({ tenantId, webhookId: h.id, event, payload: { event, data, createdAt: new Date().toISOString() } }).returning({ id: webhookDeliveries.id });
    await enqueue(t, tenantId, "webhook.deliver", { deliveryId: d.id });
  }
}
