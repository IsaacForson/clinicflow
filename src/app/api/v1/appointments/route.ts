import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { appointments, branches, patients, services, users } from "@/db/schema";
import { apiAudit, ApiError, apiHandler, page, pageParams, readJson } from "@/lib/api-auth";
import { emit } from "@/lib/events";
import { scheduleAppointmentReminders } from "@/lib/reminders";

const fields = {
  id: appointments.id, branchId: appointments.branchId, patientId: appointments.patientId, practitionerId: appointments.practitionerId,
  serviceId: appointments.serviceId, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status,
  source: appointments.source, reason: appointments.reason, telehealth: appointments.telehealth, createdAt: appointments.createdAt,
};

export async function GET(req: Request) {
  return apiHandler(req, "appointments:read", async (t) => {
    const { limit, cursor, params } = pageParams(req);
    const date = (k: string) => { const v = params.get(k); if (!v) return undefined; const d = new Date(v); if (isNaN(+d)) throw new ApiError(400, `Invalid ${k}`); return d; };
    const from = date("from"), to = date("to"), patientId = params.get("patientId");
    const rows = await t.select(fields).from(appointments).where(and(
      cursor ? gt(appointments.id, cursor) : undefined, from ? gte(appointments.startsAt, from) : undefined, to ? lt(appointments.startsAt, to) : undefined,
      patientId && /^[0-9a-f-]{36}$/i.test(patientId) ? eq(appointments.patientId, patientId) : undefined,
    )).orderBy(asc(appointments.id)).limit(limit + 1);
    return page(rows, limit);
  });
}

const body = z.object({
  patientId: z.string().uuid(), practitionerId: z.string().uuid().optional(), serviceId: z.string().uuid().optional(), branchId: z.string().uuid().optional(),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }).optional(), reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  return apiHandler(req, "appointments:write", async (t, k) => {
    const o = body.parse(await readJson(req));
    // RLS limits every lookup to this tenant, so a foreign id simply isn't found.
    const [patient] = await t.select({ id: patients.id }).from(patients).where(eq(patients.id, o.patientId));
    if (!patient) throw new ApiError(422, "patientId not found");
    if (o.practitionerId) {
      const [pr] = await t.select({ id: users.id }).from(users).where(and(eq(users.id, o.practitionerId), eq(users.isPractitioner, true), eq(users.active, true)));
      if (!pr) throw new ApiError(422, "practitionerId is not an active practitioner");
    }
    const [svc] = o.serviceId ? await t.select().from(services).where(eq(services.id, o.serviceId)) : [];
    if (o.serviceId && !svc) throw new ApiError(422, "serviceId not found");
    const [branch] = await t.select({ id: branches.id }).from(branches)
      .where(and(eq(branches.active, true), o.branchId ? eq(branches.id, o.branchId) : eq(branches.isMain, true))).limit(1);
    if (!branch) throw new ApiError(422, "branchId not found");
    const startsAt = new Date(o.startsAt);
    const endsAt = o.endsAt ? new Date(o.endsAt) : new Date(startsAt.getTime() + (svc?.durationMin ?? 15) * 60_000);
    if (endsAt <= startsAt) throw new ApiError(422, "endsAt must be after startsAt");
    const [a] = await t.insert(appointments).values({
      tenantId: k.tenantId, branchId: branch.id, patientId: o.patientId, practitionerId: o.practitionerId ?? null, serviceId: o.serviceId ?? null,
      startsAt, endsAt, reason: o.reason ?? null, source: "api",
    }).returning(fields);
    await scheduleAppointmentReminders(t, { id: k.tenantId, reminderHours: k.tenant.reminderHours }, a);
    await apiAudit(t, k, "create", "appointment", a.id, a.patientId);
    await emit(t, k.tenantId, "appointment.created", { id: a.id });
    return Response.json(a, { status: 201 });
  });
}
