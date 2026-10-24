"use server";
import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { carePlans, patients, patientScheduleItems, scheduleTemplates } from "@/db/schema";
import { formObject, run, UserError, zBool, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { addDays, localDay, zonedToUtc } from "@/lib/format";

const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");

export async function enrollAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({
      patientId: z.string().uuid(), condition: z.enum(["hypertension", "diabetes", "asthma", "hiv", "other"]),
      intervalDays: z.coerce.number().int().min(1).max(365).default(30), firstDue: zDay.optional(),
      bpSys: z.coerce.number().int().min(80).max(250).optional(), bpDia: z.coerce.number().int().min(40).max(150).optional(),
      glucose: z.coerce.number().min(2).max(30).optional(), adherenceNudges: zBool, nudgeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [p] = await t.select({ id: patients.id }).from(patients).where(eq(patients.id, o.patientId));
      if (!p) throw new UserError("Patient not found");
      const targets = Object.fromEntries(Object.entries({ bpSys: o.bpSys, bpDia: o.bpDia, glucose: o.glucose }).filter(([, v]) => v != null));
      const [plan] = await t.insert(carePlans).values({
        tenantId: ctx.tenant.id, patientId: o.patientId, condition: o.condition, intervalDays: o.intervalDays,
        nextDueAt: o.firstDue ?? addDays(localDay(ctx.tenant.timezone), o.intervalDays), targets,
        adherenceNudges: o.adherenceNudges && !!o.nudgeTime, nudgeTime: o.nudgeTime ?? null, createdBy: ctx.user.id,
      }).returning({ id: carePlans.id });
      await audit(t, ctx, "create", "care_plan", plan.id, { patientId: o.patientId, details: { condition: o.condition } });
    });
    revalidatePath("/care");
    return { ok: true, id: o.patientId };
  });
}

export async function deactivatePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("clinical.write");
    const o = z.object({ id: z.string().uuid(), patientId: z.string().uuid() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      await t.update(carePlans).set({ active: false }).where(and(eq(carePlans.id, o.id), eq(carePlans.patientId, o.patientId)));
      await audit(t, ctx, "update", "care_plan", o.id, { patientId: o.patientId, details: { active: false } });
    });
    revalidatePath(`/care/${o.patientId}`);
    revalidatePath("/care");
  });
}

export async function startScheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("vitals.write");
    const o = z.object({ patientId: z.string().uuid(), templateId: z.string().uuid(), startDate: zDay }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const [tpl] = await t.select().from(scheduleTemplates)
        .where(and(eq(scheduleTemplates.id, o.templateId), or(isNull(scheduleTemplates.tenantId), eq(scheduleTemplates.tenantId, ctx.tenant.id))));
      if (!tpl) throw new UserError("Schedule not found");
      const [dup] = await t.select({ id: patientScheduleItems.id }).from(patientScheduleItems)
        .where(and(eq(patientScheduleItems.patientId, o.patientId), eq(patientScheduleItems.templateId, tpl.id))).limit(1);
      if (dup) throw new UserError("This schedule has already been started for the patient");
      await t.insert(patientScheduleItems).values(tpl.items.map((i) => ({
        tenantId: ctx.tenant.id, patientId: o.patientId, templateId: tpl.id, kind: tpl.kind, name: i.name, dueDate: addDays(o.startDate, i.offsetDays),
      })));
      await audit(t, ctx, "create", "schedule", tpl.id, { patientId: o.patientId, details: { name: tpl.name, startDate: o.startDate } });
    });
    revalidatePath(`/care/${o.patientId}`);
  });
}

export async function updateScheduleItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("vitals.write");
    const o = z.object({
      id: z.string().uuid(), patientId: z.string().uuid(), status: z.enum(["done", "skipped", "due"]),
      doneDate: zDay.optional(), batchNo: z.string().max(60).optional(),
    }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const done = o.status === "done";
      await t.update(patientScheduleItems).set({
        status: o.status, doneAt: done ? zonedToUtc(o.doneDate ?? localDay(ctx.tenant.timezone), "12:00", ctx.tenant.timezone) : null, batchNo: done ? o.batchNo ?? null : null,
      }).where(and(eq(patientScheduleItems.id, o.id), eq(patientScheduleItems.patientId, o.patientId)));
      await audit(t, ctx, "update", "schedule_item", o.id, { patientId: o.patientId, details: { status: o.status, batchNo: o.batchNo } });
    });
    revalidatePath(`/care/${o.patientId}`);
  });
}
