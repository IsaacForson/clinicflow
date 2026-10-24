import { and, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { ArrowRight, GitMerge, Search, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Avatar, Callout, EmptyState, LinkButton, PageHeader, Panel } from "@/components/ui";
import { patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { age, fullName } from "@/lib/format";
import { mergePatientsAction } from "../../actions";

export default async function MergePage({ params, searchParams }: PageProps<"/patients/[id]/merge">) {
  const { id } = await params;
  const q = String((await searchParams).q ?? "");
  const ctx = await requireCtx("patients.merge");
  const { p, candidates } = await tx(ctx, async (t) => {
    const [p] = await t.select().from(patients).where(eq(patients.id, id));
    if (!p) return { p: null, candidates: [] };
    const like = `%${q}%`;
    const candidates = await t.select().from(patients).where(and(ne(patients.id, id), isNull(patients.mergedIntoId), isNull(patients.deletedAt),
      q ? or(ilike(patients.firstName, like), ilike(patients.lastName, like), ilike(patients.patientNo, like), ilike(patients.phone, like))
        : or(and(eq(patients.lastName, p.lastName), eq(patients.firstName, p.firstName)), p.phone ? eq(patients.phone, p.phone) : undefined, p.dob ? and(eq(patients.dob, p.dob), eq(patients.lastName, p.lastName)) : undefined),
    )).limit(20);
    return { p, candidates };
  });
  if (!p) notFound();
  return (
    <>
      <PageHeader eyebrow={`Patient · ${p.patientNo}`} icon={<GitMerge />} title="Merge duplicates"
        subtitle={`Fold duplicate records into ${fullName(p)}.`}
        actions={<LinkButton variant="ghost" href={`/patients/${p.id}`}>Back to patient</LinkButton>} />

      <div className="mb-6">
        <Callout tone="yellow" icon={<TriangleAlert />}>
          All visits, invoices, appointments and documents of the duplicate move to this record. The duplicate is kept as a redirect. This is logged.
        </Callout>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel eyebrow="Keep this record" glow className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-4">
            <Avatar name={fullName(p)} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-fg">{fullName(p)}</div>
              <div className="font-mono text-xs text-muted">{p.patientNo}</div>
              <div className="mt-1 text-xs capitalize text-muted">{[p.sex, age(p.dob), p.phone].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        </Panel>

        <Panel eyebrow={q ? "Search results" : "Likely duplicates"} title={`${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}>
          <form role="search" className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input name="q" defaultValue={q} placeholder="Search another patient by name, number or phone…" aria-label="Search another patient"
              className="h-11 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3.5 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent focus:ring-4 focus:ring-accent/15" />
          </form>
          {candidates.length === 0 ? (
            <EmptyState icon={<GitMerge />} title="No likely duplicates found">Search above by name, patient number or phone.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 sm:flex-nowrap">
                  <Avatar name={fullName(c)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{fullName(c)}</div>
                    <div className="text-xs text-muted"><span className="font-mono">{c.patientNo}</span>{[age(c.dob), c.phone].filter(Boolean).map((x) => ` · ${x}`).join("")}</div>
                  </div>
                  <ActionForm action={mergePatientsAction} onSuccessHref={`/patients/${p.id}`} className="space-y-2">
                    <input type="hidden" name="fromId" value={c.id} /><input type="hidden" name="intoId" value={p.id} />
                    <Submit variant="danger" size="sm">Merge into {p.patientNo}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Submit>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
