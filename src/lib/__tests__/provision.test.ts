import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { adminDb } from "@/db";
import { services, tenants } from "@/db/schema";
import { provisionTenant } from "../provision";

const created: string[] = [];
afterAll(async () => { for (const id of created) await adminDb().delete(tenants).where(eq(tenants.id, id)); });

describe("provisionTenant", () => {
  it("sets the clinic's currency from its country and prices starter services in it", async () => {
    const stamp = Date.now();
    const { tenant } = await provisionTenant({ clinicName: "Lagos Test", country: "NG", ownerName: "Dr. Ada Obi", email: `ng${stamp}@test.local`, phone: `+23480${stamp % 100000000}`, password: "x".repeat(12) });
    created.push(tenant.id);
    expect(tenant.currency).toBe("NGN");
    const [consult] = await adminDb().select().from(services).where(and(eq(services.tenantId, tenant.id), eq(services.name, "General consultation")));
    // GHS 150 at the default rates (15.5 GHS, 1550 NGN per USD) → NGN 15,000
    expect(consult.priceMinor).toBe(1_500_000);
  });
});
