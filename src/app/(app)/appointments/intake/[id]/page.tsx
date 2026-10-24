import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Dl, PageHeader } from "@/components/ui";
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

  return (
    <>
      <PageHeader title={`Intake form · ${fullName(p)}`}
        subtitle={f.submittedAt ? `Submitted ${dateTime(f.submittedAt, tz)}` : "Not submitted yet"}
        actions={<>
          <Badge tone={f.status === "reviewed" ? "green" : f.status === "submitted" ? "yellow" : "gray"}>{f.status}</Badge>
          {f.appointmentId && <Link href={`/appointments/${f.appointmentId}`} className="text-sm text-brand-800 underline">Appointment</Link>}
          <Link href={`/patients/${p.id}`} className="text-sm text-brand-800 underline">Patient record</Link>
        </>} />
      {!d ? <Card><p className="text-sm text-slate-500">The patient hasn&apos;t submitted this form yet.</p></Card> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card title="Patient details (as entered)">
              <Dl items={[
                ["Name", fullName(d)], ["Sex", <span key="s" className="capitalize">{d.sex}</span>], ["Date of birth", d.dob], ["Phone", d.phone],
                ["Email", d.email], ["Occupation", d.occupation], ["Address", d.address],
                ["Emergency contact", [d.emergencyName, d.emergencyPhone].filter(Boolean).join(" · ")],
              ]} />
            </Card>
            <Card title="Health information">
              <div className="space-y-3 text-sm">
                <div><div className="font-medium text-slate-700">Allergies</div>
                  {parseAllergies(d.allergies).length ? <ul className="mt-1 list-disc pl-5">{parseAllergies(d.allergies).map((a) => <li key={a.substance}>{a.substance}{a.reaction && ` — ${a.reaction}`}</li>)}</ul> : <p className="text-slate-500">None reported</p>}
                </div>
                <div><div className="font-medium text-slate-700">Current medications</div><p className="whitespace-pre-wrap text-slate-800">{d.medications || "—"}</p></div>
                <div><div className="font-medium text-slate-700">Medical history</div><p className="whitespace-pre-wrap text-slate-800">{d.history || "—"}</p></div>
              </div>
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="Consents">
              <Dl items={[["Messages & reminders", yesNo(d.consentMessaging)], ["Data processing", yesNo(d.consentDataProcessing)], ["Treatment", yesNo(d.consentTreatment)]]} />
              {f.signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.signature} alt="Patient signature" className="mt-3 w-full rounded-md bg-white ring-1 ring-slate-200" />
              )}
            </Card>
            {f.status === "submitted" && ctx.access === "full" && can(ctx.user.role, "patients.write") && (
              <Card>
                <ActionForm action={applyIntakeAction}>
                  <input type="hidden" name="id" value={f.id} />
                  <p className="text-sm text-slate-600">Updates the patient&apos;s details, adds new allergies, appends medications and history to notes, and records the signed consents.</p>
                  <Submit className="w-full py-3">Apply to patient record</Submit>
                </ActionForm>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
