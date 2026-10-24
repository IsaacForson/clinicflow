import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Empty, Field, Input, LinkButton, PageHeader, Table, Td, Textarea } from "@/components/ui";
import { labTests, patients, services } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { age, e164, fullName, money } from "@/lib/format";
import { createLabOrderAction } from "../actions";

export default async function NewLabOrderPage({ searchParams }: PageProps<"/lab/new">) {
  const ctx = await requireCtx("lab.result");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const patientId = typeof sp.patient === "string" && /^[0-9a-f-]{36}$/.test(sp.patient) ? sp.patient : null;
  const data = await tx(ctx, async (t) => {
    const [patient] = patientId ? await t.select().from(patients).where(eq(patients.id, patientId)) : [];
    const like = `%${q}%`;
    const phone = /\d{6,}/.test(q.replace(/\D/g, "")) ? e164(q, ctx.tenant.country) : null;
    const found = q && !patient ? await t.select().from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
      ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like), ilike(patients.lastName, like),
      phone ? eq(patients.phone, phone) : undefined,
    ))).limit(20) : [];
    const tests = patient ? await t.select({ test: labTests, price: services.priceMinor }).from(labTests).leftJoin(services, eq(services.id, labTests.serviceId))
      .where(eq(labTests.active, true)).orderBy(labTests.kind, labTests.name) : [];
    return { patient, found, tests };
  });
  const { patient } = data;
  return (
    <>
      <PageHeader title="New lab order" subtitle="For walk-in, lab-only patients. Tests linked to a service are billed on a new invoice." />
      {!patient ? (
        <Card title="1. Find the patient">
          <form className="mb-3"><Input name="q" defaultValue={q} placeholder="Name, phone or patient number…" autoFocus /></form>
          {q && (
            <Table head={["Patient no.", "Name", "Age", "Phone", ""]} empty={<>No match. <Link className="text-brand-800 underline" href="/patients/new">Register the patient</Link> first.</>}>
              {data.found.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.patientNo}</Td><Td>{fullName(p)}</Td><Td>{age(p.dob)}</Td><Td>{p.phone}</Td>
                  <Td className="text-right"><LinkButton className="px-2 py-1 text-xs" href={`/lab/new?patient=${p.id}`}>Select</LinkButton></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ) : (
        <Card title={<>2. Tests for {fullName(patient)} <span className="font-mono text-xs text-slate-500">{patient.patientNo}</span></>} actions={<Link href="/lab/new" className="text-sm text-brand-800 hover:underline">Change patient</Link>}>
          {data.tests.length === 0 ? (
            <Empty title="No tests in the catalogue yet"><Link className="text-brand-800 underline" href="/lab/tests">Add tests</Link></Empty>
          ) : (
            <ActionForm action={createLabOrderAction} onSuccessHref="/lab/{id}">
              <input type="hidden" name="patientId" value={patient.id} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.tests.map(({ test, price }) => (
                  <label key={test.id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 ring-1 ring-slate-200 hover:bg-slate-50">
                    <input type="checkbox" name="testId" value={test.id} className="h-4 w-4" />
                    <span className="flex-1 text-sm">{test.name} {test.kind === "imaging" && <span className="text-xs text-slate-500">(imaging)</span>}</span>
                    <span className="text-xs text-slate-500">{price != null ? money(price, ctx.tenant.currency) : "not billed"}</span>
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="External lab (if sent out)"><Input name="externalLab" /></Field>
                <Field label="Notes"><Textarea name="notes" rows={1} /></Field>
              </div>
              <Submit>Create order</Submit>
            </ActionForm>
          )}
        </Card>
      )}
    </>
  );
}
