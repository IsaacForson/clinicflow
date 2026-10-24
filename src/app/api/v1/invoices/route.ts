import { and, asc, eq, gt } from "drizzle-orm";
import { invoices } from "@/db/schema";
import { apiHandler, page, pageParams } from "@/lib/api-auth";
import { invoiceFields } from "./fields";

const STATUSES = ["draft", "issued", "partially_paid", "paid", "void"] as const;

export async function GET(req: Request) {
  return apiHandler(req, "invoices:read", async (t) => {
    const { limit, cursor, params } = pageParams(req);
    const status = STATUSES.find((s) => s === params.get("status"));
    const patientId = params.get("patientId");
    const rows = await t.select(invoiceFields).from(invoices).where(and(
      cursor ? gt(invoices.id, cursor) : undefined, status ? eq(invoices.status, status) : undefined,
      patientId && /^[0-9a-f-]{36}$/i.test(patientId) ? eq(invoices.patientId, patientId) : undefined,
    )).orderBy(asc(invoices.id)).limit(limit + 1);
    return page(rows, limit);
  });
}
