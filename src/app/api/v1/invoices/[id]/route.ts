import { eq } from "drizzle-orm";
import { invoiceLines, invoices } from "@/db/schema";
import { ApiError, apiHandler } from "@/lib/api-auth";
import { invoiceFields } from "../fields";

export async function GET(req: Request, { params }: RouteContext<"/api/v1/invoices/[id]">) {
  const { id } = await params;
  return apiHandler(req, "invoices:read", async (t) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "Not found");
    const [inv] = await t.select(invoiceFields).from(invoices).where(eq(invoices.id, id));
    if (!inv) throw new ApiError(404, "Not found");
    const lines = await t.select({
      id: invoiceLines.id, serviceId: invoiceLines.serviceId, description: invoiceLines.description, quantity: invoiceLines.quantity,
      unitPriceMinor: invoiceLines.unitPriceMinor, totalMinor: invoiceLines.totalMinor, insurerCovered: invoiceLines.insurerCovered,
    }).from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    return { ...inv, lines };
  });
}
