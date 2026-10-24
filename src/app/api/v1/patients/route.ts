import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { consents, patients } from "@/db/schema";
import { apiAudit, apiHandler, page, pageParams, readJson } from "@/lib/api-auth";
import { emit } from "@/lib/events";
import { e164 } from "@/lib/format";
import { nextNumber } from "@/lib/numbers";
import { patientFields } from "./fields";

export async function GET(req: Request) {
  return apiHandler(req, "patients:read", async (t, k) => {
    const { limit, cursor, params } = pageParams(req);
    const phone = params.get("phone");
    const rows = await t.select(patientFields).from(patients)
      .where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), cursor ? gt(patients.id, cursor) : undefined,
        phone ? eq(patients.phone, e164(phone, k.tenant.country)!) : undefined))
      .orderBy(asc(patients.id)).limit(limit + 1);
    await apiAudit(t, k, "view", "patient", null);
    return page(rows, limit);
  });
}

const body = z.object({
  firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), otherNames: z.string().optional(),
  sex: z.enum(["female", "male", "other", "unknown"]).default("unknown"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(),
  preferredChannel: z.enum(["whatsapp", "sms", "email"]).default("whatsapp"), language: z.string().default("en"),
});

export async function POST(req: Request) {
  return apiHandler(req, "patients:write", async (t, k) => {
    const o = body.parse(await readJson(req));
    const [p] = await t.insert(patients).values({
      ...o, tenantId: k.tenantId, phone: e164(o.phone, k.tenant.country), patientNo: await nextNumber(t, k.tenantId, "patient"),
    }).returning(patientFields);
    await t.insert(consents).values({ tenantId: k.tenantId, patientId: p.id, type: "data_processing", granted: true, method: "form" });
    await apiAudit(t, k, "create", "patient", p.id, p.id);
    await emit(t, k.tenantId, "patient.created", { id: p.id });
    return Response.json(p, { status: 201 });
  });
}
