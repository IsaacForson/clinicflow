import { and, desc, eq, inArray, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import {
  allergies, consents, diagnoses, insurers, invoiceLines, invoices, items, labOrderItems, labOrders, labTests, patients,
  prescriptionItems, prescriptions, referrals, services, users, visitRevisions, visits, vitals,
} from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { bmi, drugLabel, getTemplate } from "@/lib/clinical-templates";
import { age, dateOnly, dateTime, fullName, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/plans";
import { scribeBlockReason } from "@/lib/scribe";
import { NOTE_FIELDS } from "@/lib/visits";
import {
  addAddendumAction, addChargeAction, addDiagnosisAction, addPrescriptionAction, addReferralAction, orderLabsAction,
  saveVitalsAction, updateDiagnosisAction,
} from "../actions";
import { IcdPicker } from "./icd-picker";
import { NoteEditor } from "./note-editor";
import { RxLines } from "./rx-lines";

export const metadata = { title: "Consultation" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Vitals = typeof vitals.$inferSelect;
const vitalsLine = (v: Vitals) => [
  v.tempC != null && `T ${v.tempC}°C`, v.pulse != null && `P ${v.pulse}`, v.respRate != null && `RR ${v.respRate}`,
  (v.bpSys != null || v.bpDia != null) && `BP ${v.bpSys ?? "–"}/${v.bpDia ?? "–"}`, v.spo2 != null && `SpO₂ ${v.spo2}%`,
  v.weightKg != null && `Wt ${v.weightKg}kg`, v.heightCm != null && `Ht ${v.heightCm}cm`,
  bmi(v.weightKg, v.heightCm) != null && `BMI ${bmi(v.weightKg, v.heightCm)}`, v.glucose != null && `Glu ${v.glucose} mmol/L`,
].filter(Boolean).join(" · ");

export default async function VisitPage({ params }: PageProps<"/visits/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("clinical.read");
  if (!UUID.test(id)) notFound();
  const role = ctx.user.role;
  const data = await tx(ctx, async (t) => {
    const [v] = await t.select().from(visits).where(eq(visits.id, id));
    if (!v) return null;
    await audit(t, ctx, "view", "visit", id, { patientId: v.patientId });
    const [p] = await t.select().from(patients).where(eq(patients.id, v.patientId));
    const rxs = await t.select().from(prescriptions).where(eq(prescriptions.visitId, id)).orderBy(desc(prescriptions.createdAt));
    const orders = await t.select().from(labOrders).where(eq(labOrders.visitId, id)).orderBy(desc(labOrders.createdAt));
    const invs = await t.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.visitId, id), ne(invoices.status, "void")));
    const prev = await t.select().from(visits).where(and(eq(visits.patientId, v.patientId), ne(visits.id, id))).orderBy(desc(visits.startedAt)).limit(10);
    const staff = await t.select({ id: users.id, name: users.name, title: users.title }).from(users);
    const [consent] = await t.select().from(consents).where(and(eq(consents.patientId, v.patientId), eq(consents.type, "ai_scribe"))).orderBy(desc(consents.createdAt)).limit(1);
    const [ins] = p.insurerId ? await t.select({ name: insurers.name }).from(insurers).where(eq(insurers.id, p.insurerId)) : [];
    return {
      v, p, consent, insurer: ins?.name ?? null, rxs, orders, prev,
      staff: new Map(staff.map((s) => [s.id, [s.title, s.name].filter(Boolean).join(" ")])),
      allergies: await t.select().from(allergies).where(eq(allergies.patientId, v.patientId)),
      lastVitals: (await t.select().from(vitals).where(eq(vitals.patientId, v.patientId)).orderBy(desc(vitals.recordedAt)).limit(1))[0],
      visitVitals: await t.select().from(vitals).where(eq(vitals.visitId, id)).orderBy(desc(vitals.recordedAt)),
      diagnoses: await t.select().from(diagnoses).where(eq(diagnoses.visitId, id)).orderBy(desc(diagnoses.isPrimary), diagnoses.createdAt),
      rxItems: rxs.length ? await t.select().from(prescriptionItems).where(inArray(prescriptionItems.prescriptionId, rxs.map((r) => r.id))) : [],
      referrals: await t.select().from(referrals).where(eq(referrals.visitId, id)).orderBy(desc(referrals.createdAt)),
      orderItems: orders.length ? await t.select().from(labOrderItems).where(inArray(labOrderItems.orderId, orders.map((o) => o.id))) : [],
      lines: invs.length ? await t.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, invs.map((i) => i.id))) : [],
      services: await t.select().from(services).where(eq(services.active, true)).orderBy(services.category, services.name),
      tests: await t.select().from(labTests).where(eq(labTests.active, true)).orderBy(labTests.kind, labTests.name),
      drugs: await t.select().from(items).where(and(eq(items.isDrug, true), eq(items.active, true))).orderBy(desc(items.favorite), items.name),
      prevDiagnoses: prev.length ? await t.select().from(diagnoses).where(and(inArray(diagnoses.visitId, prev.map((x) => x.id)), eq(diagnoses.isPrimary, true))) : [],
      revisions: await t.select().from(visitRevisions).where(eq(visitRevisions.visitId, id)).orderBy(desc(visitRevisions.version)),
    };
  });
  if (!data) notFound();
  const { v, p } = data;
  const tz = ctx.tenant.timezone;
  const cur = ctx.tenant.currency;
  const full = ctx.access === "full";
  const open = v.status === "open";
  const write = open && full && can(role, "clinical.write");
  const tpl = getTemplate(v.template);
  const scribeReason = scribeBlockReason(ctx.user, ctx.tenant)
    ?? (data.consent?.granted && !data.consent.revokedAt ? null : "record the patient's AI scribe consent on the patient page first.");
  const name = (uid: string | null) => (uid ? data.staff.get(uid) ?? "—" : "—");

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2"><Link href={`/patients/${p.id}`} className="hover:underline">{fullName(p)}</Link> <Badge>{p.patientNo}</Badge> <Badge tone={open ? "yellow" : "green"}>{v.status}</Badge></span>}
        subtitle={<span className="capitalize">{[p.sex, age(p.dob), p.bloodGroup && `Blood ${p.bloodGroup}`, data.insurer ?? "Self-pay", `${tpl.label} consultation`, dateTime(v.startedAt, tz), name(v.practitionerId)].filter(Boolean).join(" · ")}</span>}
        actions={<LinkButton variant="secondary" href={`/patients/${p.id}`}>Patient record</LinkButton>}
      />
      <div role="alert" className={data.allergies.length ? "mb-3 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200" : "mb-3 rounded-md bg-slate-50 px-4 py-2 text-sm text-slate-600"}>
        <strong>Allergies:</strong> {data.allergies.length
          ? data.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}${a.severity === "severe" ? " – SEVERE" : ""}`).join(", ")
          : "none recorded"}
      </div>
      {data.lastVitals && (
        <p className="mb-4 text-sm text-slate-600"><strong>Last vitals</strong> ({dateTime(data.lastVitals.recordedAt, tz)}): {vitalsLine(data.lastVitals) || "—"}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Consultation note">
            {open && can(role, "clinical.write") && full ? (
              <NoteEditor visitId={v.id} version={v.version} template={v.template} extra={v.extra}
                note={Object.fromEntries(NOTE_FIELDS.map((f) => [f, v[f] ?? ""])) as Record<(typeof NOTE_FIELDS)[number], string>}
                canSign={can(role, "clinical.sign")} followUpDate={v.followUpDate}
                scribe={{ allowed: !scribeReason, reason: can(role, "scribe.use") ? scribeReason ?? undefined : undefined }} />
            ) : (
              <div className="space-y-3 text-sm">
                {v.status === "signed" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">Signed by {name(v.signedBy)} on {dateTime(v.signedAt, tz)}{v.followUpDate && ` · follow-up ${dateOnly(v.followUpDate, "UTC")}`}</p>}
                {NOTE_FIELDS.map((f) => (
                  <div key={f}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{f}</div><p className="whitespace-pre-wrap text-slate-800">{v[f] || "—"}</p></div>
                ))}
                {tpl.fields.filter((f) => v.extra[f.key]).map((f) => (
                  <div key={f.key}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{f.label}</div><p className="whitespace-pre-wrap text-slate-800">{v.extra[f.key]}</p></div>
                ))}
                {v.status === "signed" && full && can(role, "clinical.write") && (
                  <ActionForm action={addAddendumAction} resetOnSuccess className="border-t border-slate-100 pt-3">
                    <input type="hidden" name="visitId" value={v.id} />
                    <Field label="Addendum (appended to the plan with your name and the time)"><Textarea name="text" required /></Field>
                    <Submit variant="secondary">Add addendum</Submit>
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          <Card title="Diagnoses">
            <ul className="mb-3 space-y-1 text-sm">
              {data.diagnoses.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span>{d.icd10Code && <span className="mr-2 font-mono text-xs text-slate-500">{d.icd10Code}</span>}{d.description} {d.isPrimary && <Badge tone="teal">primary</Badge>}</span>
                  {write && (
                    <span className="flex gap-1">
                      {!d.isPrimary && <ActionButton action={updateDiagnosisAction} fields={{ id: d.id, visitId: v.id, op: "primary" }} variant="ghost">Make primary</ActionButton>}
                      <ActionButton action={updateDiagnosisAction} fields={{ id: d.id, visitId: v.id, op: "remove" }} variant="ghost" confirm="Remove this diagnosis?">Remove</ActionButton>
                    </span>
                  )}
                </li>
              ))}
              {data.diagnoses.length === 0 && <li className="text-slate-500">No diagnosis yet.</li>}
            </ul>
            {write && (
              <ActionForm action={addDiagnosisAction} resetOnSuccess className="border-t border-slate-100 pt-3">
                <input type="hidden" name="visitId" value={v.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <IcdPicker />
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="isPrimary" /> Primary</label>
                  <Submit variant="secondary">Add</Submit>
                </div>
              </ActionForm>
            )}
          </Card>

          <Card title="Prescriptions">
            {data.rxs.map((rx) => (
              <div key={rx.id} className="mb-3 rounded-md ring-1 ring-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">
                  <span>{dateTime(rx.createdAt, tz)} · {name(rx.prescriberId)} · <Badge>{rx.status.replace("_", " ")}</Badge></span>
                  <Link className="font-medium text-brand-800 hover:underline" href={`/visits/${v.id}/prescription/${rx.id}`}>Print</Link>
                </div>
                <ul className="px-3 py-2 text-sm">
                  {data.rxItems.filter((i) => i.prescriptionId === rx.id).map((i) => (
                    <li key={i.id}><strong>{i.drugName}</strong> {[i.dose, i.route, i.frequency, i.duration && `× ${i.duration}`].filter(Boolean).join(" ")} <span className="text-slate-500">qty {i.quantity}{i.instructions ? ` · ${i.instructions}` : ""}</span></li>
                  ))}
                </ul>
              </div>
            ))}
            {write ? (
              <ActionForm action={addPrescriptionAction} onSuccessHref={`/visits/${v.id}/prescription/{id}`} className="border-t border-slate-100 pt-3">
                <input type="hidden" name="visitId" value={v.id} />
                <RxLines drugs={data.drugs.map((d) => ({ label: drugLabel(d), favorite: d.favorite }))} />
                <Input name="notes" placeholder="Notes to pharmacist (optional)" />
                <Submit>Save & print prescription</Submit>
              </ActionForm>
            ) : data.rxs.length === 0 && <p className="text-sm text-slate-500">No prescriptions.</p>}
          </Card>

          {hasFeature(ctx.tenant, "lab") && (
            <Card title="Lab & imaging orders">
              <ul className="mb-3 space-y-1 text-sm">
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Badge tone={o.status === "resulted" || o.status === "notified" ? "green" : "blue"}>{o.status}</Badge>{" "}
                    {data.orderItems.filter((i) => i.orderId === o.id).map((i) => i.resultValue || i.resultText ? `${i.name}: ${i.resultValue ?? i.resultText}${i.unit ? ` ${i.unit}` : ""}${i.flag && i.flag !== "normal" ? ` (${i.flag})` : ""}` : i.name).join(", ")}
                    {o.externalLab && <span className="text-slate-500"> · {o.externalLab}</span>}
                  </li>
                ))}
                {data.orders.length === 0 && <li className="text-slate-500">No orders.</li>}
              </ul>
              {open && full && can(role, "lab.order") && data.tests.length > 0 && (
                <ActionForm action={orderLabsAction} resetOnSuccess className="border-t border-slate-100 pt-3">
                  <input type="hidden" name="visitId" value={v.id} />
                  <div className="grid gap-1 sm:grid-cols-2">
                    {data.tests.map((x) => (
                      <label key={x.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input type="checkbox" name="testId" value={x.id} /> {x.name} {x.kind === "imaging" && <Badge tone="purple">imaging</Badge>}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2"><Input name="notes" placeholder="Clinical notes for the lab" /><Input name="externalLab" placeholder="External lab (optional)" className="w-56" /></div>
                  <Submit variant="secondary">Order</Submit>
                </ActionForm>
              )}
            </Card>
          )}

          <Card title="Referrals">
            <ul className="mb-3 space-y-1 text-sm">
              {data.referrals.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span>{r.toFacility}{r.specialty && ` · ${r.specialty}`} <Badge tone={r.urgency === "routine" ? "gray" : "red"}>{r.urgency}</Badge></span>
                  <Link className="text-brand-800 hover:underline" href={`/visits/${v.id}/referral/${r.id}`}>Print letter</Link>
                </li>
              ))}
              {data.referrals.length === 0 && <li className="text-slate-500">No referrals.</li>}
            </ul>
            {full && can(role, "clinical.write") && (
              <details className="border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-800">Write a referral letter</summary>
                <ActionForm action={addReferralAction} onSuccessHref={`/visits/${v.id}/referral/{id}`} className="mt-3">
                  <input type="hidden" name="visitId" value={v.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input name="toFacility" placeholder="To facility *" required />
                    <Input name="toName" placeholder="To (doctor / department)" />
                    <Input name="specialty" placeholder="Specialty" />
                    <Select name="urgency" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></Select>
                  </div>
                  <Textarea name="reason" placeholder="Reason for referral *" required />
                  <Textarea name="letter" rows={5} placeholder="Letter body (history, findings, treatment so far). Leave blank to use the note summary." />
                  <Submit variant="secondary">Save & print letter</Submit>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Charges">
            <Table head={["Item", "Qty", "Amount"]} empty="Nothing billed yet. The consultation fee is added when the note is signed.">
              {data.lines.map((l) => <tr key={l.id}><Td>{l.description}</Td><Td>{l.quantity}</Td><Td>{money(l.totalMinor, cur)}</Td></tr>)}
            </Table>
            {full && can(role, "clinical.write") && data.services.length > 0 && (
              <ActionForm action={addChargeAction} resetOnSuccess className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="visitId" value={v.id} />
                <Select name="serviceId" required className="min-w-56 flex-1">
                  {data.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.priceMinor, cur)} ({s.category})</option>)}
                </Select>
                <Input name="quantity" type="number" min={1} defaultValue={1} className="w-20" aria-label="Quantity" />
                <Submit variant="secondary">Add charge</Submit>
              </ActionForm>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Vitals">
            {data.visitVitals.map((x) => <p key={x.id} className="mb-1 text-sm"><span className="text-xs text-slate-500">{dateTime(x.recordedAt, tz, { timeStyle: "short" })}</span> {vitalsLine(x)}</p>)}
            {open && full && can(role, "vitals.write") && (
              <ActionForm action={saveVitalsAction} resetOnSuccess className="mt-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="visitId" value={v.id} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Temp °C"><Input name="tempC" type="number" step="0.1" inputMode="decimal" /></Field>
                  <Field label="Pulse /min"><Input name="pulse" type="number" inputMode="numeric" /></Field>
                  <Field label="Resp. rate"><Input name="respRate" type="number" inputMode="numeric" /></Field>
                  <Field label="SpO₂ %"><Input name="spo2" type="number" inputMode="numeric" /></Field>
                  <Field label="BP systolic"><Input name="bpSys" type="number" inputMode="numeric" /></Field>
                  <Field label="BP diastolic"><Input name="bpDia" type="number" inputMode="numeric" /></Field>
                  <Field label="Weight kg"><Input name="weightKg" type="number" step="0.1" inputMode="decimal" /></Field>
                  <Field label="Height cm" hint="BMI is calculated"><Input name="heightCm" type="number" step="0.1" inputMode="decimal" /></Field>
                  <Field label="Glucose mmol/L"><Input name="glucose" type="number" step="0.1" inputMode="decimal" /></Field>
                </div>
                <Submit variant="secondary">Save vitals</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title="Previous visits">
            <ul className="space-y-2 text-sm">
              {data.prev.map((x) => (
                <li key={x.id} className="border-b border-slate-100 pb-2 last:border-0">
                  <Link href={`/visits/${x.id}`} className="font-medium text-brand-800 hover:underline">{dateOnly(x.startedAt, tz)}</Link>
                  <span className="text-xs text-slate-500"> · {name(x.practitionerId)}</span>
                  <div className="truncate text-slate-700">{x.complaint || "—"}</div>
                  {data.prevDiagnoses.filter((d) => d.visitId === x.id).map((d) => <div key={d.id} className="text-xs text-slate-500">Dx: {d.icd10Code} {d.description}</div>)}
                </li>
              ))}
              {data.prev.length === 0 && <li className="text-slate-500">First visit.</li>}
            </ul>
          </Card>

          <Card title={`Revision history (${data.revisions.length})`}>
            {data.revisions.length === 0 ? <p className="text-sm text-slate-500">No earlier versions.</p> : (
              <ul className="space-y-1 text-sm">
                {data.revisions.map((r) => {
                  const snap = JSON.parse(r.snapshot) as Record<string, unknown>;
                  return (
                    <li key={r.id}>
                      <details>
                        <summary className="cursor-pointer">v{r.version} · {dateTime(r.createdAt, tz)} · <span className="text-slate-500">replaced by {name(r.editedBy)}</span></summary>
                        <div className="mt-1 space-y-1 rounded bg-slate-50 p-2 text-xs">
                          {NOTE_FIELDS.map((f) => <div key={f}><strong>{f}:</strong> <span className="whitespace-pre-wrap">{String(snap[f] ?? "") || "—"}</span></div>)}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
