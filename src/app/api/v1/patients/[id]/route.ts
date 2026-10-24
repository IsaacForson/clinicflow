import { and, eq, isNull } from "drizzle-orm";
import { patients } from "@/db/schema";
import { apiAudit, ApiError, apiHandler } from "@/lib/api-auth";
import { patientFields } from "../fields";

export async function GET(req: Request, { params }: RouteContext<"/api/v1/patients/[id]">) {
  const { id } = await params;
  return apiHandler(req, "patients:read", async (t, k) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "Not found");
    const [p] = await t.select(patientFields).from(patients).where(and(eq(patients.id, id), isNull(patients.deletedAt)));
    if (!p) throw new ApiError(404, "Not found");
    await apiAudit(t, k, "view", "patient", p.id, p.id);
    return p;
  });
}
