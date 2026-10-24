import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, withTenant } from "@/db";
import * as schema from "@/db/schema";
import { localDay } from "@/lib/format";
import { allocateFefo, dispenseStock, receiveStock, transferStock } from "@/lib/inventory";

describe("allocateFefo", () => {
  const today = "2026-10-24";
  it("takes earliest expiry first, skipping expired and empty batches, undated last", () => {
    const r = allocateFefo([
      { id: "undated", qtyOnHand: 50, expiry: null },
      { id: "late", qtyOnHand: 5, expiry: "2027-06-01" },
      { id: "expired", qtyOnHand: 100, expiry: "2026-10-23" },
      { id: "soon", qtyOnHand: 3, expiry: "2026-11-01" },
      { id: "empty", qtyOnHand: 0, expiry: "2026-10-25" },
    ], 10, today);
    expect(r).toEqual({ allocations: [{ batchId: "soon", qty: 3 }, { batchId: "late", qty: 5 }, { batchId: "undated", qty: 2 }], short: 0 });
  });
  it("treats a batch expiring today as usable and reports shortfall", () => {
    expect(allocateFefo([{ id: "a", qtyOnHand: 2, expiry: today }], 5, today)).toEqual({ allocations: [{ batchId: "a", qty: 2 }], short: 3 });
    expect(allocateFefo([], 0, today)).toEqual({ allocations: [], short: 0 });
  });
});

describe("dispenseStock (db)", () => {
  let tenantId: string, branchId: string, branch2: string, itemId: string;
  const who = () => ({ tenant: { id: tenantId, timezone: "Africa/Accra" }, user: { id: randomUUID() } });
  const onHand = async () => (await adminDb().select({ q: sql<number>`coalesce(sum(qty_on_hand),0)::int` }).from(schema.stockBatches)
    .where(sql`${schema.stockBatches.itemId} = ${itemId} and ${schema.stockBatches.branchId} = ${branchId}`))[0].q;

  beforeAll(async () => {
    const db = adminDb();
    [{ id: tenantId }] = await db.insert(schema.tenants).values({ name: "Inv test", slug: `inv-${Date.now()}` }).returning();
    [{ id: branchId }, { id: branch2 }] = await db.insert(schema.branches).values([{ tenantId, name: "Main", isMain: true }, { tenantId, name: "Annex" }]).returning();
    [{ id: itemId }] = await db.insert(schema.items).values({ tenantId, name: "Paracetamol" }).returning();
    const today = localDay("Africa/Accra");
    await db.insert(schema.stockBatches).values([
      { tenantId, itemId, branchId, batchNo: "EXP", expiry: "2020-01-01", qtyOnHand: 100 },
      { tenantId, itemId, branchId, batchNo: "LATE", expiry: "2099-01-01", qtyOnHand: 5 },
    ]);
    await withTenant(tenantId, (t) => receiveStock(t, who(), { itemId, branchId, qty: 3, batchNo: "SOON", expiry: today, costMinor: 50 }));
  });
  afterAll(async () => { await adminDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId)); });

  it("dispenses FEFO and records movements", async () => {
    const alloc = await withTenant(tenantId, (t) => dispenseStock(t, who(), { itemId, branchId, qty: 4, ref: "rx-line-1" }));
    expect(alloc.map((a) => a.qty)).toEqual([3, 1]);
    const moves = await adminDb().select().from(schema.stockMovements).where(eq(schema.stockMovements.ref, "rx-line-1"));
    expect(moves.map((m) => m.qty).sort()).toEqual([-1, -3]);
    expect(await onHand()).toBe(104); // 100 expired untouched + 4 left
  });

  it("refuses to dispense more than unexpired stock and changes nothing", async () => {
    await expect(withTenant(tenantId, (t) => dispenseStock(t, who(), { itemId, branchId, qty: 5, ref: "rx-line-2" }))).rejects.toThrow(/Not enough stock/);
    expect(await onHand()).toBe(104);
  });

  it("never goes negative under concurrent dispenses", async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
      withTenant(tenantId, (t) => dispenseStock(t, who(), { itemId, branchId, qty: 1, ref: `race-${i}` }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    const rows = await adminDb().select().from(schema.stockBatches).where(eq(schema.stockBatches.itemId, itemId));
    expect(rows.every((b) => b.qtyOnHand >= 0)).toBe(true);
    expect(await onHand()).toBe(100);
  });

  it("transfers between branches as an out/in pair", async () => {
    const [exp] = await adminDb().select().from(schema.stockBatches).where(eq(schema.stockBatches.batchNo, "EXP"));
    const dest = await withTenant(tenantId, (t) => transferStock(t, who(), { batchId: exp.id, toBranchId: branch2, qty: 10 }));
    expect(dest.qtyOnHand).toBe(10);
    const moves = await adminDb().select().from(schema.stockMovements).where(sql`${schema.stockMovements.type} in ('transfer_in','transfer_out') and ${schema.stockMovements.itemId} = ${itemId}`);
    expect(moves.map((m) => m.qty).sort((a, b) => a - b)).toEqual([-10, 10]);
    await expect(withTenant(tenantId, (t) => transferStock(t, who(), { batchId: exp.id, toBranchId: branch2, qty: 1000 }))).rejects.toThrow(/Only/);
  });
});
