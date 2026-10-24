"use server";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { items, prescriptionItems, prescriptions, visits } from "@/db/schema";
import { formObject, run, UserError, zBool, zInt, zMoney, type ActionState } from "@/lib/action";
import { audit, requireWrite, tx } from "@/lib/auth";
import { addLine, createInvoice, ensureVisitInvoice } from "@/lib/billing";
import { adjustStock, dispenseStock, expireBatch, receiveStock, transferStock } from "@/lib/inventory";

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Dispenses the quantities entered per prescription line (FEFO from this branch) and charges them to the patient. */
export async function dispenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("dispense");
    const id = uuid.parse(fd.get("prescriptionId"));
    await tx(ctx, async (t) => {
      const [rx] = await t.select().from(prescriptions).where(eq(prescriptions.id, id)).for("update");
      if (!rx) throw new UserError("Prescription not found");
      if (rx.status !== "issued" && rx.status !== "partially_dispensed") throw new UserError(`This prescription is ${rx.status.replace("_", " ")}`);
      const lines = await t.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, id)).orderBy(asc(prescriptionItems.drugName)).for("update");
      let invoiceId: string | null = null;
      const dispensed: { drug: string; qty: number }[] = [];
      for (const li of lines) {
        const qty = z.coerce.number().int().min(0, "Quantity can't be negative").parse(fd.get(`qty_${li.id}`) || 0);
        if (!qty) continue;
        if (qty > li.quantity - li.dispensedQty) throw new UserError(`${li.drugName}: only ${li.quantity - li.dispensedQty} left to dispense`);
        const itemId = uuid.optional().parse(fd.get(`item_${li.id}`) || undefined) ?? li.itemId;
        if (!itemId) throw new UserError(`Choose the stock item for ${li.drugName}`);
        const [it] = await t.select({ name: items.name }).from(items).where(eq(items.id, itemId));
        if (!it) throw new UserError(`Stock item for ${li.drugName} not found`);
        await dispenseStock(t, ctx, { itemId, branchId: ctx.branchId, qty, ref: li.id, itemName: it.name });
        li.dispensedQty += qty;
        await t.update(prescriptionItems).set({ dispensedQty: li.dispensedQty, itemId }).where(eq(prescriptionItems.id, li.id));
        if (!invoiceId) {
          const [v] = rx.visitId ? await t.select({ branchId: visits.branchId }).from(visits).where(eq(visits.id, rx.visitId)) : [];
          invoiceId = (rx.visitId && v
            ? await ensureVisitInvoice(t, ctx, { patientId: rx.patientId, visitId: rx.visitId, branchId: v.branchId })
            : await createInvoice(t, ctx, { patientId: rx.patientId })).id;
        }
        await addLine(t, invoiceId, { itemId, quantity: qty });
        dispensed.push({ drug: li.drugName, qty });
      }
      if (!dispensed.length) throw new UserError("Enter a quantity to dispense");
      const status = lines.every((l) => l.dispensedQty >= l.quantity) ? "dispensed" : "partially_dispensed";
      await t.update(prescriptions).set({ status }).where(eq(prescriptions.id, id));
      await audit(t, ctx, "dispense", "prescription", id, { patientId: rx.patientId, details: { dispensed, invoiceId } });
    });
    revalidatePath("/pharmacy");
    revalidatePath(`/pharmacy/${id}`);
    return { ok: true, message: "Dispensed and added to the patient's bill." };
  });
}

const itemSchema = z.object({
  name: z.string().min(1, "Name is required"), genericName: z.string().optional(), form: z.string().optional(), strength: z.string().optional(),
  unit: z.string().default("unit"), sku: z.string().optional(), reorderLevel: zInt.min(0).default(0), sellPrice: zMoney.optional(),
  favorite: zBool, isDrug: zBool, active: zBool,
});

