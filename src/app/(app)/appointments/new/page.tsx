import { eq } from "drizzle-orm";
import { AlertTriangle, CalendarPlus, CreditCard, Stethoscope, Video } from "lucide-react";
import { ActionForm, Submit } from "@/components/form";
import { Avatar, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Textarea } from "@/components/ui";
import { patients, services } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { localDay, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { createAppointmentAction } from "../actions";
import { Choice, StepHeading, Toggle } from "../bits";
import { branchPractitioners } from "../data";
import { practitionerName } from "../lib";
import { PatientChip, PatientSearch } from "../patient-search";

export const metadata = { title: "Book appointment" };

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
  const defaultDoc = keep.practitioner ?? (practitioners.length === 1 ? practitioners[0].id : "");

  return (
    <>
      <PageHeader title="Book appointment" eyebrow={picked ? "Step 2 of 2 · Details" : "Step 1 of 2 · Patient"} icon={<CalendarPlus />}
        subtitle={picked ? "Pick who, what and when. We check for clashes and opening hours." : "Find the patient first, or register someone new."}
        actions={<LinkButton variant="ghost" href={`/appointments${keep.date ? `?date=${keep.date}` : ""}`}>Back to calendar</LinkButton>} />

      {!picked ? (
        <Panel className="mx-auto max-w-3xl" glow title="Who is the appointment for?" eyebrow="Patient">
          <PatientSearch ctx={ctx} q={String(sp.q ?? "").trim()} action="/appointments/new" keep={keep}
            hrefFor={(id) => `/appointments/new?${new URLSearchParams({ ...Object.fromEntries(back), patient: id })}`} />
        </Panel>
      ) : (
        <ActionForm action={createAppointmentAction} onSuccessHref="/appointments/{id}" className="mx-auto max-w-4xl space-y-6">
          <input type="hidden" name="patientId" value={picked.id} />
          <PatientChip p={picked} changeHref={`/appointments/new?${back}`} />
          <Panel>
            <StepHeading n={1} title="Practitioner" hint="Who will see the patient." />
            {practitioners.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {practitioners.map((d) => (
                  <Choice key={d.id} name="practitionerId" value={d.id} defaultChecked={d.id === defaultDoc} required className="p-3">
                    <Avatar name={practitionerName(d)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{practitionerName(d)}</span>
                      <span className="block text-xs text-subtle">Practitioner</span>
                    </span>
                    <span className="h-4 w-4 shrink-0 rounded-full border-2 border-line-strong transition peer-checked:border-[5px] peer-checked:border-accent" aria-hidden />
                  </Choice>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Stethoscope />} title="No practitioners at this branch">Mark staff as practitioners in Settings → Users.</EmptyState>
            )}
          </Panel>

          <Panel>
            <StepHeading n={2} title="Service" hint="Sets the length of the appointment (15 min if none)." />
            <div className="flex flex-wrap gap-2">
              <Choice name="serviceId" value="" defaultChecked className="px-3.5 py-2">
                <span className="text-sm font-medium text-muted">No service</span>
              </Choice>
              {svcs.map((s) => (
                <Choice key={s.id} name="serviceId" value={s.id} className="px-3.5 py-2">
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-fg">{s.name}</span>
                    <span className="flex gap-2 text-[11px] text-muted"><span className="tabular-nums">{s.durationMin} min</span><span className="tabular-nums">{money(s.priceMinor, ctx.tenant.currency)}</span></span>
                  </span>
                </Choice>
              ))}
            </div>
          </Panel>

          <Panel>
            <StepHeading n={3} title="When" hint="Clinic time. Tip: click an empty slot on the calendar to prefill this." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date"><Input type="date" name="date" defaultValue={keep.date ?? localDay(ctx.tenant.timezone)} required className="h-12 text-[15px]" /></Field>
              <Field label="Time"><Input type="time" name="time" step={300} defaultValue={keep.time ?? ""} required className="h-12 text-[15px]" /></Field>
              <Field label="Reason" hint="Optional · up to 500 characters" className="sm:col-span-2"><Textarea name="reason" rows={2} maxLength={500} placeholder="e.g. review, BP check" /></Field>
            </div>
          </Panel>

          <Panel>
            <StepHeading n={4} title="Options" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle name="telehealth" icon={<Video />} label="Video consultation" hint="Creates a telehealth join link" />
              {can(ctx.user.role, "billing.write") && (
                <Toggle name="prepay" icon={<CreditCard />} label="Pay before consult" hint="Creates an invoice for the chosen service" />
              )}
            </div>
          </Panel>

          {/* Action dock: clash / hours errors render directly below it. */}
          <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-solid/85 p-3 shadow-panel backdrop-blur-2xl sm:flex-row sm:items-center">
            <div className="flex-1"><Toggle name="force" tone="warn" icon={<AlertTriangle />} label="Book anyway" hint="Use when a clash, past time or closed hours is OK" /></div>
            <Submit size="lg" className="sm:w-56"><CalendarPlus className="h-4 w-4" aria-hidden /> Book appointment</Submit>
          </div>
          <p className="text-center text-[11px] text-subtle">Reminders are scheduled automatically when you book.</p>
        </ActionForm>
      )}
    </>
  );
}
