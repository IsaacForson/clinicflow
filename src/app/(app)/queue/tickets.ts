import "server-only";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { queueTickets } from "@/db/schema";
import { UserError } from "@/lib/action";
import { audit, type Ctx } from "@/lib/auth";
import { emit } from "@/lib/events";
import { localDay } from "@/lib/format";
import { isUniqueViolation } from "./lib";

/**
 * Adds a patient to today's queue at the current branch. Ticket number = max+1 for branch/local day;
 * a concurrent insert hitting the unique index is retried inside a savepoint.
 */
export async function createTicket(t: Tx, ctx: Ctx, o: {
  patientId: string; appointmentId?: string | null; practitionerId?: string | null; priority?: number; note?: string | null;
}) {
  const day = localDay(ctx.tenant.timezone);
  const [active] = await t.select({ ticketNo: queueTickets.ticketNo }).from(queueTickets).where(and(
    eq(queueTickets.patientId, o.patientId), eq(queueTickets.branchId, ctx.branchId), eq(queueTickets.day, day),
    notInArray(queueTickets.status, ["done", "left"]),
  )).limit(1);
  if (active) throw new UserError(`This patient is already in today's queue (ticket ${active.ticketNo}).`);
  for (let attempt = 1; ; attempt++) {
    try {
      const ticket = await t.transaction(async (sp) => {
        const [{ n }] = await sp.select({ n: sql<number>`coalesce(max(${queueTickets.ticketNo}), 0)::int + 1` }).from(queueTickets)
          .where(and(eq(queueTickets.branchId, ctx.branchId), eq(queueTickets.day, day)));
        const [row] = await sp.insert(queueTickets).values({
          tenantId: ctx.tenant.id, branchId: ctx.branchId, patientId: o.patientId, appointmentId: o.appointmentId ?? null,
          practitionerId: o.practitionerId ?? null, day, ticketNo: n, priority: o.priority ?? 0, note: o.note ?? null,
        }).returning();
        return row;
      });
      await audit(t, ctx, "create", "queue_ticket", ticket.id, { patientId: o.patientId, details: { ticketNo: ticket.ticketNo } });
      await emit(t, ctx.tenant.id, "queue.updated", { id: ticket.id, ticketNo: ticket.ticketNo, status: ticket.status, branchId: ticket.branchId });
      return ticket;
    } catch (e) {
      if (!isUniqueViolation(e) || attempt >= 5) throw e;
    }
  }
}
