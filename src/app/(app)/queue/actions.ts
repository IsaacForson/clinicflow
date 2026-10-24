"use server";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appointments, queueTickets } from "@/db/schema";
import { formObject, run, UserError, zBool, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { emit } from "@/lib/events";
import { localDay } from "@/lib/format";
import { QUEUE_STATUSES } from "./lib";
import { createTicket } from "./tickets";

const refresh = () => { revalidatePath("/queue"); revalidatePath("/queue/display"); };

export async function addToQueueAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("queue.manage");
    const o = z.object({
      patientId: z.string().uuid("Choose a patient"), practitionerId: z.string().uuid().optional(), urgent: zBool, note: z.string().max(200).optional(),
    }).parse(formObject(fd));
    const ticket = await tx(ctx, (t) => createTicket(t, ctx, { patientId: o.patientId, practitionerId: o.practitionerId, priority: o.urgent ? 1 : 0, note: o.note }));
    refresh();
    return { ok: true, message: `Ticket ${ticket.ticketNo} added to the queue.` };
  });
}

type Ticket = typeof queueTickets.$inferSelect;
type TicketTx = Parameters<Parameters<typeof tx>[1]>[0];

async function setStatus(t: TicketTx, ctx: Awaited<ReturnType<typeof requireWrite>>, ticket: Ticket, status: Ticket["status"], extra: Partial<Ticket> = {}) {
  const now = new Date();
  const [row] = await t.update(queueTickets).set({
    status, ...extra,
    calledAt: status === "with_doctor" && !ticket.calledAt ? now : (extra.calledAt ?? ticket.calledAt),
    doneAt: status === "done" || status === "left" ? now : null,
  }).where(eq(queueTickets.id, ticket.id)).returning();
  if (status === "done" && ticket.appointmentId) {
    await t.update(appointments).set({ status: "completed" }).where(and(eq(appointments.id, ticket.appointmentId), eq(appointments.status, "arrived")));
  }
  await audit(t, ctx, "update", "queue_ticket", ticket.id, { patientId: ticket.patientId, details: { status } });
  await emit(t, ctx.tenant.id, "queue.updated", { id: row.id, ticketNo: row.ticketNo, status: row.status, branchId: row.branchId });
  return row;
}

export async function moveTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("queue.manage");
    const o = z.object({ id: z.string().uuid(), status: z.enum(QUEUE_STATUSES) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [ticket] = await t.select().from(queueTickets).where(eq(queueTickets.id, o.id)).for("update");
      if (!ticket) throw new UserError("Ticket not found");
      await setStatus(t, ctx, ticket, o.status);
    });
    refresh();
  });
}

/** Next waiting ticket for this practitioner (or unassigned): urgent first, then oldest. */
export async function callNextAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("queue.manage");
    const { practitionerId } = z.object({ practitionerId: z.string().uuid() }).parse(formObject(fd));
    const n = await tx(ctx, async (t) => {
      const [ticket] = await t.select().from(queueTickets).where(and(
        eq(queueTickets.branchId, ctx.branchId), eq(queueTickets.day, localDay(ctx.tenant.timezone)), eq(queueTickets.status, "waiting"),
        or(eq(queueTickets.practitionerId, practitionerId), isNull(queueTickets.practitionerId)),
      )).orderBy(desc(queueTickets.priority), asc(queueTickets.createdAt)).limit(1).for("update", { skipLocked: true });
      if (!ticket) throw new UserError("Nobody is waiting for this practitioner.");
      await setStatus(t, ctx, ticket, "with_doctor", { practitionerId, calledAt: new Date() });
      return ticket.ticketNo;
    });
    refresh();
    return { ok: true, message: `Calling ticket ${n}` };
  });
}

export async function assignTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("queue.manage");
    const o = z.object({ id: z.string().uuid(), practitionerId: z.string().uuid().optional() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [row] = await t.update(queueTickets).set({ practitionerId: o.practitionerId ?? null }).where(eq(queueTickets.id, o.id)).returning();
      if (!row) throw new UserError("Ticket not found");
      await audit(t, ctx, "update", "queue_ticket", row.id, { patientId: row.patientId, details: { practitionerId: o.practitionerId ?? null } });
      await emit(t, ctx.tenant.id, "queue.updated", { id: row.id, ticketNo: row.ticketNo, status: row.status, branchId: row.branchId });
    });
    refresh();
  });
}

export async function togglePriorityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("queue.manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [cur] = await t.select().from(queueTickets).where(eq(queueTickets.id, id));
      if (!cur) throw new UserError("Ticket not found");
      await t.update(queueTickets).set({ priority: cur.priority > 0 ? 0 : 1 }).where(eq(queueTickets.id, id));
      await audit(t, ctx, "update", "queue_ticket", id, { patientId: cur.patientId, details: { urgent: cur.priority === 0 } });
      await emit(t, ctx.tenant.id, "queue.updated", { id, ticketNo: cur.ticketNo, status: cur.status, branchId: cur.branchId });
    });
    refresh();
  });
}
