import { and, desc, eq, isNull } from "drizzle-orm";
import {
  Activity, CalendarDays, CalendarPlus, FileText, GitMerge, HeartPulse, ListPlus, Pencil, Phone, Plus, Receipt,
  ShieldAlert, ShieldCheck, Stethoscope, Upload, UserRound, Users, Wallet,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { A, Avatar, Badge, Dl, EmptyState, Field, Input, LinkButton, Panel, Select, Table, Td, Timeline } from "@/components/ui";
import {
  allergies, appointments, consents, documents, guardians, insurers, invoices, patients, users, visits, vitals,
} from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { outstandingForPatient, patientCredit } from "@/lib/billing";
import { age, dateOnly, dateTime, fullName, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { addAllergyAction, addGuardianAction, recordConsentAction, removeAllergyAction, uploadDocumentAction } from "../actions";

/** Collapsible inline "add" form so panels lead with data, not inputs. */
function AddForm({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group mt-4 border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4 transition group-open:rotate-45" aria-hidden />{label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">{children}</span>;
}

function Vital({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{value ?? "–"}<span className="ml-1 text-xs font-normal text-muted">{value != null && unit}</span></div>
    </div>
  );
}

const CONSENT_TYPES = ["messaging", "data_processing", "portal", "ai_scribe", "telehealth", "treatment"];

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
      owed: await outstandingForPatient(t, id),
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
  const role = ctx.user.role;
  const lv = data.lastVitals;
  const severe = data.allergies.some((a) => a.severity === "severe");

  return (
    <>
      {/* Identity hero */}
      <section className="glass relative mb-4 overflow-hidden p-5 animate-rise sm:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-aurora opacity-15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={fullName(p)} size="lg" className="h-16 w-16 text-xl" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Patient record</div>
              <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[30px]">{fullName(p)}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-mono text-xs text-muted">{p.patientNo}</span>
                <Chip><UserRound /><span className="capitalize">{p.sex}</span></Chip>
                {age(p.dob) && <Chip><span className="tabular-nums">{age(p.dob)}</span></Chip>}
                {p.bloodGroup && <Chip><HeartPulse />{p.bloodGroup}</Chip>}
                {p.phone && <Chip><Phone /><span className="tabular-nums">{p.phone}</span></Chip>}
                {data.insurer ? <Badge tone="teal">{data.insurer.name}{p.memberNo ? ` · ${p.memberNo}` : ""}</Badge> : <Badge>Self-pay</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can(role, "clinical.write") && <LinkButton href={`/visits/new?patient=${p.id}`}><Stethoscope className="h-4 w-4" aria-hidden />Start consultation</LinkButton>}
            {can(role, "queue.manage") && <LinkButton variant={can(role, "clinical.write") ? "secondary" : "primary"} href={`/queue?patient=${p.id}`}><ListPlus className="h-4 w-4" aria-hidden />Add to queue</LinkButton>}
            {can(role, "appointments.manage") && <LinkButton variant="secondary" href={`/appointments/new?patient=${p.id}`}><CalendarPlus className="h-4 w-4" aria-hidden />Book</LinkButton>}
            {can(role, "billing.write") && <LinkButton variant="secondary" href={`/billing/new?patient=${p.id}`}><Receipt className="h-4 w-4" aria-hidden />Invoice</LinkButton>}
            {write && <LinkButton variant="ghost" href={`/patients/${p.id}/edit`}><Pencil className="h-4 w-4" aria-hidden />Edit</LinkButton>}
            {can(role, "patients.merge") && <LinkButton variant="ghost" href={`/patients/${p.id}/merge`}><GitMerge className="h-4 w-4" aria-hidden />Merge</LinkButton>}
          </div>
        </div>
      </section>

      {/* Allergy ribbon */}
      {data.allergies.length > 0 ? (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 animate-rise">
          <span className="flex items-center gap-2 text-sm font-semibold text-bad"><ShieldAlert className={severe ? "h-4 w-4 animate-pulse-ring rounded-full" : "h-4 w-4"} aria-hidden />Allergies</span>
          {data.allergies.map((a) => (
            <span key={a.id} className="rounded-lg bg-bad/15 px-2.5 py-1 text-xs font-medium text-fg">
              {a.substance}{a.reaction ? <span className="text-muted"> · {a.reaction}</span> : null}{a.severity === "severe" && <span className="ml-1 font-semibold text-bad">SEVERE</span>}
            </span>
          ))}
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-muted animate-rise">
          <ShieldCheck className="h-4 w-4 text-ok" aria-hidden />No known allergies recorded
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {can(role, "clinical.read") && (
          <>
            <Panel eyebrow="Clinical" title="Timeline" icon={<Stethoscope />} className="lg:col-span-8"
              actions={<span className="text-xs text-subtle">{data.visits.length} consultation{data.visits.length === 1 ? "" : "s"}</span>}>
              {data.visits.length === 0 ? (
                <EmptyState icon={<Stethoscope />} title="No consultations yet">Start a consultation to begin this patient&apos;s clinical history.</EmptyState>
              ) : (
                <Timeline items={data.visits.map(({ v, doctor }) => ({
                  id: v.id, href: `/visits/${v.id}`, tone: v.status === "signed" ? "green" : "yellow",
                  title: <span className="inline-flex items-center gap-2">{v.complaint || "Consultation"} <Badge tone={v.status === "signed" ? "green" : "yellow"}>{v.status}</Badge></span>,
                  meta: [dateTime(v.startedAt, tz), doctor].filter(Boolean).join(" · "),
                }))} />
              )}
            </Panel>

            <Panel eyebrow={lv ? `Recorded ${dateOnly(lv.recordedAt, tz)}` : "Vitals"} title="Latest vitals" icon={<Activity />} className="lg:col-span-4">
              {lv ? (
                <div className="grid grid-cols-2 gap-2">
                  <Vital label="Blood pressure" value={lv.bpSys != null || lv.bpDia != null ? `${lv.bpSys ?? "–"}/${lv.bpDia ?? "–"}` : null} />
                  <Vital label="Temp" value={lv.tempC} unit="°C" />
                  <Vital label="Pulse" value={lv.pulse} unit="/min" />
                  <Vital label="SpO₂" value={lv.spo2} unit="%" />
                  <Vital label="Weight" value={lv.weightKg} unit="kg" />
                  <Vital label="Height" value={lv.heightCm} unit="cm" />
                </div>
              ) : <EmptyState compact icon={<Activity />} title="No vitals recorded yet" />}
            </Panel>
          </>
        )}

        <Panel eyebrow="Identity" title="Details" icon={<UserRound />} className="lg:col-span-8">
          <Dl items={[
            ["Date of birth", p.dob ? `${dateOnly(p.dob, "UTC")} (${age(p.dob)})` : null], ["Blood group", p.bloodGroup],
            ["Phone", p.phone], ["Alt. phone", p.altPhone], ["Email", p.email], ["National ID", p.nationalId ? "•••• " + p.nationalId.slice(-4) : null],
            ["Address", p.address], ["Occupation", p.occupation], ["Emergency contact", [p.emergencyName, p.emergencyPhone].filter(Boolean).join(" · ")],
            ["Insurance", data.insurer ? `${data.insurer.name} · ${p.memberNo ?? "no member no."}${p.insuranceExpiry ? ` · exp ${p.insuranceExpiry}` : ""}` : "Self-pay"],
            ["Account credit", data.credit ? money(data.credit, cur) : null], ["Messages", `${p.preferredChannel}${msg ? (msg.granted && !msg.revokedAt ? " · consented" : " · opted out") : " · consent not recorded"}`],
          ]} />
          {p.notes && <p className="mt-5 whitespace-pre-wrap rounded-2xl border border-line bg-surface-2 p-4 text-sm text-muted">{p.notes}</p>}
        </Panel>

        <Panel eyebrow="Safety" title="Allergies" icon={<ShieldAlert />} className="lg:col-span-4">
          <ul className="space-y-2">
            {data.allergies.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg">{a.substance}</div>
                  {a.reaction && <div className="truncate text-xs text-muted">{a.reaction}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tone={a.severity === "severe" ? "red" : "yellow"}>{a.severity}</Badge>
                  {write && <ActionButton action={removeAllergyAction} fields={{ id: a.id, patientId: p.id }} variant="ghost" confirm="Remove this allergy?">Remove</ActionButton>}
                </div>
              </li>
            ))}
            {data.allergies.length === 0 && <li className="text-sm text-muted">No known allergies recorded.</li>}
          </ul>
          {write && (
            <AddForm label="Add allergy">
              <ActionForm action={addAllergyAction} resetOnSuccess>
                <input type="hidden" name="patientId" value={p.id} />
                <Input name="substance" placeholder="Substance (e.g. Penicillin)" required />
                <div className="flex gap-2">
                  <Input name="reaction" placeholder="Reaction" />
                  <Select name="severity" defaultValue="moderate" className="w-32"><option>mild</option><option>moderate</option><option>severe</option></Select>
                </div>
                <Submit variant="secondary" size="sm">Add allergy</Submit>
              </ActionForm>
            </AddForm>
          )}
        </Panel>

        <Panel eyebrow="Schedule" title="Appointments" icon={<CalendarDays />} className={can(role, "billing.read") ? "lg:col-span-6" : "lg:col-span-12"}>
          {data.appts.length === 0 ? <EmptyState compact icon={<CalendarDays />} title="No appointments booked" /> : (
            <ul className="space-y-1">
              {data.appts.map(({ a, doctor }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium tabular-nums text-fg">{dateTime(a.startsAt, tz)}</div>
                    <div className="truncate text-xs text-muted">{doctor ?? "Any practitioner"}</div>
                  </div>
                  <Badge tone={a.status === "completed" ? "green" : a.status === "cancelled" || a.status === "no_show" ? "red" : "blue"}>{a.status.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {can(role, "billing.read") && (
          <Panel eyebrow="Money" title="Invoices" icon={<Wallet />} className="lg:col-span-6"
            actions={<>{data.owed > 0 && <Badge tone="yellow">Owes {money(data.owed, cur)}</Badge>}{data.credit ? <Badge tone="green">Credit {money(data.credit, cur)}</Badge> : null}</>}>
            <Table head={["Invoice", "Date", "Total", "Balance", "Status"]} empty="No invoices yet.">
              {data.invoices.map((i) => (
                <tr key={i.id}>
                  <Td><A className="font-mono text-xs" href={`/billing/${i.id}`}>{i.invoiceNo}</A></Td>
                  <Td className="text-muted">{dateOnly(i.createdAt, tz)}</Td><Td className="tabular-nums">{money(i.totalMinor, cur)}</Td>
                  <Td className={i.patientPortionMinor - i.paidMinor > 0 && i.status !== "void" ? "font-medium tabular-nums text-warn" : "tabular-nums text-muted"}>{money(i.patientPortionMinor - i.paidMinor, cur)}</Td>
                  <Td><Badge tone={i.status === "paid" ? "green" : i.status === "void" ? "gray" : "yellow"}>{i.status.replace("_", " ")}</Badge></Td>
                </tr>
              ))}
            </Table>
          </Panel>
        )}

        <Panel eyebrow="People" title="Guardians & family" icon={<Users />} className="lg:col-span-4">
          <ul className="space-y-1">
            {data.guardians.map((g) => (
              <li key={g.id}>
                <div className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <Avatar name={g.name} size="sm" />
                  <div className="min-w-0">
                    {g.guardianPatientId ? <Link href={`/patients/${g.guardianPatientId}`} className="text-sm font-medium text-fg hover:text-accent">{g.name}</Link> : <div className="text-sm font-medium text-fg">{g.name}</div>}
                    <div className="truncate text-xs text-muted">{[g.relationship, g.phone].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              </li>
            ))}
            {data.guardians.length === 0 && <li className="text-sm text-muted">No guardians or family recorded.</li>}
          </ul>
          {write && (
            <AddForm label="Add guardian">
              <ActionForm action={addGuardianAction} resetOnSuccess>
                <input type="hidden" name="patientId" value={p.id} />
                <Input name="name" placeholder="Name" required />
                <div className="flex gap-2"><Input name="relationship" placeholder="Relationship" required /><Input name="phone" placeholder="Phone" /></div>
                {data.relatives.filter((r) => r.id !== p.id).length > 0 && (
                  <Select name="guardianPatientId" defaultValue=""><option value="">Link to existing patient (same phone)…</option>
                    {data.relatives.filter((r) => r.id !== p.id).map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}
                  </Select>
                )}
                <Submit variant="secondary" size="sm">Add</Submit>
              </ActionForm>
            </AddForm>
          )}
        </Panel>

        <Panel eyebrow="Permissions" title="Consent" icon={<ShieldCheck />} className="lg:col-span-4">
          <ul className="divide-y divide-line">
            {CONSENT_TYPES.map((type) => {
              const c = latestConsent(type);
              const ok = c && c.granted && !c.revokedAt;
              return (
                <li key={type} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="capitalize text-fg">{type.replace("_", " ")}</span>
                  {c ? <Badge tone={ok ? "green" : "red"}>{ok ? "granted" : "declined"} · {c.method}</Badge> : <Badge>not recorded</Badge>}
                </li>
              );
            })}
          </ul>
          {write && (
            <AddForm label="Record consent">
              <ActionForm action={recordConsentAction}>
                <input type="hidden" name="patientId" value={p.id} />
                <Select name="type"><option value="messaging">Messaging</option><option value="data_processing">Data processing</option><option value="portal">Patient portal</option><option value="ai_scribe">AI scribe recording</option><option value="telehealth">Telehealth</option><option value="treatment">Treatment</option></Select>
                <div className="flex gap-2">
                  <Select name="granted"><option value="yes">Granted</option><option value="no">Declined / withdrawn</option></Select>
                  <Select name="method"><option value="verbal">Verbal</option><option value="signature">Signature</option><option value="form">Form</option><option value="whatsapp">WhatsApp</option></Select>
                </div>
                <Submit variant="secondary" size="sm">Record consent</Submit>
              </ActionForm>
            </AddForm>
          )}
        </Panel>

        <Panel eyebrow="Files" title="Documents" icon={<FileText />} className="lg:col-span-4">
          <ul className="space-y-1">
            {data.documents.map((d) => (
              <li key={d.id}>
                <a href={`/api/files/${d.id}`} target="_blank" className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent"><FileText className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{d.name}</span>
                    <span className="block text-xs capitalize text-muted">{d.category.replace("_", " ")} · {dateOnly(d.createdAt, tz)}</span>
                  </span>
                </a>
              </li>
            ))}
            {data.documents.length === 0 && <li className="text-sm text-muted">No documents uploaded.</li>}
          </ul>
          {write && (
            <ActionForm action={uploadDocumentAction} resetOnSuccess className="mt-4 space-y-3 border-t border-line pt-4">
              <input type="hidden" name="patientId" value={p.id} />
              <Field label="Upload a file">
                <span className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-line-strong bg-surface-2 px-3 py-4 text-center text-xs text-muted">
                  <Upload className="h-5 w-5 text-accent" aria-hidden />
                  <input type="file" name="file" required accept="image/*,application/pdf,text/plain,text/csv"
                    className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg" />
                  Images, PDF, text or CSV
                </span>
              </Field>
              <div className="flex gap-2">
                <Select name="category" className="flex-1"><option value="other">Other</option><option value="lab_result">Lab result</option><option value="imaging">Imaging</option><option value="referral">Referral</option><option value="id">ID document</option><option value="photo">Patient photo</option></Select>
                <Submit variant="secondary">Upload</Submit>
              </div>
            </ActionForm>
          )}
        </Panel>
      </div>
    </>
  );
}
