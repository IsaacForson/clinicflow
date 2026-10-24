import { and, asc, eq, gt } from "drizzle-orm";
import { services } from "@/db/schema";
import { apiHandler, page, pageParams } from "@/lib/api-auth";

export async function GET(req: Request) {
  return apiHandler(req, "services:read", async (t) => {
    const { limit, cursor } = pageParams(req);
    const rows = await t.select({
      id: services.id, name: services.name, code: services.code, category: services.category, priceMinor: services.priceMinor, durationMin: services.durationMin,
    }).from(services).where(and(eq(services.active, true), cursor ? gt(services.id, cursor) : undefined)).orderBy(asc(services.id)).limit(limit + 1);
    return page(rows, limit);
  });
}
