import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb, withTenant } from "@/db";
import * as schema from "@/db/schema";
import { assertSeats, limitError } from "../limits";
import { priceUsd } from "../subscription/pricing";

describe("plan limits", () => {
  it("checks users, practitioners, branches and scribe seats", () => {
    const ok = { users: 2, practitioners: 1, branches: 1, scribe: 0 };
    expect(limitError("solo", 0, ok)).toBeNull();
    expect(limitError("solo", 0, { ...ok, users: 3 })).toMatch(/2 active staff/);
    expect(limitError("solo", 0, { ...ok, practitioners: 2 })).toMatch(/1 practitioner\./);
    expect(limitError("clinic", 0, { ...ok, branches: 2 })).toMatch(/Group/);
    expect(limitError("group", 0, { ...ok, branches: 2 })).toBeNull();
    expect(limitError("clinic", 1, { ...ok, scribe: 2 })).toMatch(/scribe/);
  });
  it("prices annual as 10 months", () => {
    expect(priceUsd("clinic", "monthly", 0)).toBe(79);
    expect(priceUsd("clinic", "annual", 2)).toBe((79 + 38) * 10);
  });

  let tenantId: string;
  beforeAll(async () => {
    [{ id: tenantId }] = await adminDb().insert(schema.tenants).values({ name: "Limits", slug: `limits-${Date.now()}`, plan: "solo" }).returning({ id: schema.tenants.id });
    await adminDb().insert(schema.branches).values({ tenantId, name: "Main", isMain: true });
    await adminDb().insert(schema.users).values([
      { tenantId, name: "Doc", role: "owner", isPractitioner: true },
      { tenantId, name: "Gone", role: "nurse", active: false },
    ]);
  });
  afterAll(() => adminDb().delete(schema.tenants).where(sql`${schema.tenants.id} = ${tenantId}`));

  it("counts only active seats in the tenant and only blocks the dimension that grows", async () => {
    const tenant = { id: tenantId, plan: "solo" as const, scribeSeats: 0 };
    await withTenant(tenantId, async (t) => {
      await expect(assertSeats(t, tenant, { users: 1 })).resolves.toBeUndefined(); // 2nd of 2 users; inactive one ignored
      await expect(assertSeats(t, tenant, { users: 1, practitioners: 1 })).rejects.toThrow(/practitioner/);
      await expect(assertSeats(t, tenant, { branches: 1 })).rejects.toThrow(/branch/);
      await expect(assertSeats(t, tenant, { scribe: 1 })).rejects.toThrow(/scribe/);
    });
  });
});