export async function saveItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("inventory.manage");
    const f = formObject(fd);
    const id = f.id ? uuid.parse(f.id) : null;
    const o = itemSchema.parse({ ...f, active: id ? f.active : "on" });
    const row = {
      name: o.name, genericName: o.genericName ?? null, form: o.form ?? null, strength: o.strength ?? null, unit: o.unit, sku: o.sku ?? null,
      reorderLevel: o.reorderLevel, sellPriceMinor: o.sellPrice ?? 0, favorite: o.favorite, isDrug: o.isDrug, active: o.active,
    };
    const savedId = await tx(ctx, async (t) => {
      const [saved] = id
        ? await t.update(items).set(row).where(eq(items.id, id)).returning({ id: items.id })
        : await t.insert(items).values({ ...row, tenantId: ctx.tenant.id }).returning({ id: items.id });
      if (!saved) throw new UserError("Item not found");
      await audit(t, ctx, id ? "update" : "create", "item", saved.id, { details: { name: o.name } });
      return saved.id;
    });
    revalidatePath("/pharmacy/inventory");
    return { ok: true, id: savedId, message: "Saved." };
  });
}

export async function receiveStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("inventory.manage");
    const o = z.object({
      itemId: uuid, qty: zInt.min(1, "Quantity must be at least 1"), batchNo: z.string().optional(), expiry: day.optional(),
      unitCost: zMoney.optional(), supplier: z.string().optional(),
    }).parse(formObject(fd));
    await tx(ctx, async (t) => {
      const b = await receiveStock(t, ctx, { itemId: o.itemId, branchId: ctx.branchId, qty: o.qty, batchNo: o.batchNo, expiry: o.expiry, costMinor: o.unitCost, supplier: o.supplier });
      await audit(t, ctx, "create", "stock_receive", b.id, { details: { itemId: o.itemId, qty: o.qty } });
    });
    revalidatePath(`/pharmacy/inventory/${o.itemId}`);
    return { ok: true, message: `Received ${o.qty}.` };
  });
}

export async function adjustStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("inventory.manage");
    const o = z.object({
      batchId: uuid, delta: zInt.refine((n) => n !== 0, "Enter a quantity, e.g. -2 or 5"),
      reason: z.enum(["damage", "count_correction", "return", "other"]), note: z.string().optional(),
    }).parse(formObject(fd));
    const itemId = await tx(ctx, async (t) => {
      const b = await adjustStock(t, ctx, { batchId: o.batchId, delta: o.delta, reason: [o.reason.replace("_", " "), o.note].filter(Boolean).join(": "), type: o.reason === "return" ? "return" : "adjust" });
      await audit(t, ctx, "update", "stock_adjust", b.id, { details: { delta: o.delta, reason: o.reason } });
      return b.itemId;
    });
    revalidatePath(`/pharmacy/inventory/${itemId}`);
  });
}

export async function expireBatchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("inventory.manage");
    const batchId = uuid.parse(fd.get("batchId"));
    const itemId = await tx(ctx, async (t) => {
      const b = await expireBatch(t, ctx, batchId);
      await audit(t, ctx, "update", "stock_expire", b.id, { details: { qty: b.qtyOnHand } });
      return b.itemId;
    });
    revalidatePath(`/pharmacy/inventory/${itemId}`);
    revalidatePath("/pharmacy/inventory");
  });
}

export async function transferStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ctx = await requireWrite("inventory.manage");
    const o = z.object({ batchId: uuid, toBranchId: uuid, qty: zInt.min(1) }).parse(formObject(fd));
    if (!ctx.branches.some((b) => b.id === o.toBranchId)) throw new UserError("You don't have access to that branch");
    const itemId = await tx(ctx, async (t) => {
      const dest = await transferStock(t, ctx, o);
      await audit(t, ctx, "update", "stock_transfer", o.batchId, { details: { toBranchId: o.toBranchId, qty: o.qty, destBatchId: dest.id } });
      return dest.itemId;
    });
    revalidatePath(`/pharmacy/inventory/${itemId}`);
    return { ok: true, message: `Transferred ${o.qty}.` };
  });
}
