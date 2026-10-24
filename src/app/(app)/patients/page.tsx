import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Card, Input, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { patients } from "@/db/schema";
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
  return (
    <>
      <PageHeader title="Patients" subtitle="Search by name, phone, patient number, national ID or insurance member number."
        actions={<LinkButton href="/patients/new">Register patient</LinkButton>} />
      <Card>
        <form className="mb-3 flex gap-2"><Input name="q" defaultValue={q} placeholder="Search patients…" autoFocus /></form>
        <Table head={["Patient no.", "Name", "Sex / age", "Phone", "Registered"]} empty={q ? "No patients match that search." : "No patients yet."}>
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td className="font-mono text-xs">{p.patientNo}</Td>
              <Td><Link href={`/patients/${p.id}`} className="font-medium text-teal-800 hover:underline">{fullName(p)}</Link></Td>
              <Td className="capitalize">{p.sex} {age(p.dob) && `· ${age(p.dob)}`}</Td>
              <Td>{p.phone}</Td>
              <Td>{dateOnly(p.createdAt, ctx.tenant.timezone)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
