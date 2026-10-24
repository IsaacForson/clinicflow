import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Input, LinkButton } from "@/components/ui";
import { patients } from "@/db/schema";
import { tx, type Ctx } from "@/lib/auth";
import { age, e164, fullName } from "@/lib/format";

/** Quick patient finder (server-rendered GET form). `keep` carries other query params through the search. */
export async function PatientSearch({ ctx, q, action, keep = {}, hrefFor }: {
  ctx: Ctx; q: string; action: string; keep?: Record<string, string | undefined>; hrefFor: (id: string) => string;
}) {
  const rows = q ? await tx(ctx, (t) => {
    const like = `%${q}%`;
    const phone = /\d{6,}/.test(q.replace(/\D/g, "")) ? e164(q, ctx.tenant.country) : null;
    return t.select().from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
      ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like),
      ilike(patients.lastName, like), phone ? eq(patients.phone, phone) : undefined,
    ))).orderBy(patients.lastName).limit(10);
  }) : [];
  return (
    <div className="space-y-2">
      <form action={action} className="flex gap-2">
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <Input name="q" defaultValue={q} placeholder="Find patient: name, phone or patient no." autoFocus aria-label="Find patient" />
        <LinkButton variant="secondary" href="/patients/new" className="whitespace-nowrap">Register new</LinkButton>
      </form>
      {q && (rows.length ? (
        <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={hrefFor(p.id)} className="flex items-center justify-between gap-3 px-3 py-3 hover:bg-teal-50">
                <span className="font-medium text-slate-900">{fullName(p)}</span>
                <span className="text-xs text-slate-500">{[p.patientNo, p.sex, age(p.dob), p.phone].filter(Boolean).join(" · ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">No patient matches. <Link href="/patients/new" className="text-teal-800 underline">Register a new patient</Link>.</p>)}
    </div>
  );
}
