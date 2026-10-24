import { eq } from "drizzle-orm";
import { AlertTriangle, CalendarClock, CheckCheck, ClipboardCheck, FileSignature, HeartPulse, Hourglass, IdCard, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Dl, EmptyState, LinkButton, PageHeader, Panel } from "@/components/ui";
import { intakeForms, patients } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName } from "@/lib/format";
import { can } from "@/lib/permissions";
import { intakeSchema, parseAllergies } from "@/app/intake/schema";
import { applyIntakeAction } from "../../actions";

export default async function IntakeReviewPage({ params }: PageProps<"/appointments/intake/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("patients.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const row = await tx(ctx, async (t) => {
    const [r] = await t.select({ f: intakeForms, p: patients }).from(intakeForms).innerJoin(patients, eq(patients.id, intakeForms.patientId)).where(eq(intakeForms.id, id));
    if (r) await audit(t, ctx, "view", "intake_form", id, { patientId: r.p.id });
    return r;
  });
  if (!row) notFound();
  const { f, p } = row;
  const tz = ctx.tenant.timezone;
  const parsed = f.data ? intakeSchema.safeParse(JSON.parse(f.data)) : null;
  const d = parsed?.success ? parsed.data : null;
  const yesNo = (v: boolean) => <Badge tone={v ? "green" : "red"}>{v ? "Yes" : "No"}</Badge>;
  const allergies = d ? parseAllergies(d.allergies) : [];

  return (
    <>
      <PageHeader title={fullName(p)} eyebrow="Intake review" icon={<ClipboardCheck />}
        subtitle={f.submittedAt ? `Submitted ${dateTime(f.submittedAt, tz)}` : "Not submitted yet"}
        actions={<>
          <Badge tone={f.status === "reviewed" ? "green" : f.status === "submitted" ? "yellow" : "gray"} pulse={f.status === "submitted"}>{f.status === "reviewed" ? "Applied" : f.status === "submitted" ? "Needs review" : "Awaiting patient"}</Badge>
          {f.appointmentId && <LinkButton variant="ghost" href={`/appointments/${f.appointmentId}`}><CalendarClock className="h-4 w-4" aria-hidden /> Appointment</LinkButton>}
          <LinkButton variant="secondary" href={`/patients/${p.id}`}><UserRound className="h-4 w-4" aria-hidden /> Patient record</LinkButton>
        </>} />
      {!d ? (
        <Panel><EmptyState icon={<Hourglass />} title="Waiting for the patient">They haven&apos;t submitted this form yet. You can send a new link from the appointment.</EmptyState></Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Panel title="Patient details" eyebrow="As entered by the patient" icon={<IdCard />}>
              <Dl items={[
                ["Name", fullName(d)], ["Sex", <span key="s" className="capitalize">{d.sex}</span>], ["Date of birth", d.dob], ["Phone", d.phone],
                ["Email", d.email], ["Occupation", d.occupation], ["Address", d.address],
                ["Emergency contact", [d.emergencyName, d.emergencyPhone].filter(Boolean).join(" · ")],
              ]} />
            </Panel>
            <Panel title="Health information" eyebrow="Self-reported" icon={<HeartPulse />}>
              <div className="space-y-5 text-sm">
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Allergies</div>
                  {allergies.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {allergies.map((a) => (
                        <li key={a.substance} className="inline-flex items-center gap-1.5 rounded-full border border-bad/30 bg-bad/12 px-3 py-1 text-xs font-medium text-bad">
                          <AlertTriangle className="h-3 w-3" aria-hidden />{a.substance}{a.reaction && <span className="font-normal text-fg">— {a.reaction}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-muted">None reported</p>}
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Current medications</div>
                  <p className="whitespace-pre-wrap rounded-xl border border-line bg-surface px-3.5 py-3 text-fg">{d.medications || "—"}</p>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Medical history</div>
                  <p className="whitespace-pre-wrap rounded-xl border border-line bg-surface px-3.5 py-3 text-fg">{d.history || "—"}</p>
                </div>
              </div>
            </Panel>
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Panel title="Consents" eyebrow="Signed" icon={<FileSignature />}>
              <Dl cols={1} items={[["Messages & reminders", yesNo(d.consentMessaging)], ["Data processing", yesNo(d.consentDataProcessing)], ["Treatment", yesNo(d.consentTreatment)]]} />
              {f.signature && (
                // Signature ink is dark, so it always sits on a light "paper" card.
                <div data-theme="light" className="mt-4 rounded-xl border border-line bg-solid p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.signature} alt="Patient signature" className="w-full" />
                </div>
              )}
            </Panel>
            {f.status === "submitted" && ctx.access === "full" && can(ctx.user.role, "patients.write") && (
              <Panel glow>
                <ActionForm action={applyIntakeAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <p className="text-sm text-muted">Updates the patient&apos;s details, adds new allergies, appends medications and history to notes, and records the signed consents.</p>
                  <Submit size="lg" className="w-full"><CheckCheck className="h-4 w-4" aria-hidden /> Apply to patient record</Submit>
                </ActionForm>
              </Panel>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
