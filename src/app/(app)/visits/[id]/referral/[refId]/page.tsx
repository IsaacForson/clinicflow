import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { allergies, diagnoses, patients, referrals, users, visits } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateOnly, fullName } from "@/lib/format";
import { PrintDoc } from "../../../letterhead";

export const metadata = { title: "Referral letter" };

export default async function ReferralPage({ params }: PageProps<"/visits/[id]/referral/[refId]">) {
  const { id, refId } = await params;
  const ctx = await requireCtx("clinical.read");
  const data = await tx(ctx, async (t) => {
    const [r] = await t.select().from(referrals).where(and(eq(referrals.id, refId), eq(referrals.visitId, id)));
    if (!r) return null;
    await audit(t, ctx, "print", "referral", r.id, { patientId: r.patientId });
    const [p] = await t.select().from(patients).where(eq(patients.id, r.patientId));
    const [v] = await t.select().from(visits).where(eq(visits.id, id));
    const [author] = r.createdBy ? await t.select().from(users).where(eq(users.id, r.createdBy)) : [];
    return {
      r, p, v, author,
      dx: await t.select().from(diagnoses).where(eq(diagnoses.visitId, id)).orderBy(desc(diagnoses.isPrimary)),
      allergies: await t.select().from(allergies).where(eq(allergies.patientId, r.patientId)),
    };
  }).catch(() => null);
  if (!data) notFound();
  const { r, p, v, author } = data;
  const summary = [v.complaint && `Presenting complaint: ${v.complaint}`, v.subjective && `History: ${v.subjective}`, v.objective && `Findings: ${v.objective}`, v.plan && `Management so far: ${v.plan}`].filter(Boolean).join("\n\n");
  return (
    <PrintDoc tenant={ctx.tenant} title={`Referral letter${r.urgency !== "routine" ? ` — ${r.urgency.toUpperCase()}` : ""}`} backHref={`/visits/${id}`}>
      <div className="mt-4 space-y-4 leading-relaxed">
        <p className="text-right">{dateOnly(r.createdAt, ctx.tenant.timezone)}</p>
        <p>To: {[r.toName, r.specialty, r.toFacility].filter(Boolean).join(", ")}</p>
        <p>Dear colleague,</p>
        <p><strong>Re: {fullName(p)}</strong> ({[age(p.dob), p.sex, p.patientNo].filter(Boolean).join(" · ")}){p.phone && `, tel. ${p.phone}`}</p>
        <p>Thank you for seeing this patient. Reason for referral: {r.reason}</p>
        <p className="whitespace-pre-wrap">{r.letter || summary}</p>
        {data.dx.length > 0 && <p>Diagnosis: {data.dx.map((d) => `${d.description}${d.icd10Code ? ` (${d.icd10Code})` : ""}`).join("; ")}</p>}
        <p>Allergies: {data.allergies.length ? data.allergies.map((a) => a.substance).join(", ") : "none known"}</p>
        <p>Yours sincerely,</p>
      </div>
      <footer className="mt-12 w-64 border-t border-slate-400 pt-1">
        <div className="font-medium">{author ? [author.title, author.name].filter(Boolean).join(" ") : ""}</div>
        {author?.licenseNo && <div className="text-xs text-slate-600">Licence no. {author.licenseNo}</div>}
        <div className="text-xs text-slate-600">{ctx.tenant.name}</div>
      </footer>
    </PrintDoc>
  );
}
