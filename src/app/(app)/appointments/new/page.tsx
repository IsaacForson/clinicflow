import { eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { patients, services } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { fullName, localDay, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { createAppointmentAction } from "../actions";
import { branchPractitioners } from "../data";
import { practitionerName } from "../lib";
import { PatientSearch } from "../patient-search";

export const metadata = { title: "Book appointment · ClinicFlow" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewAppointmentPage({ searchParams }: PageProps<"/appointments/new">) {
  const ctx = await requireCtx("appointments.manage");
  const sp = await searchParams;
  const patientId = str(sp.patient);
  const keep = { practitioner: str(sp.practitioner), date: str(sp.date), time: str(sp.time) };
  const { picked, practitioners, svcs } = await tx(ctx, async (t) => ({
    picked: patientId && UUID.test(patientId) ? (await t.select().from(patients).where(eq(patients.id, patientId)))[0] : undefined,
    practitioners: await branchPractitioners(t, ctx),
    svcs: await t.select().from(services).where(eq(services.active, true)).orderBy(services.category, services.name),
  }));
  const back = new URLSearchParams(Object.entries(keep).filter((e): e is [string, string] => !!e[1]));

  return (
    <>
      <PageHeader title="Book appointment" />
      <Card className="max-w-3xl">
        {!picked ? (
          <PatientSearch ctx={ctx} q={String(sp.q ?? "").trim()} action="/appointments/new" keep={keep}
            hrefFor={(id) => `/appointments/new?${new URLSearchParams({ ...Object.fromEntries(back), patient: id })}`} />
        ) : (
          <ActionForm action={createAppointmentAction} onSuccessHref="/appointments/{id}">
            <input type="hidden" name="patientId" value={picked.id} />
            <div className="flex items-center justify-between rounded-md bg-teal-50 px-3 py-2">
              <span className="font-medium text-teal-900">{fullName(picked)} <span className="text-xs text-teal-700">{picked.patientNo} {picked.phone && `· ${picked.phone}`}</span></span>
              <Link href={`/appointments/new?${back}`} className="text-sm text-teal-800 underline">Change</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Practitioner">
                <Select name="practitionerId" defaultValue={keep.practitioner ?? (practitioners.length === 1 ? practitioners[0].id : "")} required>
                  <option value="" disabled>Choose…</option>
                  {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                </Select>
              </Field>
              <Field label="Service" hint="Sets the length of the appointment (15 min if none).">
                <Select name="serviceId" defaultValue="">
                  <option value="">—</option>
                  {svcs.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {money(s.priceMinor, ctx.tenant.currency)}</option>)}
                </Select>
              </Field>
              <Field label="Date"><Input type="date" name="date" defaultValue={keep.date ?? localDay(ctx.tenant.timezone)} required /></Field>
              <Field label="Time"><Input type="time" name="time" step={300} defaultValue={keep.time ?? ""} required /></Field>
              <Field label="Reason" className="sm:col-span-2"><Textarea name="reason" rows={2} maxLength={500} placeholder="e.g. review, BP check" /></Field>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-slate-50 p-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="telehealth" className="h-4 w-4" /> Video consultation (telehealth)</label>
              {can(ctx.user.role, "billing.write") && <label className="flex items-center gap-2"><input type="checkbox" name="prepay" className="h-4 w-4" /> Payment before consult (creates invoice)</label>}
              <label className="flex items-center gap-2 text-slate-500"><input type="checkbox" name="force" className="h-4 w-4" /> Book anyway if the slot is taken</label>
            </div>
            <Submit className="px-6 py-3">Book appointment</Submit>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
