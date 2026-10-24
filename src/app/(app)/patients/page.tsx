import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { ChevronRight, Phone, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { Avatar, Badge, EmptyState, Kbd, LinkButton, PageHeader, Panel } from "@/components/ui";
import { insurers, patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { blindIndex } from "@/lib/crypto";
import { age, dateOnly, e164, fullName } from "@/lib/format";

export const metadata = { title: "Patients" };

export default async function PatientsPage({ searchParams }: PageProps<"/patients">) {
  const ctx = await requireCtx("patients.read");
  const q = String((await searchParams).q ?? "").trim();
  const rows = await tx(ctx, (t) => {
    const base = and(isNull(patients.deletedAt), isNull(patients.mergedIntoId));
    if (!q) return t.select().from(patients).where(base).orderBy(desc(patients.createdAt)).limit(50);
    const like = `%${q}%`;
    const phone = /\d{6,}/.test(q.replace(/\D/g, "")) ? e164(q, ctx.tenant.country) : null;
    return t.select().from(patients).where(and(base, or(
      ilike(patients.patientNo, like), ilike(patients.firstName, like), ilike(patients.lastName, like),
      ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like),
      phone ? eq(patients.phone, phone) : undefined, phone ? eq(patients.altPhone, phone) : undefined,
      eq(patients.nationalIdIndex, blindIndex(q)), ilike(patients.memberNo, like),
    ))).orderBy(patients.lastName).limit(100);
  });
  const insurerName = new Map((await tx(ctx, (t) => t.select({ id: insurers.id, name: insurers.name }).from(insurers))).map((i) => [i.id, i.name]));
  return (
    <>
      <PageHeader eyebrow="Care" icon={<Users />} title="Patients"
        subtitle="Find anyone by name, phone, patient number, national ID or insurance member number."
        actions={<LinkButton href="/patients/new"><UserPlus className="h-4 w-4" aria-hidden />Register patient</LinkButton>} />

      <form role="search" className="glass ring-aurora group relative mb-8 flex items-center gap-3 px-5 py-2 animate-rise">
        <Search className="h-5 w-5 shrink-0 text-accent" aria-hidden />
        <input name="q" defaultValue={q} placeholder="Search patients…" autoFocus aria-label="Search patients"
          className="h-12 min-w-0 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-subtle" />
        <span className="hidden items-center gap-1 text-xs text-subtle sm:flex"><Kbd>Enter</Kbd> to search</span>
        {q && <Link href="/patients" className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">Clear</Link>}
      </form>

      <Panel eyebrow={q ? "Search results" : "Recently registered"}
        title={q ? `${rows.length} match${rows.length === 1 ? "" : "es"} for “${q}”` : `${rows.length} newest patients`}
        bodyClassName="p-2 sm:p-3">
        {rows.length === 0 ? (
          <div className="p-3">
            <EmptyState icon={q ? <Search /> : <Users />} title={q ? "No patients match that search" : "No patients yet"}>
              {q ? "Try a phone number or patient number, or register them as a new patient." : "Register your first patient to start booking, queueing and billing."}
              <div className="mt-4"><LinkButton href="/patients/new" size="sm"><UserPlus className="h-3.5 w-3.5" aria-hidden />Register patient</LinkButton></div>
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/patients/${p.id}`}
                  className="group flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-surface-2">
                  <Avatar name={fullName(p)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="truncate font-medium text-fg group-hover:text-accent">{fullName(p)}</span>
                      <span className="font-mono text-xs text-muted">{p.patientNo}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="rounded-md bg-surface-3 px-1.5 py-0.5 capitalize">{p.sex}</span>
                      {age(p.dob) && <span className="rounded-md bg-surface-3 px-1.5 py-0.5 tabular-nums">{age(p.dob)}</span>}
                      {p.phone && <span className="inline-flex items-center gap-1 sm:hidden"><Phone className="h-3 w-3" aria-hidden />{p.phone}</span>}
                    </div>
                  </div>
                  <span className="hidden w-40 items-center gap-1.5 text-sm text-muted tabular-nums md:flex">{p.phone && <><Phone className="h-3.5 w-3.5 text-subtle" aria-hidden />{p.phone}</>}</span>
                  <span className="hidden w-28 lg:block">
                    {p.insurerId ? <Badge tone="teal"><ShieldCheck className="h-3 w-3" aria-hidden />{insurerName.get(p.insurerId) ?? "Insured"}</Badge> : <Badge>Self-pay</Badge>}
                  </span>
                  <span className="hidden w-28 text-right text-xs text-subtle sm:block">{dateOnly(p.createdAt, ctx.tenant.timezone)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
