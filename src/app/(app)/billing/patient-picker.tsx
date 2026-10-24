import { and, ilike, isNull, or, sql } from "drizzle-orm";
import { ChevronRight, Search, UserSearch } from "lucide-react";
import { Avatar, EmptyState, Input, ListRow, Panel } from "@/components/ui";
import { patients } from "@/db/schema";
import { type Ctx, tx } from "@/lib/auth";
import { fullName } from "@/lib/format";

/** Search box + results linking to `${href}?patient=<id>`. */
export async function PatientPicker({ ctx, q, href }: { ctx: Ctx; q: string; href: string }) {
  const like = `%${q}%`;
  const rows = q ? await tx(ctx, (t) => t.select().from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
    ilike(patients.patientNo, like), ilike(patients.phone, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like),
  ))).orderBy(patients.lastName).limit(20)) : [];
  return (
    <Panel title="Who is this for?" eyebrow="Step 1 · Choose patient" icon={<UserSearch />} className="mx-auto max-w-2xl" glow>
      <form className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input name="q" defaultValue={q} placeholder="Name, phone or patient number…" autoFocus className="h-12 pl-10 text-base" aria-label="Search patients" />
      </form>
      {!q ? (
        <EmptyState icon={<Search />} title="Search to begin" compact>Type a name, phone number or patient number and press Enter.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={<UserSearch />} title={`No patients match “${q}”`} compact>Check the spelling, or search by phone number.</EmptyState>
      ) : (
        <div className="-mx-2 space-y-0.5">
          {rows.map((p) => (
            <ListRow key={p.id} href={`${href}?patient=${p.id}`} leading={<Avatar name={fullName(p)} />} title={fullName(p)}
              meta={<><span className="font-mono">{p.patientNo}</span>{p.phone && ` · ${p.phone}`}</>}
              trailing={<ChevronRight className="h-4 w-4 text-subtle" aria-hidden />} />
          ))}
        </div>
      )}
    </Panel>
  );
}
