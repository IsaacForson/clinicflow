import "server-only";
import { and, eq, gt, isNull, lt, ne, notInArray } from "drizzle-orm";
import { adminDb, type Tx } from "@/db";
import { appointments, auditLog, branches, patients, portalTokens, tenants, users } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { dayRange } from "@/lib/format";
import { hoursOn } from "@/lib/hours";
import { freeSlots, type Busy } from "./slots";

export type PortalSession = NonNullable<Awaited<ReturnType<typeof resolvePortal>>>;

/** Token → (tenant, patient). Every later query must filter by both; the caller also runs inside withTenant. */
export async function resolvePortal(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await adminDb().select({ tokenId: portalTokens.id, patient: patients, tenant: tenants }).from(portalTokens)
    .innerJoin(patients, and(eq(patients.id, portalTokens.patientId), eq(patients.tenantId, portalTokens.tenantId)))
    .innerJoin(tenants, eq(tenants.id, portalTokens.tenantId))
    .where(and(eq(portalTokens.tokenHash, sha256(token)), gt(portalTokens.expiresAt, new Date()), isNull(patients.deletedAt)));
  return row ?? null;
}

export async function portalAudit(t: Tx, s: PortalSession, action: string, entity: string, entityId: string | null) {
  await t.insert(auditLog).values({ tenantId: s.tenant.id, userId: null, action, entity, entityId, patientId: s.patient.id, details: { via: "portal" } });
}

export async function mainBranchId(t: Tx, tenantId: string) {
  const rows = await t.select({ id: branches.id, isMain: branches.isMain }).from(branches).where(and(eq(branches.tenantId, tenantId), eq(branches.active, true)));
  return (rows.find((b) => b.isMain) ?? rows[0])?.id ?? null;
}

async function busyFor(t: Tx, tenantId: string, practitionerId: string, day: string, tz: string, exceptApptId?: string): Promise<Busy[]> {
  const { start, end } = dayRange(day, tz);
  return t.select({ start: appointments.startsAt, end: appointments.endsAt }).from(appointments).where(and(
    eq(appointments.tenantId, tenantId), eq(appointments.practitionerId, practitionerId),
    notInArray(appointments.status, ["cancelled", "no_show"]), gt(appointments.endsAt, start), lt(appointments.startsAt, end),
    exceptApptId ? ne(appointments.id, exceptApptId) : undefined,
  ));
}

/** Free slots per start time → first free practitioner. Restricted to one practitioner when given. */
export async function availableSlots(t: Tx, o: { tenantId: string; tz: string; day: string; durationMin: number; practitionerId?: string | null; exceptApptId?: string }) {
  const pracs = o.practitionerId
    ? [o.practitionerId]
    : (await t.select({ id: users.id }).from(users).where(and(eq(users.tenantId, o.tenantId), eq(users.isPractitioner, true), eq(users.active, true)))).map((u) => u.id);
  const branchId = await mainBranchId(t, o.tenantId);
  const [b] = branchId ? await t.select({ hours: branches.openingHours }).from(branches).where(and(eq(branches.id, branchId), eq(branches.tenantId, o.tenantId))) : [];
  const open = hoursOn(b?.hours, o.day);
  if (!open) return [];
  const slots = new Map<number, string>();
  for (const id of pracs) {
    for (const s of freeSlots({ day: o.day, tz: o.tz, durationMin: o.durationMin, open: open[0], close: open[1], busy: await busyFor(t, o.tenantId, id, o.day, o.tz, o.exceptApptId) })) {
      if (!slots.has(s.getTime())) slots.set(s.getTime(), id);
    }
  }
  return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([ms, practitionerId]) => ({ startsAt: new Date(ms), practitionerId }));
}
