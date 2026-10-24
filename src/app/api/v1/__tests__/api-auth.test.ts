import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@/db";
import * as schema from "@/db/schema";
import { ApiError, authenticate, newApiKey, RATE_LIMIT, rateLimited } from "@/lib/api-auth";
import { GET as listPatients, POST as createPatient } from "../patients/route";
import { POST as createAppointment } from "../appointments/route";

const db = () => adminDb();
let group: string, solo: string, other: string, full: string, readOnly: string, revoked: string, soloKey: string, otherPatient: string;

const req = (key: string | null, url = "http://x/api/v1/patients", init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" } });

async function tenant(name: string, plan: "solo" | "group") {
  const [t] = await db().insert(schema.tenants).values({ name, slug: `${name}-${Date.now()}`, plan, planStatus: "active" }).returning({ id: schema.tenants.id });
  await db().insert(schema.branches).values({ tenantId: t.id, name: "Main", isMain: true });
  return t.id;
}
async function key(tenantId: string, scopes: string[], revokedAt?: Date) {
  const k = newApiKey();
  await db().insert(schema.apiKeys).values({ tenantId, name: "test", prefix: k.prefix, keyHash: k.keyHash, scopes, revokedAt });
  return k.key;
}

beforeAll(async () => {
  group = await tenant("api-group", "group");
  solo = await tenant("api-solo", "solo");
  other = await tenant("api-other", "group");
  full = await key(group, ["patients:read", "patients:write", "appointments:write"]);
  readOnly = await key(group, ["patients:read"]);
  revoked = await key(group, ["patients:read"], new Date());
  soloKey = await key(solo, ["patients:read"]);
  [{ id: otherPatient }] = await db().insert(schema.patients).values({ tenantId: other, patientNo: "P-000001", firstName: "Other", lastName: "Clinic" }).returning({ id: schema.patients.id });
});
afterAll(async () => {
  await db().delete(schema.tenants).where(sql`${schema.tenants.id} in (${group}, ${solo}, ${other})`);
});

const status = (p: Promise<unknown>) => p.then(() => 200, (e) => (e instanceof ApiError ? e.status : 500));

describe("API key auth", () => {
  it("rejects missing, unknown and revoked keys", async () => {
    expect(await status(authenticate(req(null), "patients:read"))).toBe(401);
    expect(await status(authenticate(req("cf_live_nope"), "patients:read"))).toBe(401);
    expect(await status(authenticate(req(revoked), "patients:read"))).toBe(401);
  });
  it("requires the api plan feature and the scope", async () => {
    expect(await status(authenticate(req(soloKey), "patients:read"))).toBe(403);
    expect(await status(authenticate(req(readOnly), "patients:write"))).toBe(403);
    const k = await authenticate(req(readOnly), "patients:read");
    expect(k.tenantId).toBe(group);
  });
  it("rate limits per key in a fixed window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) expect(rateLimited("k1", t0 + i)).toBe(false);
    expect(rateLimited("k1", t0 + 500)).toBe(true);
    expect(rateLimited("k2", t0 + 500)).toBe(false);
    expect(rateLimited("k1", t0 + 60_000)).toBe(false);
  });
});

describe("API endpoints", () => {
  it("creates and lists patients only within the key's tenant, and audits with the key id", async () => {
    const res = await createPatient(req(full, "http://x/api/v1/patients", { method: "POST", body: JSON.stringify({ firstName: "Kofi", lastName: "Boateng", phone: "024 123 4567" }) }));
    expect(res.status).toBe(201);
    const p = await res.json();
    expect(p.patientNo).toBe("P-000001");
    expect(p.phone).toBe("+233241234567");
    const list = await (await listPatients(req(readOnly))).json();
    expect(list.data.map((x: { id: string }) => x.id)).toEqual([p.id]);
    const [log] = await db().select().from(schema.auditLog).where(eq(schema.auditLog.entityId, p.id));
    expect(log.userId).toBeNull();
    expect(log.details).toMatchObject({ apiKeyId: expect.any(String) });
  });
  it("validates bodies and refuses another tenant's patient for appointments", async () => {
    const bad = await createPatient(req(full, "http://x/api/v1/patients", { method: "POST", body: JSON.stringify({ firstName: "" }) }));
    expect(bad.status).toBe(422);
    const res = await createAppointment(req(full, "http://x/api/v1/appointments", { method: "POST", body: JSON.stringify({ patientId: otherPatient, startsAt: "2030-01-01T09:00:00Z" }) }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/patientId/);
  });
});
