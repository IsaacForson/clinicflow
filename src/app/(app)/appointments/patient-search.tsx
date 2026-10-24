import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { ArrowRight, Phone, Search, UserRoundPlus, UserRoundSearch } from "lucide-react";
import Link from "next/link";
import { A, Avatar, EmptyState, Input, LinkButton } from "@/components/ui";
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
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-subtle" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Name, phone or patient no." autoFocus aria-label="Find patient" className="h-12 rounded-2xl pl-11 text-[15px]" />
        </div>
        <LinkButton variant="secondary" size="lg" href="/patients/new"><UserRoundPlus className="h-4 w-4" aria-hidden /> Register new</LinkButton>
      </form>
      {!q ? (
        <p className="flex items-center gap-2 px-1 text-xs text-subtle"><UserRoundSearch className="h-3.5 w-3.5" aria-hidden /> Type at least part of a name, a phone number or a patient number, then press Enter.</p>
      ) : rows.length ? (
        <ul className="space-y-1.5" aria-label="Matching patients">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={hrefFor(p.id)} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition hover:-translate-y-px hover:border-accent/40 hover:bg-accent/10">
                <Avatar name={fullName(p)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{fullName(p)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="font-mono text-subtle">{p.patientNo}</span>
                    {(p.sex || p.dob) && <span className="capitalize">{[p.sex !== "unknown" && p.sex, age(p.dob)].filter(Boolean).join(" · ")}</span>}
                    {p.phone && <span className="inline-flex items-center gap-1 tabular-nums"><Phone className="h-3 w-3" aria-hidden />{p.phone}</span>}
                  </span>
                </span>
                <span className="hidden text-xs font-medium text-accent opacity-0 transition group-hover:opacity-100 sm:inline">Select</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<UserRoundSearch />} title={<>No patient matches “{q}”</>}>
          Check the spelling or try their phone number. New here? <A href="/patients/new">Register a new patient</A>.
        </EmptyState>
      )}
    </div>
  );
}

/** The chosen patient, shown at the top of a composer with a way to change it. */
export function PatientChip({ p, changeHref }: { p: { firstName: string; lastName: string; otherNames?: string | null; patientNo: string; phone?: string | null }; changeHref: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-3">
      <Avatar name={fullName(p)} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Patient</div>
        <div className="truncate text-base font-semibold text-fg">{fullName(p)}</div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted"><span className="font-mono">{p.patientNo}</span>{p.phone && <span className="tabular-nums">{p.phone}</span>}</div>
      </div>
      <LinkButton href={changeHref} variant="ghost" size="sm">Change</LinkButton>
    </div>
  );
}
