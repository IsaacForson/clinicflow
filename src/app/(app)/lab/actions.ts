"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { documents, labOrderItems, labOrders, labTests } from "@/db/schema";
import { formObject, run, UserError, zBool, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { addLine, createInvoice } from "@/lib/billing";
import { emit } from "@/lib/events";
import { queuePatientMessage } from "@/lib/messaging";
import { createPortalLink } from "@/lib/portal";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, putFile } from "@/lib/storage";
import { FLAGS, suggestFlag } from "./flag";

const uuid = z.string().uuid();

async function loadOrder(t: Parameters<Parameters<typeof tx>[1]>[0], id: string) {
  const [o] = await t.select().from(labOrders).where(eq(labOrders.id, id)).for("update");
  if (!o) throw new UserError("Lab order not found");
  return o;
}

/** Walk-in, lab-only order: patient + tests, billed on a new invoice for tests linked to a service. */
export async function createLabOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.result");
    const o = z.object({ patientId: uuid, externalLab: z.string().optional(), notes: z.string().optional() }).parse(formObject(fd));
    const testIds = z.array(uuid).min(1, "Choose at least one test").parse(fd.getAll("testId"));
    const id = await tx(ctx, async (t) => {
      const tests = await t.select().from(labTests).where(and(inArray(labTests.id, testIds), eq(labTests.active, true)));
      if (!tests.length) throw new UserError("Choose at least one test");
      const [order] = await t.insert(labOrders).values({
        tenantId: ctx.tenant.id, branchId: ctx.branchId, patientId: o.patientId, orderedBy: ctx.user.id,
        externalLab: o.externalLab ?? null, notes: o.notes ?? null,
      }).returning({ id: labOrders.id });
      await t.insert(labOrderItems).values(tests.map((x) => ({ tenantId: ctx.tenant.id, orderId: order.id, testId: x.id, name: x.name, unit: x.unit, refRange: x.refRange })));
      const billable = tests.filter((x) => x.serviceId);
      if (billable.length) {
        const inv = await createInvoice(t, ctx, { patientId: o.patientId });
        for (const x of billable) await addLine(t, inv.id, { serviceId: x.serviceId });
      }
      await audit(t, ctx, "create", "lab_order", order.id, { patientId: o.patientId, details: { tests: tests.map((x) => x.name) } });
      return order.id;
    });
    revalidatePath("/lab");
    return { ok: true, id };
  });
}

export async function setLabStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.result");
    const o = z.object({ id: uuid, status: z.enum(["collected", "cancelled"]) }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const order = await loadOrder(t, o.id);
      if (o.status === "collected" && order.status !== "ordered") throw new UserError("Sample is already collected");
      if (o.status === "cancelled" && order.status !== "ordered" && order.status !== "collected") throw new UserError("Resulted orders can't be cancelled");
      await t.update(labOrders).set({ status: o.status }).where(eq(labOrders.id, o.id));
      await audit(t, ctx, "update", "lab_order", o.id, { patientId: order.patientId, details: { status: o.status } });
    });
    revalidatePath(`/lab/${o.id}`);
    revalidatePath("/lab");
  });
}

export async function setExternalLabAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.result");
    const o = z.object({ id: uuid, externalLab: z.string().optional() }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const order = await loadOrder(t, o.id);
      await t.update(labOrders).set({ externalLab: o.externalLab ?? null }).where(eq(labOrders.id, o.id));
      await audit(t, ctx, "update", "lab_order", o.id, { patientId: order.patientId, details: { externalLab: o.externalLab ?? null } });
    });
    revalidatePath(`/lab/${o.id}`);
  });
}

