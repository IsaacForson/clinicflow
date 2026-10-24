import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { Activity, ArrowUpRight, FileSignature, HeartPulse, Pill, Printer, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { A, Avatar, Badge, Callout, EmptyState, Field, Input, LinkButton, Panel, Select, Table, Td, Textarea } from "@/components/ui";
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
import { RailTabs } from "./rail-tabs";
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
const vitalsChips = (v: Vitals) => vitalsLine(v).split(" · ").filter(Boolean);

function RailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{title}</h3>
      {children}
    </div>
  );
}
const formBox = "mt-4 space-y-3 rounded-2xl border border-line bg-surface-2 p-3";

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
  const lab = hasFeature(ctx.tenant, "lab");

  const dxPane = (
    <RailSection title="Diagnoses">
      <ul className="space-y-2">
        {data.diagnoses.map((d) => (
          <li key={d.id} className={d.isPrimary ? "rounded-xl border border-accent/30 bg-accent/10 p-3" : "rounded-xl border border-line bg-surface-2 p-3"}>
            <div className="flex items-start gap-2">
              {d.icd10Code && <span className="mt-0.5 shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">{d.icd10Code}</span>}
              <span className="min-w-0 flex-1 text-sm font-medium text-fg">{d.description}</span>
              {d.isPrimary && <Badge tone="teal">primary</Badge>}
            </div>
            {write && (
              <div className="mt-2 flex gap-1">
                {!d.isPrimary && <ActionButton action={updateDiagnosisAction} fields={{ id: d.id, visitId: v.id, op: "primary" }} variant="ghost">Make primary</ActionButton>}
                <ActionButton action={updateDiagnosisAction} fields={{ id: d.id, visitId: v.id, op: "remove" }} variant="ghost" confirm="Remove this diagnosis?">Remove</ActionButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.diagnoses.length === 0 && <p className="text-sm text-muted">No diagnosis yet.</p>}
      {write && (
        <ActionForm action={addDiagnosisAction} resetOnSuccess className={formBox}>
          <input type="hidden" name="visitId" value={v.id} />
          <IcdPicker />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-fg"><input type="checkbox" name="isPrimary" className="accent-[var(--accent)]" /> Primary</label>
            <Submit variant="secondary" size="sm">Add diagnosis</Submit>
          </div>
        </ActionForm>
      )}
    </RailSection>
  );

  const rxPane = (
    <RailSection title="Prescriptions">
      {data.rxs.map((rx) => (
        <div key={rx.id} className="overflow-hidden rounded-xl border border-line bg-surface-2">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-muted">
            <span className="truncate">{dateTime(rx.createdAt, tz)} · {name(rx.prescriberId)}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Badge>{rx.status.replace("_", " ")}</Badge>
              <Link className="inline-flex items-center gap-1 font-medium text-accent hover:underline" href={`/visits/${v.id}/prescription/${rx.id}`}><Printer className="h-3.5 w-3.5" aria-hidden />Print</Link>
            </span>
          </div>
          <ul className="space-y-1.5 px-3 py-2.5 text-sm">
            {data.rxItems.filter((i) => i.prescriptionId === rx.id).map((i) => (
              <li key={i.id}>
                <span className="font-medium text-fg">{i.drugName}</span> <span className="text-muted">{[i.dose, i.route, i.frequency, i.duration && `× ${i.duration}`].filter(Boolean).join(" ")}</span>
                <div className="text-xs text-subtle">qty {i.quantity}{i.instructions ? ` · ${i.instructions}` : ""}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {write ? (
        <ActionForm action={addPrescriptionAction} onSuccessHref={`/visits/${v.id}/prescription/{id}`} className={formBox}>
          <input type="hidden" name="visitId" value={v.id} />
          <RxLines drugs={data.drugs.map((d) => ({ label: drugLabel(d), favorite: d.favorite }))} />
          <Input name="notes" placeholder="Notes to pharmacist (optional)" />
          <Submit className="w-full"><Pill className="h-4 w-4" aria-hidden />Save & print prescription</Submit>
        </ActionForm>
      ) : data.rxs.length === 0 && <p className="text-sm text-muted">No prescriptions.</p>}
    </RailSection>
  );

  const ordersPane = (
    <RailSection title="Lab & imaging orders">
      <ul className="space-y-2">
        {data.orders.map((o) => (
          <li key={o.id} className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Badge tone={o.status === "resulted" || o.status === "notified" ? "green" : "blue"}>{o.status}</Badge>
              {o.externalLab && <span className="truncate text-xs text-muted">{o.externalLab}</span>}
            </div>
            <div className="text-fg">
              {data.orderItems.filter((i) => i.orderId === o.id).map((i) => i.resultValue || i.resultText ? `${i.name}: ${i.resultValue ?? i.resultText}${i.unit ? ` ${i.unit}` : ""}${i.flag && i.flag !== "normal" ? ` (${i.flag})` : ""}` : i.name).join(", ")}
            </div>
          </li>
        ))}
      </ul>
      {data.orders.length === 0 && <p className="text-sm text-muted">No orders.</p>}
      {open && full && can(role, "lab.order") && data.tests.length > 0 && (
        <ActionForm action={orderLabsAction} resetOnSuccess className={formBox}>
          <input type="hidden" name="visitId" value={v.id} />
          <div className="grid max-h-64 gap-1 overflow-y-auto">
            {data.tests.map((x) => (
              <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg transition hover:bg-surface-3 has-[:checked]:bg-accent/10">
                <input type="checkbox" name="testId" value={x.id} className="accent-[var(--accent)]" /> <span className="flex-1">{x.name}</span> {x.kind === "imaging" && <Badge tone="purple">imaging</Badge>}
              </label>
            ))}
          </div>
          <Input name="notes" placeholder="Clinical notes for the lab" />
          <Input name="externalLab" placeholder="External lab (optional)" />
          <Submit variant="secondary" size="sm">Order</Submit>
        </ActionForm>
      )}
    </RailSection>
  );

  const referralPane = (
    <RailSection title="Referrals">
      <ul className="space-y-2">
        {data.referrals.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-fg">{r.toFacility}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted">{r.specialty}<Badge tone={r.urgency === "routine" ? "gray" : "red"}>{r.urgency}</Badge></div>
            </div>
            <Link className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline" href={`/visits/${v.id}/referral/${r.id}`}><Printer className="h-3.5 w-3.5" aria-hidden />Letter</Link>
          </li>
        ))}
      </ul>
      {data.referrals.length === 0 && <p className="text-sm text-muted">No referrals.</p>}
      {full && can(role, "clinical.write") && (
        <ActionForm action={addReferralAction} onSuccessHref={`/visits/${v.id}/referral/{id}`} className={formBox}>
          <input type="hidden" name="visitId" value={v.id} />
          <Input name="toFacility" placeholder="To facility *" required />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input name="toName" placeholder="To (doctor / department)" />
            <Input name="specialty" placeholder="Specialty" />
          </div>
          <Select name="urgency" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></Select>
          <Textarea name="reason" placeholder="Reason for referral *" required />
          <Textarea name="letter" rows={5} placeholder="Letter body (history, findings, treatment so far). Leave blank to use the note summary." />
          <Submit variant="secondary" size="sm">Save & print letter</Submit>
        </ActionForm>
      )}
    </RailSection>
  );

  const chargesPane = (
    <RailSection title="Charges">
      <div className="px-5">
        <Table head={["Item", "Qty", "Amount"]} empty="Nothing billed yet. The consultation fee is added when the note is signed.">
          {data.lines.map((l) => <tr key={l.id}><Td className="max-w-[160px] truncate">{l.description}</Td><Td className="tabular-nums">{l.quantity}</Td><Td className="tabular-nums">{money(l.totalMinor, cur)}</Td></tr>)}
        </Table>
      </div>
      {full && can(role, "clinical.write") && data.services.length > 0 && (
        <ActionForm action={addChargeAction} resetOnSuccess className={formBox}>
          <input type="hidden" name="visitId" value={v.id} />
          <Select name="serviceId" required>
            {data.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.priceMinor, cur)} ({s.category})</option>)}
          </Select>
          <div className="flex gap-2">
            <Input name="quantity" type="number" min={1} defaultValue={1} className="w-20" aria-label="Quantity" />
            <Submit variant="secondary" className="flex-1">Add charge</Submit>
          </div>
        </ActionForm>
      )}
    </RailSection>
  );

  const historyPane = (
    <div className="space-y-6">
      <RailSection title="Previous visits">
        <ul className="space-y-2">
          {data.prev.map((x) => (
            <li key={x.id}>
              <Link href={`/visits/${x.id}`} className="block rounded-xl border border-line bg-surface-2 p-3 transition hover:border-line-strong">
                <div className="flex items-center justify-between gap-2 text-xs text-muted"><span className="font-medium text-fg">{dateOnly(x.startedAt, tz)}</span>{name(x.practitionerId)}</div>
                <div className="mt-1 truncate text-sm text-muted">{x.complaint || "—"}</div>
                {data.prevDiagnoses.filter((d) => d.visitId === x.id).map((d) => <div key={d.id} className="mt-1 text-xs text-accent"><span className="font-mono">{d.icd10Code}</span> {d.description}</div>)}
              </Link>
            </li>
          ))}
        </ul>
        {data.prev.length === 0 && <p className="text-sm text-muted">First visit.</p>}
      </RailSection>
      <RailSection title={`Revision history (${data.revisions.length})`}>
        {data.revisions.length === 0 ? <p className="text-sm text-muted">No earlier versions.</p> : (
          <ul className="space-y-1.5">
            {data.revisions.map((r) => {
              const snap = JSON.parse(r.snapshot) as Record<string, unknown>;
              return (
                <li key={r.id}>
                  <details className="rounded-xl border border-line bg-surface-2">
                    <summary className="cursor-pointer px-3 py-2 text-sm text-fg"><span className="font-mono text-xs text-accent">v{r.version}</span> · {dateTime(r.createdAt, tz)} <span className="block text-xs text-muted">replaced by {name(r.editedBy)}</span></summary>
                    <div className="space-y-1 border-t border-line p-3 text-xs text-muted">
                      {NOTE_FIELDS.map((f) => <div key={f}><span className="font-semibold capitalize text-fg">{f}:</span> <span className="whitespace-pre-wrap">{String(snap[f] ?? "") || "—"}</span></div>)}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </RailSection>
    </div>
  );

  return (
    <>
      {/* Patient strip */}
      <section className="glass relative mb-5 overflow-hidden p-4 animate-rise sm:p-5">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-aurora opacity-10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={fullName(p)} size="lg" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{tpl.label} consultation</div>
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-[-0.02em] text-fg">
                <Link href={`/patients/${p.id}`} className="hover:text-accent">{fullName(p)}</Link>
                <span className="font-mono text-xs font-normal text-muted">{p.patientNo}</span>
                <Badge tone={open ? "yellow" : "green"} pulse={open}>{v.status}</Badge>
              </h1>
              <p className="mt-1 text-xs capitalize text-muted">{[p.sex, age(p.dob), p.bloodGroup && `Blood ${p.bloodGroup}`, data.insurer ?? "Self-pay", dateTime(v.startedAt, tz), name(v.practitionerId)].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <LinkButton variant="secondary" size="sm" href={`/patients/${p.id}`}><UserRound className="h-3.5 w-3.5" aria-hidden />Patient record<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></LinkButton>
        </div>
        <div className="relative mt-4 grid gap-2 border-t border-line pt-4 lg:grid-cols-2">
          <div role="alert" className={data.allergies.length ? "flex flex-wrap items-center gap-1.5 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2" : "flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"}>
            {data.allergies.length ? <>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-bad"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />Allergies</span>
              {data.allergies.map((a) => (
                <span key={a.id} className="rounded-md bg-bad/15 px-2 py-0.5 text-xs font-medium text-fg">
                  {a.substance}{a.reaction ? ` (${a.reaction})` : ""}{a.severity === "severe" && <span className="ml-1 font-semibold text-bad">SEVERE</span>}
                </span>
              ))}
            </> : <span className="flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5 text-ok" aria-hidden />Allergies: none recorded</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-accent-2"><HeartPulse className="h-3.5 w-3.5" aria-hidden />Last vitals</span>
            {data.lastVitals ? <>
              {vitalsChips(data.lastVitals).map((c) => <span key={c} className="rounded-md bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-fg">{c}</span>)}
              <span className="text-[11px] text-subtle">{dateTime(data.lastVitals.recordedAt, tz)}</span>
            </> : <span className="text-xs text-muted">none recorded</span>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          {open && can(role, "clinical.write") && full ? (
            <NoteEditor visitId={v.id} version={v.version} template={v.template} extra={v.extra}
              note={Object.fromEntries(NOTE_FIELDS.map((f) => [f, v[f] ?? ""])) as Record<(typeof NOTE_FIELDS)[number], string>}
              canSign={can(role, "clinical.sign")} followUpDate={v.followUpDate}
              scribe={{ allowed: !scribeReason, reason: can(role, "scribe.use") ? scribeReason ?? undefined : undefined }} />
          ) : (
            <Panel eyebrow="Consultation note" title={v.status === "signed" ? "Signed note" : "Note"} icon={<FileSignature />}>
              <div className="space-y-5 text-sm">
                {v.status === "signed" && (
                  <Callout tone="green" icon={<ShieldCheck />}>Signed by {name(v.signedBy)} on {dateTime(v.signedAt, tz)}{v.followUpDate && ` · follow-up ${dateOnly(v.followUpDate, "UTC")}`}</Callout>
                )}
                {NOTE_FIELDS.map((f) => (
                  <div key={f} className="border-l-2 border-line pl-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{f}</div>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed text-fg">{v[f] || <span className="text-subtle">—</span>}</p>
                  </div>
                ))}
                {tpl.fields.filter((f) => v.extra[f.key]).map((f) => (
                  <div key={f.key} className="border-l-2 border-accent/40 pl-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{f.label}</div>
                    <p className="mt-1 whitespace-pre-wrap leading-relaxed text-fg">{v.extra[f.key]}</p>
                  </div>
                ))}
                {v.status === "signed" && full && can(role, "clinical.write") && (
                  <ActionForm action={addAddendumAction} resetOnSuccess className="border-t border-line pt-4">
                    <input type="hidden" name="visitId" value={v.id} />
                    <Field label="Addendum (appended to the plan with your name and the time)"><Textarea name="text" required /></Field>
                    <Submit variant="secondary" size="sm">Add addendum</Submit>
                  </ActionForm>
                )}
              </div>
            </Panel>
          )}

          <Panel eyebrow="This visit" title="Vitals" icon={<Activity />}>
            {data.visitVitals.length === 0 && !(open && full && can(role, "vitals.write")) && <EmptyState compact icon={<Activity />} title="No vitals recorded for this visit" />}
            <ul className="space-y-2">
              {data.visitVitals.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs tabular-nums text-subtle">{dateTime(x.recordedAt, tz, { timeStyle: "short" })}</span>
                  {vitalsChips(x).map((c) => <span key={c} className="rounded-md bg-surface-3 px-2 py-0.5 text-xs tabular-nums text-fg">{c}</span>)}
                </li>
              ))}
            </ul>
            {open && full && can(role, "vitals.write") && (
              <ActionForm action={saveVitalsAction} resetOnSuccess className={data.visitVitals.length ? "mt-4 border-t border-line pt-4" : ""}>
                <input type="hidden" name="visitId" value={v.id} />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
                <div className="flex justify-end"><Submit variant="secondary" size="sm">Save vitals</Submit></div>
              </ActionForm>
            )}
          </Panel>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
          <RailTabs tabs={[
            { key: "dx", label: "Diagnoses", count: data.diagnoses.length, content: dxPane },
            { key: "rx", label: "Rx", count: data.rxs.length, content: rxPane },
            ...(lab ? [{ key: "orders", label: "Orders", count: data.orders.length, content: ordersPane }] : []),
            { key: "ref", label: "Referral", count: data.referrals.length, content: referralPane },
            { key: "charges", label: "Charges", count: data.lines.length, content: chargesPane },
            { key: "history", label: "History", count: data.prev.length, content: historyPane },
          ]} />
          <p className="mt-3 px-1 text-[11px] text-subtle">Need the full chart? <A href={`/patients/${p.id}`}>Open patient record</A></p>
        </aside>
      </div>
    </>
  );
}
