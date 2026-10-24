import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { visitRevisions, visits } from "@/db/schema";
import { UserError } from "./action";
import { audit, type Ctx } from "./auth";

export const NOTE_FIELDS = ["complaint", "subjective", "objective", "assessment", "plan"] as const;
export type NoteField = (typeof NOTE_FIELDS)[number];
export type NoteInput = Partial<Record<NoteField, string>> & { extra?: Record<string, string> };

/**
 * Saves visit note fields with optimistic versioning. Used by the consultation screen and the offline sync endpoint.
 * Conflict rule (offline): if baseVersion is stale, fields the server changed since are merged by keeping both texts,
 * separated by a marker, so nothing a clinician typed is lost. Signed notes can't be edited.
 */
export async function applyVisitNote(t: Tx, ctx: Ctx, o: { visitId: string; baseVersion: number; note: NoteInput }) {
  const [v] = await t.select().from(visits).where(eq(visits.id, o.visitId)).for("update");
  if (!v) throw new UserError("Consultation not found");
  if (v.status === "signed") throw new UserError("This note is signed and locked. Add an addendum instead.");
  const stale = o.baseVersion !== v.version;
  const next: Partial<typeof visits.$inferInsert> = {};
  for (const f of NOTE_FIELDS) {
    const incoming = o.note[f];
    if (incoming === undefined) continue;
    const current = v[f] ?? "";
    next[f] = stale && current && current !== incoming && !incoming.includes(current)
      ? `${current}\n--- merged offline edit ---\n${incoming}` : incoming;
  }
  if (o.note.extra) next.extra = { ...v.extra, ...o.note.extra };
  if (!Object.keys(next).length) return v;
  await t.insert(visitRevisions).values({
    tenantId: ctx.tenant.id, visitId: v.id, version: v.version, editedBy: ctx.user.id,
    snapshot: JSON.stringify(Object.fromEntries(NOTE_FIELDS.map((f) => [f, v[f]]).concat([["extra", v.extra as never]]))),
  });
  const [updated] = await t.update(visits).set({ ...next, version: v.version + 1, updatedAt: new Date() }).where(eq(visits.id, v.id)).returning();
  await audit(t, ctx, "update", "visit", v.id, { patientId: v.patientId, details: { fields: Object.keys(next), merged: stale } });
  return updated;
}
