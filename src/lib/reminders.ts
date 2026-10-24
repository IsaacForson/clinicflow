import type { Tx } from "@/db";
import type { Tenant } from "@/db/schema";
import { enqueue } from "./jobs";

/** Event-driven reminders: one job per configured offset (default T-24h and T-2h). Re-scheduling creates fresh jobs; stale ones no-op. */
export async function scheduleAppointmentReminders(t: Tx, tenant: Pick<Tenant, "id" | "reminderHours">, appt: { id: string; startsAt: Date }) {
  const now = Date.now();
  for (const hours of tenant.reminderHours) {
    const runAt = new Date(appt.startsAt.getTime() - hours * 3600_000);
    if (runAt.getTime() <= now) continue;
    await enqueue(t, tenant.id, "appointment.remind", { appointmentId: appt.id, hours, startsAt: appt.startsAt.toISOString() },
      { runAt, dedupeKey: `remind:${appt.id}:${hours}:${appt.startsAt.getTime()}` });
  }
}
