import { and, asc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { stockBatches, stockMovements } from "@/db/schema";
import { UserError } from "./action";
import { localDay } from "./format";

/** Who is moving stock. `Ctx` from @/lib/auth satisfies this. */
export type StockActor = { tenant: { id: string; timezone: string }; user: { id: string } };
type MoveType = (typeof stockMovements.$inferInsert)["type"];

export type FefoBatch = { id: string; qtyOnHand: number; expiry: string | null };
export type Allocation = { batchId: string; qty: number };

/**
 * First-expiry-first-out: takes from the batch expiring soonest, skipping expired and empty batches.
 * Batches without an expiry go last. Ties keep input order. `short` > 0 means not enough usable stock.
 */
export function allocateFefo(batches: FefoBatch[], qty: number, today: string): { allocations: Allocation[]; short: number } {
  const usable = batches
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.qtyOnHand > 0 && (!b.expiry || b.expiry >= today))
    .sort((x, y) => (x.b.expiry ?? "9999-12-31").localeCompare(y.b.expiry ?? "9999-12-31") || x.i - y.i);
  const allocations: Allocation[] = [];
  let left = Math.max(0, qty);
  for (const { b } of usable) {
    if (left === 0) break;
    const take = Math.min(left, b.qtyOnHand);
    allocations.push({ batchId: b.id, qty: take });
    left -= take;
  }
  return { allocations, short: left };
}

/** Usable (in stock, unexpired) batches of an item at a branch, locked for update, in FEFO order. */
async function lockUsableBatches(t: Tx, itemId: string, branchId: string, today: string) {
  return t.select().from(stockBatches)
    .where(and(eq(stockBatches.itemId, itemId), eq(stockBatches.branchId, branchId), gt(stockBatches.qtyOnHand, 0),
      or(isNull(stockBatches.expiry), gte(stockBatches.expiry, today))))
    .orderBy(sql`${stockBatches.expiry} asc nulls last`, asc(stockBatches.receivedAt))
    .for("update");
}

/** Decrements a locked batch; the qty guard makes negative stock impossible even if a caller forgot the lock. */
async function takeFromBatch(t: Tx, batchId: string, qty: number) {
  const done = await t.update(stockBatches).set({ qtyOnHand: sql`${stockBatches.qtyOnHand} - ${qty}` })
    .where(and(eq(stockBatches.id, batchId), gte(stockBatches.qtyOnHand, qty))).returning({ id: stockBatches.id });
  if (!done.length) throw new UserError("Not enough stock in that batch");
}

async function move(t: Tx, who: StockActor, o: { itemId: string; batchId: string; branchId: string; qty: number; type: MoveType; ref?: string | null; reason?: string | null }) {
  await t.insert(stockMovements).values({ tenantId: who.tenant.id, userId: who.user.id, ref: o.ref ?? null, reason: o.reason ?? null, itemId: o.itemId, batchId: o.batchId, branchId: o.branchId, qty: o.qty, type: o.type });
}

/** Dispenses `qty` of an item from a branch, FEFO across batches. Must run inside a transaction (tx()). */
export async function dispenseStock(t: Tx, who: StockActor, o: { itemId: string; branchId: string; qty: number; ref: string; itemName?: string }) {
  if (o.qty <= 0) return [];
  const batches = await lockUsableBatches(t, o.itemId, o.branchId, localDay(who.tenant.timezone));
  const { allocations, short } = allocateFefo(batches, o.qty, localDay(who.tenant.timezone));
  if (short > 0) throw new UserError(`Not enough stock of ${o.itemName ?? "this item"}: ${o.qty - short} available (unexpired) at this branch`);
  for (const a of allocations) {
    await takeFromBatch(t, a.batchId, a.qty);
    await move(t, who, { itemId: o.itemId, batchId: a.batchId, branchId: o.branchId, qty: -a.qty, type: "dispense", ref: o.ref });
  }
  return allocations;
}

export async function receiveStock(t: Tx, who: StockActor, o: { itemId: string; branchId: string; qty: number; batchNo?: string | null; expiry?: string | null; costMinor?: number; supplier?: string | null; ref?: string | null }) {
  if (o.qty <= 0) throw new UserError("Quantity must be more than zero");
  const [b] = await t.insert(stockBatches).values({
    tenantId: who.tenant.id, itemId: o.itemId, branchId: o.branchId, batchNo: o.batchNo ?? null, expiry: o.expiry ?? null,
    qtyOnHand: o.qty, costMinor: o.costMinor ?? 0, supplier: o.supplier ?? null,
  }).returning();
  await move(t, who, { itemId: o.itemId, batchId: b.id, branchId: o.branchId, qty: o.qty, type: "receive", ref: o.ref, reason: o.supplier });
  return b;
}

/** Signed adjustment of one batch (damage, count correction) or expiry write-off. Never below zero. */
export async function adjustStock(t: Tx, who: StockActor, o: { batchId: string; delta: number; reason: string; type?: "adjust" | "expire" | "return" }) {
  if (!o.delta) throw new UserError("Enter a quantity");
  const [b] = await t.select().from(stockBatches).where(eq(stockBatches.id, o.batchId)).for("update");
  if (!b) throw new UserError("Batch not found");
  if (b.qtyOnHand + o.delta < 0) throw new UserError(`Only ${b.qtyOnHand} on hand in this batch`);
  await t.update(stockBatches).set({ qtyOnHand: b.qtyOnHand + o.delta }).where(eq(stockBatches.id, b.id));
  await move(t, who, { itemId: b.itemId, batchId: b.id, branchId: b.branchId, qty: o.delta, type: o.type ?? "adjust", reason: o.reason });
  return b;
}

/** Writes off everything left in an expired batch. */
export async function expireBatch(t: Tx, who: StockActor, batchId: string) {
  const [b] = await t.select().from(stockBatches).where(eq(stockBatches.id, batchId)).for("update");
  if (!b || b.qtyOnHand <= 0) throw new UserError("Nothing to write off");
  return adjustStock(t, who, { batchId, delta: -b.qtyOnHand, reason: "expired", type: "expire" });
}

/** Moves stock of one batch to another branch: transfer_out here, a mirror batch + transfer_in there. */
export async function transferStock(t: Tx, who: StockActor, o: { batchId: string; toBranchId: string; qty: number }) {
  if (o.qty <= 0) throw new UserError("Quantity must be more than zero");
  const [b] = await t.select().from(stockBatches).where(eq(stockBatches.id, o.batchId)).for("update");
  if (!b) throw new UserError("Batch not found");
  if (b.branchId === o.toBranchId) throw new UserError("Choose a different branch");
  if (b.qtyOnHand < o.qty) throw new UserError(`Only ${b.qtyOnHand} on hand in this batch`);
  await takeFromBatch(t, b.id, o.qty);
  const [dest] = await t.insert(stockBatches).values({
    tenantId: who.tenant.id, itemId: b.itemId, branchId: o.toBranchId, batchNo: b.batchNo, expiry: b.expiry,
    qtyOnHand: o.qty, costMinor: b.costMinor, supplier: b.supplier,
  }).returning();
  await move(t, who, { itemId: b.itemId, batchId: b.id, branchId: b.branchId, qty: -o.qty, type: "transfer_out", ref: dest.id });
  await move(t, who, { itemId: b.itemId, batchId: dest.id, branchId: o.toBranchId, qty: o.qty, type: "transfer_in", ref: b.id });
  return dest;
}
