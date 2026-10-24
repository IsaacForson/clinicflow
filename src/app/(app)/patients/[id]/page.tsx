import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Dl, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import {
  allergies, appointments, consents, documents, guardians, insurers, invoices, patients, users, visits, vitals,
} from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { patientCredit } from "@/lib/billing";
import { age, dateOnly, dateTime, fullName, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addAllergyAction, addGuardianAction, recordConsentAction, removeAllergyAction, uploadDocumentAction } from "../actions";

export default async function PatientPage({ params }: PageProps<"/patients/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("patients.read");
  const data = await tx(ctx, async (t) => {
    const [p] = await t.select().from(patients).where(eq(patients.id, id));
    if (!p) return null;
    if (p.mergedIntoId) return { mergedInto: p.mergedIntoId } as const;
    await audit(t, ctx, "view", "patient", id, { patientId: id });
    const clinical = can(ctx.user.role, "clinical.read");
    const [ins] = p.insurerId ? await t.select().from(insurers).where(eq(insurers.id, p.insurerId)) : [];
    return {
      p, insurer: ins ?? null,
      allergies: await t.select().from(allergies).where(eq(allergies.patientId, id)),
      guardians: await t.select().from(guardians).where(eq(guardians.patientId, id)),
      consents: await t.select().from(consents).where(eq(consents.patientId, id)).orderBy(desc(consents.createdAt)),
      documents: await t.select().from(documents).where(eq(documents.patientId, id)).orderBy(desc(documents.createdAt)),
      visits: clinical ? await t.select({ v: visits, doctor: users.name }).from(visits).leftJoin(users, eq(users.id, visits.practitionerId)).where(eq(visits.patientId, id)).orderBy(desc(visits.startedAt)).limit(20) : [],
      lastVitals: clinical ? (await t.select().from(vitals).where(eq(vitals.patientId, id)).orderBy(desc(vitals.recordedAt)).limit(1))[0] : undefined,
      appts: await t.select({ a: appointments, doctor: users.name }).from(appointments).leftJoin(users, eq(users.id, appointments.practitionerId)).where(eq(appointments.patientId, id)).orderBy(desc(appointments.startsAt)).limit(10),
      invoices: can(ctx.user.role, "billing.read") ? await t.select().from(invoices).where(eq(invoices.patientId, id)).orderBy(desc(invoices.createdAt)).limit(10) : [],
      credit: await patientCredit(t, id),
      insurers: await t.select({ id: insurers.id, name: insurers.name }).from(insurers).where(eq(insurers.active, true)),
      relatives: await t.select({ id: patients.id, firstName: patients.firstName, lastName: patients.lastName }).from(patients).where(and(eq(patients.phone, p.phone ?? "__none__"), isNull(patients.mergedIntoId))).limit(10),
    };
  });
  if (!data) notFound();
  if ("mergedInto" in data) redirect(`/patients/${data.mergedInto}`);
  const { p } = data;
  const tz = ctx.tenant.timezone;
  const cur = ctx.tenant.currency;
  const write = can(ctx.user.role, "patients.write") && ctx.access === "full";
  const latestConsent = (type: string) => data.consents.find((c) => c.type === type);
  const msg = latestConsent("messaging");

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{fullName(p)} <Badge tone="gray">{p.patientNo}</Badge></span>}
        subtitle={<span className="capitalize">{[p.sex, age(p.dob), p.phone, data.insurer ? `${data.insurer.name} ${p.memberNo ?? ""}` : "Self-pay"].filter(Boolean).join(" · ")}</span>}
        actions={<>
          {can(ctx.user.role, "clinical.write") && <LinkButton href={`/visits/new?patient=${p.id}`}>Start consultation</LinkButton>}
          {can(ctx.user.role, "queue.manage") && <LinkButton variant={can(ctx.user.role, "clinical.write") ? "secondary" : "primary"} href={`/queue?patient=${p.id}`}>Add to queue</LinkButton>}
          {can(ctx.user.role, "appointments.manage") && <LinkButton variant="secondary" href={`/appointments/new?patient=${p.id}`}>Book appointment</LinkButton>}
          {can(ctx.user.role, "billing.write") && <LinkButton variant="secondary" href={`/billing/new?patient=${p.id}`}>New invoice</LinkButton>}
          {write && <LinkButton variant="secondary" href={`/patients/${p.id}/edit`}>Edit</LinkButton>}
          {can(ctx.user.role, "patients.merge") && <LinkButton variant="ghost" href={`/patients/${p.id}/merge`}>Merge duplicate</LinkButton>}
        </>}
      />
      {data.allergies.length > 0 && (
        <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">
          <strong>Allergies:</strong> {data.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ")}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Details">
            <Dl items={[
              ["Date of birth", p.dob ? `${dateOnly(p.dob, "UTC")} (${age(p.dob)})` : null], ["Blood group", p.bloodGroup],
              ["Phone", p.phone], ["Alt. phone", p.altPhone], ["Email", p.email], ["National ID", p.nationalId ? "•••• " + p.nationalId.slice(-4) : null],
              ["Address", p.address], ["Occupation", p.occupation], ["Emergency contact", [p.emergencyName, p.emergencyPhone].filter(Boolean).join(" · ")],
              ["Insurance", data.insurer ? `${data.insurer.name} · ${p.memberNo ?? "no member no."}${p.insuranceExpiry ? ` · exp ${p.insuranceExpiry}` : ""}` : "Self-pay"],
              ["Account credit", data.credit ? money(data.credit, cur) : null], ["Messages", `${p.preferredChannel}${msg ? (msg.granted && !msg.revokedAt ? " · consented" : " · opted out") : " · consent not recorded"}`],
            ]} />
            {p.notes && <p className="mt-3 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm text-slate-700">{p.notes}</p>}
          </Card>

          {can(ctx.user.role, "clinical.read") && (
            <Card title="Consultations" actions={data.lastVitals && <span className="text-xs text-slate-500">Last vitals {dateOnly(data.lastVitals.recordedAt, tz)}: BP {data.lastVitals.bpSys ?? "–"}/{data.lastVitals.bpDia ?? "–"}, T {data.lastVitals.tempC ?? "–"}°C, Wt {data.lastVitals.weightKg ?? "–"}kg</span>}>
              <Table head={["Date", "Practitioner", "Complaint", "Status"]} empty="No consultations yet.">
                {data.visits.map(({ v, doctor }) => (
                  <tr key={v.id}>
                    <Td><Link className="text-teal-800 hover:underline" href={`/visits/${v.id}`}>{dateTime(v.startedAt, tz)}</Link></Td>
                    <Td>{doctor}</Td><Td className="max-w-xs truncate">{v.complaint}</Td>
                    <Td><Badge tone={v.status === "signed" ? "green" : "yellow"}>{v.status}</Badge></Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Card title="Appointments">
            <Table head={["When", "With", "Status"]} empty="No appointments.">
              {data.appts.map(({ a, doctor }) => (
                <tr key={a.id}><Td>{dateTime(a.startsAt, tz)}</Td><Td>{doctor}</Td><Td><Badge>{a.status.replace("_", " ")}</Badge></Td></tr>
              ))}
            </Table>
          </Card>

          {can(ctx.user.role, "billing.read") && (
            <Card title="Invoices">
              <Table head={["Invoice", "Date", "Total", "Balance", "Status"]} empty="No invoices.">
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <Td><Link className="font-mono text-xs text-teal-800 hover:underline" href={`/billing/${i.id}`}>{i.invoiceNo}</Link></Td>
                    <Td>{dateOnly(i.createdAt, tz)}</Td><Td>{money(i.totalMinor, cur)}</Td>
                    <Td>{money(i.patientPortionMinor - i.paidMinor, cur)}</Td><Td><Badge>{i.status.replace("_", " ")}</Badge></Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Allergies">
            <ul className="mb-3 space-y-1 text-sm">
              {data.allergies.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span><strong>{a.substance}</strong> {a.reaction && `– ${a.reaction}`} <Badge tone={a.severity === "severe" ? "red" : "yellow"}>{a.severity}</Badge></span>
                  {write && <ActionButton action={removeAllergyAction} fields={{ id: a.id, patientId: p.id }} variant="ghost" confirm="Remove this allergy?">Remove</ActionButton>}
                </li>
              ))}
              {data.allergies.length === 0 && <li className="text-slate-500">No known allergies recorded.</li>}
            </ul>
            {write && (
              <ActionForm action={addAllergyAction} resetOnSuccess className="space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="patientId" value={p.id} />
                <Input name="substance" placeholder="Substance (e.g. Penicillin)" required />
                <div className="flex gap-2">
                  <Input name="reaction" placeholder="Reaction" />
                  <Select name="severity" defaultValue="moderate" className="w-32"><option>mild</option><option>moderate</option><option>severe</option></Select>
                </div>
                <Submit variant="secondary">Add allergy</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title="Guardians & family">
            <ul className="mb-3 space-y-1 text-sm">
              {data.guardians.map((g) => (
                <li key={g.id}>{g.guardianPatientId ? <Link href={`/patients/${g.guardianPatientId}`} className="text-teal-800 hover:underline">{g.name}</Link> : g.name} <span className="text-slate-500">({g.relationship}) {g.phone}</span></li>
              ))}
              {data.guardians.length === 0 && <li className="text-slate-500">None recorded.</li>}
            </ul>
            {write && (
              <ActionForm action={addGuardianAction} resetOnSuccess className="space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="patientId" value={p.id} />
                <Input name="name" placeholder="Name" required />
                <div className="flex gap-2"><Input name="relationship" placeholder="Relationship" required /><Input name="phone" placeholder="Phone" /></div>
                {data.relatives.filter((r) => r.id !== p.id).length > 0 && (
                  <Select name="guardianPatientId" defaultValue=""><option value="">Link to existing patient (same phone)…</option>
                    {data.relatives.filter((r) => r.id !== p.id).map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}
                  </Select>
                )}
                <Submit variant="secondary">Add</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title="Consent">
            <ul className="mb-3 space-y-1 text-sm">
              {["messaging", "data_processing", "portal", "ai_scribe", "telehealth", "treatment"].map((type) => {
                const c = latestConsent(type);
                return <li key={type} className="flex justify-between"><span className="capitalize">{type.replace("_", " ")}</span>
                  {c ? <Badge tone={c.granted && !c.revokedAt ? "green" : "red"}>{c.granted && !c.revokedAt ? "granted" : "declined"} · {c.method}</Badge> : <span className="text-slate-400">not recorded</span>}</li>;
              })}
            </ul>
            {write && (
              <ActionForm action={recordConsentAction} className="space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="patientId" value={p.id} />
                <Select name="type"><option value="messaging">Messaging</option><option value="data_processing">Data processing</option><option value="portal">Patient portal</option><option value="ai_scribe">AI scribe recording</option><option value="telehealth">Telehealth</option><option value="treatment">Treatment</option></Select>
                <div className="flex gap-2">
                  <Select name="granted"><option value="yes">Granted</option><option value="no">Declined / withdrawn</option></Select>
                  <Select name="method"><option value="verbal">Verbal</option><option value="signature">Signature</option><option value="form">Form</option><option value="whatsapp">WhatsApp</option></Select>
                </div>
                <Submit variant="secondary">Record consent</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title="Documents">
            <ul className="mb-3 space-y-1 text-sm">
              {data.documents.map((d) => (
                <li key={d.id} className="flex justify-between gap-2"><a href={`/api/files/${d.id}`} target="_blank" className="truncate text-teal-800 hover:underline">{d.name}</a><span className="shrink-0 text-xs text-slate-500">{d.category.replace("_", " ")}</span></li>
              ))}
              {data.documents.length === 0 && <li className="text-slate-500">No documents.</li>}
            </ul>
            {write && (
              <ActionForm action={uploadDocumentAction} resetOnSuccess className="space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="patientId" value={p.id} />
                <Field label="File"><input type="file" name="file" required accept="image/*,application/pdf,text/plain,text/csv" className="block w-full text-sm" /></Field>
                <Select name="category"><option value="other">Other</option><option value="lab_result">Lab result</option><option value="imaging">Imaging</option><option value="referral">Referral</option><option value="id">ID document</option><option value="photo">Patient photo</option></Select>
                <Submit variant="secondary">Upload</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
