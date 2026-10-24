import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { enrollAction } from "../actions";

export const metadata = { title: "Enroll in chronic care" };

export default async function EnrollPage({ searchParams }: PageProps<"/care/new">) {
  const ctx = await requireCtx("clinical.write");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const patientId = typeof sp.patient === "string" && /^[0-9a-f-]{36}$/i.test(sp.patient) ? sp.patient : null;
  const { patient, matches } = await tx(ctx, async (t) => {
    const [patient] = patientId ? await t.select().from(patients).where(eq(patients.id, patientId)) : [];
    const like = `%${q}%`;
    const matches = !patient && q ? await t.select().from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
      ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like), ilike(patients.phone, like),
    ))).limit(20) : [];
    return { patient, matches };
  });

  return (
    <>
      <PageHeader title="Enroll in chronic care" />
      {!patient ? (
        <Card title="Find the patient">
          <form className="mb-3"><Input name="q" defaultValue={q} placeholder="Name, patient number or phone…" autoFocus /></form>
          <ul className="divide-y divide-slate-100 text-sm">
            {matches.map((p) => <li key={p.id} className="py-2"><Link className="font-medium text-teal-800 hover:underline" href={`/care/new?patient=${p.id}`}>{fullName(p)}</Link> <span className="text-slate-500">{p.patientNo} · {p.phone}</span></li>)}
            {q && matches.length === 0 && <li className="py-2 text-slate-500">No patients match.</li>}
          </ul>
        </Card>
      ) : (
        <Card title={`Care plan for ${fullName(patient)} (${patient.patientNo})`} className="max-w-2xl">
          <ActionForm action={enrollAction} onSuccessHref="/care/{id}">
            <input type="hidden" name="patientId" value={patient.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Condition">
                <Select name="condition" defaultValue="hypertension">
                  <option value="hypertension">Hypertension</option><option value="diabetes">Diabetes</option><option value="asthma">Asthma</option><option value="hiv">HIV</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Check-up every (days)"><Input name="intervalDays" type="number" min={1} max={365} defaultValue={30} /></Field>
              <Field label="First check-up" hint="Defaults to one interval from today"><Input name="firstDue" type="date" /></Field>
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-1 text-sm font-medium text-slate-700">Targets set by the clinician (optional)</legend>
              <Field label="BP systolic below"><Input name="bpSys" type="number" placeholder="140" /></Field>
              <Field label="BP diastolic below"><Input name="bpDia" type="number" placeholder="90" /></Field>
              <Field label="Glucose below (mmol/L)"><Input name="glucose" type="number" step="0.1" placeholder="7.0" /></Field>
            </fieldset>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="adherenceNudges" defaultChecked className="h-4 w-4" /> Daily medication reminder</label>
              <Field label="Reminder time"><Input name="nudgeTime" type="time" defaultValue="08:00" /></Field>
            </div>
            <Submit>Enroll</Submit>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