/** Saves one test's result (value/flag/text and optional PDF or image). Marks the order resulted once every test has one. */
export async function saveResultAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.result");
    const o = z.object({
      itemId: uuid, resultValue: z.string().optional(), unit: z.string().optional(), refRange: z.string().optional(),
      flag: z.enum(["auto", ...FLAGS]).default("auto"), resultText: z.string().optional(),
    }).parse(formObject(fd));
    const file = fd.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (hasFile) {
      if (file.size > MAX_UPLOAD_BYTES) throw new UserError("File is larger than 15 MB");
      if (!/^(image\/|application\/pdf)/.test(file.type) || !ALLOWED_MIME.test(file.type)) throw new UserError("Upload a PDF or image");
    }
    if (!o.resultValue && !o.resultText && !hasFile) throw new UserError("Enter a value, a comment or attach the result");
    const key = hasFile ? await putFile(ctx.tenant.id, file.name, Buffer.from(await file.arrayBuffer())) : null;
    const orderId = await tx(ctx, async (t) => {
      const [item] = await t.select().from(labOrderItems).where(eq(labOrderItems.id, o.itemId));
      if (!item) throw new UserError("Test not found");
      const order = await loadOrder(t, item.orderId);
      if (order.status === "cancelled") throw new UserError("This order is cancelled");
      let documentId = item.documentId;
      if (key && hasFile) {
        const [d] = await t.insert(documents).values({
          tenantId: ctx.tenant.id, patientId: order.patientId, visitId: order.visitId, name: file.name, mime: file.type, size: file.size,
          storageKey: key, category: "lab_result", uploadedBy: ctx.user.id,
        }).returning({ id: documents.id });
        documentId = d.id;
      }
      const flag = o.flag === "auto" ? suggestFlag(o.resultValue, o.refRange) : o.flag;
      await t.update(labOrderItems).set({
        resultValue: o.resultValue ?? null, unit: o.unit ?? null, refRange: o.refRange ?? null, flag,
        resultText: o.resultText ?? null, documentId, resultedBy: ctx.user.id, resultedAt: new Date(),
      }).where(eq(labOrderItems.id, item.id));
      await audit(t, ctx, "update", "lab_result", item.id, { patientId: order.patientId, details: { test: item.name, flag } });
      const pending = await t.select({ id: labOrderItems.id }).from(labOrderItems)
        .where(and(eq(labOrderItems.orderId, order.id), isNull(labOrderItems.resultedAt))).limit(1);
      if (!pending.length && (order.status === "ordered" || order.status === "collected")) {
        await t.update(labOrders).set({ status: "resulted" }).where(eq(labOrders.id, order.id));
        await emit(t, ctx.tenant.id, "lab.resulted", { id: order.id, patientId: order.patientId, visitId: order.visitId });
      }
      return order.id;
    });
    revalidatePath(`/lab/${orderId}`);
    revalidatePath("/lab");
  });
}

export async function notifyPatientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.result");
    const id = uuid.parse(fd.get("id"));
    await tx(ctx, async (t) => {
      const order = await loadOrder(t, id);
      if (order.status !== "resulted" && order.status !== "notified") throw new UserError("Enter all results first");
      const link = await createPortalLink(t, ctx.tenant.id, order.patientId);
      const msg = await queuePatientMessage(t, { tenantId: ctx.tenant.id, patientId: order.patientId, templateKey: "results_ready", purpose: "results", vars: { link } });
      if (!msg) throw new UserError("Not sent: the patient has opted out of messages or has no phone/email on file.");
      await t.update(labOrders).set({ status: "notified", notifiedAt: new Date() }).where(eq(labOrders.id, id));
      await audit(t, ctx, "send", "lab_order", id, { patientId: order.patientId, details: { template: "results_ready" } });
    });
    revalidatePath(`/lab/${id}`);
    revalidatePath("/lab");
    return { ok: true, message: "Results message queued." };
  });
}

const testSchema = z.object({
  name: z.string().min(1, "Name is required"), code: z.string().optional(), kind: z.enum(["lab", "imaging"]).default("lab"),
  unit: z.string().optional(), refRange: z.string().optional(), serviceId: uuid.optional(), active: zBool,
});

export async function saveLabTestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("lab.result");
    const f = formObject(fd);
    const id = f.id ? uuid.parse(f.id) : null;
    const o = testSchema.parse({ ...f, active: id ? f.active : "on" });
    const row = { name: o.name, code: o.code ?? null, kind: o.kind, unit: o.unit ?? null, refRange: o.refRange ?? null, serviceId: o.serviceId ?? null, active: o.active };
    await tx(ctx, async (t) => {
      const [saved] = id
        ? await t.update(labTests).set(row).where(eq(labTests.id, id)).returning({ id: labTests.id })
        : await t.insert(labTests).values({ ...row, tenantId: ctx.tenant.id }).returning({ id: labTests.id });
      if (!saved) throw new UserError("Test not found");
      await audit(t, ctx, id ? "update" : "create", "lab_test", saved.id, { details: { name: o.name } });
    });
    revalidatePath("/lab/tests");
    return { ok: true, message: "Saved." };
  });
}
