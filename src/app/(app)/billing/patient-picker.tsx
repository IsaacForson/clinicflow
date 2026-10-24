import { and, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Card, Input, Table, Td } from "@/components/ui";
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
    <Card title="Choose patient">
      <form className="mb-3"><Input name="q" defaultValue={q} placeholder="Name, phone or patient number…" autoFocus /></form>
      {q && (
        <Table head={["Patient no.", "Name", "Phone"]} empty="No patients match.">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td className="font-mono text-xs">{p.patientNo}</Td>
              <Td><Link className="font-medium text-teal-800 hover:underline" href={`${href}?patient=${p.id}`}>{fullName(p)}</Link></Td>
              <Td>{p.phone}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
