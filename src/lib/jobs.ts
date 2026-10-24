import type { Tx } from "@/db";
import { jobs } from "@/db/schema";

/**
 * Job types processed by scripts/worker.mts (and /api/cron/tick). Payload shapes:
 *  message.send        { messageId, waTemplate? }        deliver a queued message_log row
 *  appointment.remind  { appointmentId, hours }          render + queue reminder if still scheduled
 *  webhook.deliver     { deliveryId }                    POST an outgoing webhook
 *  export.run          { exportJobId }                   build a full tenant export zip/json
 *  daily.tenant        {}                                per-tenant daily sweep: follow-ups, schedules, care plans, low stock
 *  billing.sweep       {}                                platform-wide: trial/subscription status
 */
export type JobType = "message.send" | "appointment.remind" | "webhook.deliver" | "export.run" | "daily.tenant" | "billing.sweep";

export async function enqueue(t: Tx, tenantId: string | null, type: JobType, payload: Record<string, unknown> = {}, opts: { runAt?: Date; dedupeKey?: string } = {}) {
  await t.insert(jobs).values({ tenantId, type, payload, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey }).onConflictDoNothing();
}
