import { eq, getTableColumns, getTableName, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, withTenant } from "@/db";
import * as schema from "@/db/schema";

// A user of tenant A must never read or write tenant B's rows, for every tenant-scoped table.
const tenantTables = (Object.values(schema) as unknown[]).filter(
  (v): v is PgTable => v instanceof PgTable && "tenantId" in getTableColumns(v),
);

// Owner-only tables (no app-role grant) are covered by the "permission denied" test instead.
const OWNER_ONLY = new Set(["sessions"]);

/** Drizzle wraps driver errors; match against the underlying Postgres message. */
async function rejectsWith(p: Promise<unknown>, re: RegExp) {
  const e = await p.then(() => null, (err: { message?: string; cause?: { message?: string } }) => err);
  expect(e, "expected the query to fail").not.toBeNull();
  expect(`${e?.cause?.message ?? ""} ${e?.message ?? ""}`).toMatch(re);
}

let a: string, b: string;

beforeAll(async () => {
  const db = adminDb();
  [{ id: a }] = await db.insert(schema.tenants).values({ name: "Iso A", slug: `iso-a-${Date.now()}` }).returning();
  [{ id: b }] = await db.insert(schema.tenants).values({ name: "Iso B", slug: `iso-b-${Date.now()}` }).returning();
  for (const t of [a, b]) {
    const [br] = await db.insert(schema.branches).values({ tenantId: t, name: "Main", isMain: true }).returning();
    const [p] = await db.insert(schema.patients).values({ tenantId: t, patientNo: "P-1", firstName: "Iso", lastName: t.slice(0, 6), nationalId: "SECRET-" + t }).returning();
    await db.insert(schema.appointments).values({ tenantId: t, branchId: br.id, patientId: p.id, startsAt: new Date(), endsAt: new Date() });
    await db.insert(schema.auditLog).values({ tenantId: t, action: "test", entity: "patient" });
  }
});

afterAll(async () => {
  await adminDb().delete(schema.tenants).where(sql`${schema.tenants.id} in (${a}, ${b})`);
});

describe("row-level security", () => {
  it("covers every table with a tenant_id column", async () => {
    const rows = await adminDb().execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join information_schema.columns col on col.table_schema = n.nspname and col.table_name = c.relname and col.column_name = 'tenant_id'
      where c.relkind = 'r' and n.nspname in ('public','audit')`);
    expect(rows.length).toBeGreaterThanOrEqual(tenantTables.length);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it.each(tenantTables.filter((t) => !OWNER_ONLY.has(getTableName(t))).map((t) => [getTableName(t), t] as const))("%s: tenant A sees no rows of tenant B", async (_name, table) => {
    const leaked = await withTenant(a, (t) => t.select({ n: sql<number>`count(*)::int` }).from(table).where(eq((table as never as { tenantId: never }).tenantId, b)));
    expect(leaked[0].n).toBe(0);
  });

  it("sees its own rows", async () => {
    const own = await withTenant(a, (t) => t.select().from(schema.patients));
    expect(own).toHaveLength(1);
    expect(own[0].nationalId).toBe("SECRET-" + a);
  });

  it("cannot insert rows for another tenant", async () => {
    await rejectsWith(withTenant(a, (t) => t.insert(schema.patients).values({ tenantId: b, patientNo: "X", firstName: "x", lastName: "y" })), /row-level security/);
  });

  it("cannot update or delete another tenant's rows", async () => {
    const updated = await withTenant(a, (t) => t.update(schema.patients).set({ firstName: "hacked" }).where(eq(schema.patients.tenantId, b)).returning());
    expect(updated).toHaveLength(0);
    const deleted = await withTenant(a, (t) => t.delete(schema.patients).where(eq(schema.patients.tenantId, b)).returning());
    expect(deleted).toHaveLength(0);
  });

  it("sees nothing without a tenant set", async () => {
    const rows = await withTenant("", (t) => t.select().from(schema.patients)).catch(() => []);
    expect(rows).toHaveLength(0);
  });

  it("only sees its own tenant row", async () => {
    const rows = await withTenant(a, (t) => t.select().from(schema.tenants));
    expect(rows.map((r) => r.id)).toEqual([a]);
  });

  it("cannot read sessions or OTP codes at all", async () => {
    await rejectsWith(withTenant(a, (t) => t.select().from(schema.sessions)), /permission denied/);
    await rejectsWith(withTenant(a, (t) => t.select().from(schema.otpCodes)), /permission denied/);
  });

  it("keeps the audit log append-only", async () => {
    await rejectsWith(withTenant(a, (t) => t.update(schema.auditLog).set({ action: "x" })), /permission denied|append-only/);
    await rejectsWith(adminDb().delete(schema.auditLog).where(eq(schema.auditLog.tenantId, a)), /append-only/);
  });
});
