import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { ArrowLeft, Bell, HeartPulse, Search, Target, UserPlus } from "lucide-react";
import { A, Avatar, Check, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select } from "@/components/ui";
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
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={<HeartPulse />} eyebrow="Chronic care" title="Enroll in chronic care"
        subtitle={patient ? "Set the check-up rhythm and the targets the clinician wants to track." : "Find the patient to enroll."}
        actions={<LinkButton variant="ghost" href="/care"><ArrowLeft className="h-4 w-4" />Care centre</LinkButton>} />
      {!patient ? (
        <Panel icon={<Search />} eyebrow="Step 1" title="Find the patient">
          <form className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Name, patient number or phone…" autoFocus className="h-12 pl-10 text-base" aria-label="Search patients" />
          </form>
          {!q ? <p className="py-6 text-center text-sm text-muted">Type a name, patient number or phone and press Enter.</p>
            : matches.length === 0 ? <EmptyState icon={<UserPlus />} title="No patients match"><A href="/patients/new">Register the patient</A> first.</EmptyState> : (
            <ul className="space-y-1">
              {matches.map((p) => (
                <li key={p.id}>
                  <Link href={`/care/new?patient=${p.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2">
                    <Avatar name={fullName(p)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{fullName(p)}</div>
                      <div className="truncate text-xs text-muted"><span className="font-mono">{p.patientNo}</span>{p.phone && ` · ${p.phone}`}</div>
                    </div>
                    <span className="text-xs font-medium text-accent">Select →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <ActionForm action={enrollAction} onSuccessHref="/care/{id}" className="space-y-4">
          <input type="hidden" name="patientId" value={patient.id} />
          <div className="glass flex items-center gap-4 p-4 animate-rise">
            <Avatar name={fullName(patient)} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-fg">{fullName(patient)}</div>
              <div className="font-mono text-xs text-muted">{patient.patientNo}</div>
            </div>
            <LinkButton variant="ghost" size="sm" href="/care/new">Change</LinkButton>
          </div>
          <Panel eyebrow="Plan" title="Condition & check-ups" icon={<HeartPulse />}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Condition">
                <Select name="condition" defaultValue="hypertension">
                  <option value="hypertension">Hypertension</option><option value="diabetes">Diabetes</option><option value="asthma">Asthma</option><option value="hiv">HIV</option><option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Check-up every (days)"><Input name="intervalDays" type="number" min={1} max={365} defaultValue={30} /></Field>
              <Field label="First check-up" hint="Defaults to one interval from today"><Input name="firstDue" type="date" /></Field>
            </div>
          </Panel>
          <Panel eyebrow="Optional" title="Targets set by the clinician" icon={<Target />}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="BP systolic below"><Input name="bpSys" type="number" placeholder="140" /></Field>
              <Field label="BP diastolic below"><Input name="bpDia" type="number" placeholder="90" /></Field>
              <Field label="Glucose below (mmol/L)"><Input name="glucose" type="number" step="0.1" placeholder="7.0" /></Field>
            </div>
          </Panel>
          <Panel eyebrow="Adherence" title="Medication reminder" icon={<Bell />}>
            <div className="flex flex-wrap items-end gap-6">
              <Check name="adherenceNudges" defaultChecked label="Daily medication reminder" className="h-10" />
              <Field label="Reminder time"><Input name="nudgeTime" type="time" defaultValue="08:00" /></Field>
            </div>
          </Panel>
          <div className="flex justify-end"><Submit size="lg">Enroll patient</Submit></div>
        </ActionForm>
      )}
    </div>
  );
}
