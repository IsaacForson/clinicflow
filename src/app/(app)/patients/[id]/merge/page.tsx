import { and, eq, ilike, isNull, ne, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, Input, PageHeader, Table, Td } from "@/components/ui";
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
      <PageHeader title={`Merge duplicates of ${fullName(p)} (${p.patientNo})`} subtitle="All visits, invoices, appointments and documents of the duplicate move to this record. The duplicate is kept as a redirect. This is logged." />
      <Card>
        <form className="mb-3"><Input name="q" defaultValue={q} placeholder="Search another patient…" /></form>
        <Table head={["Patient no.", "Name", "Age", "Phone", ""]} empty="No likely duplicates found. Search above.">
          {candidates.map((c) => (
            <tr key={c.id}>
              <Td className="font-mono text-xs">{c.patientNo}</Td><Td>{fullName(c)}</Td><Td>{age(c.dob)}</Td><Td>{c.phone}</Td>
              <Td>
                <ActionForm action={mergePatientsAction} onSuccessHref={`/patients/${p.id}`}>
                  <input type="hidden" name="fromId" value={c.id} /><input type="hidden" name="intoId" value={p.id} />
                  <Submit variant="danger" className="px-2 py-1 text-xs">Merge into {p.patientNo}</Submit>
                </ActionForm>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
