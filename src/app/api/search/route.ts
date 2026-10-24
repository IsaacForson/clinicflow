import { and, ilike, isNull, or, sql, eq } from "drizzle-orm";
import { patients } from "@/db/schema";
import { audit, getCtx, tx } from "@/lib/auth";
import { blindIndex } from "@/lib/crypto";
import { e164, fullName } from "@/lib/format";
import { can } from "@/lib/permissions";

/** Patient quick search for the command palette (name, patient no., phone, national ID, member no.). */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx || !can(ctx.user.role, "patients.read")) return Response.json({ patients: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ patients: [] });
  const like = `%${q}%`;
  const phone = /\d{6,}/.test(q.replace(/\D/g, "")) ? e164(q, ctx.tenant.country) : null;
  const rows = await tx(ctx, async (t) => {
    const found = await t.select({ id: patients.id, firstName: patients.firstName, lastName: patients.lastName, otherNames: patients.otherNames, patientNo: patients.patientNo, phone: patients.phone, dob: patients.dob })
      .from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
        ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like), ilike(patients.lastName, like),
        phone ? eq(patients.phone, phone) : undefined, eq(patients.nationalIdIndex, blindIndex(q)), ilike(patients.memberNo, like),
      ))).orderBy(patients.lastName).limit(8);
    await audit(t, ctx, "search", "patient", null, { details: { q: q.length > 3 ? q.slice(0, 3) + "…" : q, results: found.length } });
    return found;
  });
  return Response.json({ patients: rows.map((p) => ({ id: p.id, name: fullName(p), patientNo: p.patientNo, phone: p.phone, dob: p.dob })) });
}
