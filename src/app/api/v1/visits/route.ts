import { and, asc, eq, gt } from "drizzle-orm";
import { diagnoses, visits } from "@/db/schema";
import { apiAudit, ApiError, apiHandler, page, pageParams } from "@/lib/api-auth";

/** Signed visits only, summary fields (no clinical note text). */
export async function GET(req: Request) {
  return apiHandler(req, "visits:read", async (t, k) => {
    const { limit, cursor, params } = pageParams(req);
    const patientId = params.get("patientId");
    if (!patientId || !/^[0-9a-f-]{36}$/i.test(patientId)) throw new ApiError(400, "patientId is required");
    const rows = await t.select({
      id: visits.id, patientId: visits.patientId, practitionerId: visits.practitionerId, branchId: visits.branchId, template: visits.template,
      startedAt: visits.startedAt, signedAt: visits.signedAt, followUpDate: visits.followUpDate,
    }).from(visits).where(and(eq(visits.patientId, patientId), eq(visits.status, "signed"), cursor ? gt(visits.id, cursor) : undefined))
      .orderBy(asc(visits.id)).limit(limit + 1);
    const result = page(rows, limit);
    const dx = result.data.length ? await t.select({ visitId: diagnoses.visitId, code: diagnoses.icd10Code, description: diagnoses.description, isPrimary: diagnoses.isPrimary })
      .from(diagnoses).where(eq(diagnoses.patientId, patientId)) : [];
    await apiAudit(t, k, "view", "visit", null, patientId);
    return { ...result, data: result.data.map((v) => ({ ...v, diagnoses: dx.filter((d) => d.visitId === v.id).map(({ visitId: _, ...d }) => d) })) };
  });
}
