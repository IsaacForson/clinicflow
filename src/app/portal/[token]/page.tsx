import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import Link from "next/link";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { CalendarClock, CalendarDays, CalendarPlus, Check, ChevronDown, CircleCheck, FlaskConical, HeartPulse, Lock, NotebookText, Pill, Stethoscope, Wallet } from "lucide-react";
import { Badge, EmptyState, Field, Input, LinkButton, Panel } from "@/components/ui";
import { withTenant } from "@/db";
import {
  appointments, carePlans, consents, invoices, labOrderItems, labOrders, portalTokens, prescriptionItems, prescriptions, users, visits, vitals,
} from "@/db/schema";
import { dateOnly, dateTime, money, timeOnly } from "@/lib/format";
import { ClinicHeader, Expired } from "../header";
import { portalAudit, resolvePortal } from "../session";
import { cancelApptAction, confirmApptAction, logReadingAction, payInvoiceAction } from "./actions";

export default async function PortalPage({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const s = await resolvePortal(token);
  if (!s) return <Expired />;
  const tenantId = s.tenant.id;
  const patientId = s.patient.id;
  const tz = s.tenant.timezone;
  const cur = s.tenant.currency;

  const d = await withTenant(tenantId, async (t) => {
    await t.update(portalTokens).set({ lastUsedAt: new Date() }).where(and(eq(portalTokens.id, s.tokenId), eq(portalTokens.tenantId, tenantId)));
    await portalAudit(t, s, "portal_view", "patient", patientId);
    const mine = (tbl: { tenantId: AnyPgColumn; patientId: AnyPgColumn }) => and(eq(tbl.tenantId, tenantId), eq(tbl.patientId, patientId));
    const [portalConsent] = await t.select().from(consents).where(and(mine(consents), eq(consents.type, "portal"))).orderBy(desc(consents.createdAt)).limit(1);
    const showClinical = !portalConsent || (portalConsent.granted && !portalConsent.revokedAt);
    const signed = showClinical
      ? await t.select({ v: visits, doctor: users.name, title: users.title }).from(visits).leftJoin(users, eq(users.id, visits.practitionerId))
        .where(and(mine(visits), eq(visits.status, "signed"))).orderBy(desc(visits.startedAt)).limit(10)
      : [];
    const rx = signed.length
      ? await t.select({ visitId: prescriptions.visitId, item: prescriptionItems }).from(prescriptionItems)
        .innerJoin(prescriptions, eq(prescriptions.id, prescriptionItems.prescriptionId))
        .where(and(mine(prescriptions), inArray(prescriptions.visitId, signed.map((x) => x.v.id))))
      : [];
    const labs = showClinical
      ? await t.select({ o: labOrders, item: labOrderItems }).from(labOrders).innerJoin(labOrderItems, eq(labOrderItems.orderId, labOrders.id))
        .where(and(mine(labOrders), inArray(labOrders.status, ["resulted", "notified"]))).orderBy(desc(labOrders.createdAt)).limit(30)
      : [];
    return {
      showClinical, signed, rx, labs,
      appts: await t.select({ a: appointments, doctor: users.name, title: users.title }).from(appointments).leftJoin(users, eq(users.id, appointments.practitionerId))
        .where(and(mine(appointments), inArray(appointments.status, ["scheduled", "confirmed"]), gt(appointments.startsAt, new Date()))).orderBy(appointments.startsAt),
      invoices: await t.select().from(invoices).where(and(mine(invoices), inArray(invoices.status, ["issued", "partially_paid", "paid"]))).orderBy(desc(invoices.createdAt)).limit(10),
      plan: (await t.select().from(carePlans).where(and(mine(carePlans), eq(carePlans.active, true))).limit(1))[0],
      readings: await t.select().from(vitals).where(mine(vitals)).orderBy(desc(vitals.recordedAt)).limit(5),
    };
  });

  const base = `/portal/${token}`;
  const [next, ...later] = d.appts;
  const owed = d.invoices.reduce((sum, i) => sum + Math.max(i.patientPortionMinor - i.paidMinor, 0), 0);
  const big = "h-11! px-4! text-sm! rounded-xl!";
  const who = (title: string | null, doctor: string | null) => [title, doctor].filter(Boolean).join(" ") || "Any practitioner";
  const apptActions = (a: (typeof d.appts)[number]["a"]) => (
    <div className="flex flex-wrap gap-2">
      {a.status === "scheduled" && <ActionButton action={confirmApptAction} fields={{ token, id: a.id }} variant="primary" className={big}><Check className="h-4 w-4" aria-hidden />Confirm</ActionButton>}
      <LinkButton variant="secondary" href={`${base}/book?appt=${a.id}`} className="h-11"><CalendarClock className="h-4 w-4" aria-hidden />Reschedule</LinkButton>
      <ActionButton action={cancelApptAction} fields={{ token, id: a.id }} variant="ghost" confirm="Cancel this appointment?" className={big}>Cancel</ActionButton>
    </div>
  );
  return (
    <div className="space-y-5">
      <ClinicHeader tenant={s.tenant} patientName={s.patient.firstName} />

      {next ? (
        <section className="glass ring-aurora relative overflow-hidden p-5 shadow-glow animate-rise">
          <div className="pointer-events-none absolute -left-16 -bottom-20 h-48 w-48 rounded-full bg-aurora opacity-20 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Next appointment</span>
              <Badge tone={next.a.status === "confirmed" ? "green" : "blue"} pulse={next.a.status === "scheduled"}>{next.a.status}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2 text-center">
                <CalendarDays className="h-6 w-6 text-accent" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-semibold tracking-tight text-fg">{dateOnly(next.a.startsAt, tz)}</div>
                <div className="text-2xl font-semibold tabular-nums text-aurora">{timeOnly(next.a.startsAt, tz)}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Stethoscope className="h-4 w-4 text-subtle" aria-hidden />
              <span className="truncate">{who(next.title, next.doctor)}{next.a.reason ? ` · ${next.a.reason}` : ""}</span>
            </div>
            <div className="mt-5">{apptActions(next.a)}</div>
          </div>
        </section>
      ) : (
        <section className="glass p-5 animate-rise">
          <EmptyState icon={<CalendarPlus />} title="No upcoming appointments">
            <p>Pick a time that suits you — it takes less than a minute.</p>
            <LinkButton href={`${base}/book`} size="lg" className="mt-4 w-full"><CalendarPlus className="h-4 w-4" aria-hidden />Book an appointment</LinkButton>
          </EmptyState>
        </section>
      )}

      {next && (
        <LinkButton href={`${base}/book`} variant="secondary" size="lg" className="w-full"><CalendarPlus className="h-4 w-4" aria-hidden />Book another appointment</LinkButton>
      )}

      {later.length > 0 && (
        <Panel title="Also coming up" icon={<CalendarClock />}>
          <ul className="space-y-3">
            {later.map(({ a, doctor, title }) => (
              <li key={a.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-fg">{dateOnly(a.startsAt, tz)} · <span className="tabular-nums">{timeOnly(a.startsAt, tz)}</span></div>
                    <div className="truncate text-sm text-muted">{who(title, doctor)}{a.reason ? ` · ${a.reason}` : ""}</div>
                  </div>
                  <Badge tone={a.status === "confirmed" ? "green" : "blue"}>{a.status}</Badge>
                </div>
                <div className="mt-3">{apptActions(a)}</div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {d.invoices.length > 0 && (
        <Panel title="Bills" icon={<Wallet />} eyebrow={owed > 0 ? "Balance due" : "All paid up"}
          actions={<span className={owed > 0 ? "text-lg font-semibold tabular-nums text-fg" : "text-sm font-medium text-ok"}>{owed > 0 ? money(owed, cur) : "Paid"}</span>}>
          <ul className="-mx-2 divide-y divide-line">
            {d.invoices.map((i) => {
              const balance = i.patientPortionMinor - i.paidMinor;
              return (
                <li key={i.id} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium tabular-nums text-fg">{money(i.totalMinor, cur)} <span className="ml-1 font-mono text-xs font-normal text-subtle">{i.invoiceNo}</span></div>
                    <div className="text-xs text-muted">{dateOnly(i.createdAt, tz)} · {balance > 0 ? <span className="text-warn">Balance {money(balance, cur)}</span> : <span className="text-ok">Paid</span>}</div>
                  </div>
                  {balance > 0 ? <ActionButton action={payInvoiceAction} fields={{ token, id: i.id }} variant="primary" className={big}>Pay now</ActionButton> : <CircleCheck className="h-5 w-5 text-ok" aria-label="Paid" />}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {d.labs.length > 0 && (
        <Panel title="Test results" icon={<FlaskConical />}>
          <ul className="space-y-3 text-sm">
            {d.labs.map(({ o, item }) => (
              <li key={item.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-fg">{item.name}</span>
                  <span className="shrink-0 text-xs text-subtle">{dateOnly(item.resultedAt ?? o.createdAt, tz)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums text-fg">{[item.resultValue, item.unit].filter(Boolean).join(" ")}</span>
                  {item.refRange ? <span className="text-xs text-muted">range {item.refRange}</span> : null}
                  {item.flag && item.flag !== "normal" && <Badge tone="yellow">{item.flag}</Badge>}
                </div>
                {item.resultText && <p className="mt-2 whitespace-pre-wrap text-muted">{item.resultText}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-subtle">Please discuss your results with your clinic.</p>
        </Panel>
      )}

      {d.showClinical && d.signed.length > 0 && (
        <Panel title="Visit summaries" icon={<NotebookText />}>
          <ul className="space-y-2 text-sm">
            {d.signed.map(({ v, doctor, title }) => {
              const meds = d.rx.filter((r) => r.visitId === v.id);
              return (
                <li key={v.id}>
                  <details className="group rounded-2xl border border-line bg-surface open:bg-surface-2">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="block font-medium text-fg">{dateOnly(v.startedAt, tz)}</span>
                        <span className="block truncate text-xs text-muted">{[title, doctor].filter(Boolean).join(" ")}</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-subtle transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <div className="space-y-3 border-t border-line px-4 py-3 text-muted">
                      {v.assessment && <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Assessment</div><p className="mt-0.5 whitespace-pre-wrap text-fg">{v.assessment}</p></div>}
                      {v.plan && <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Plan</div><p className="mt-0.5 whitespace-pre-wrap text-fg">{v.plan}</p></div>}
                      {meds.length > 0 && (
                        <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Prescriptions</div>
                          <ul className="mt-1 space-y-1">{meds.map(({ item }) => <li key={item.id} className="flex gap-2"><Pill className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /><span className="text-fg">{[item.drugName, item.dose, item.frequency, item.duration].filter(Boolean).join(" · ")}{item.instructions ? ` — ${item.instructions}` : ""}</span></li>)}</ul>
                        </div>
                      )}
                      {v.followUpDate && <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Follow-up</div><p className="mt-0.5 text-fg">{dateOnly(`${v.followUpDate}T12:00:00Z`, tz)}</p></div>}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {d.plan && (
        <Panel title="Log a home reading" icon={<HeartPulse />} eyebrow="Your care plan">
          <ActionForm action={logReadingAction} resetOnSuccess className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="BP top (systolic)"><Input name="bpSys" inputMode="numeric" placeholder="130" className="h-12 text-center text-lg tabular-nums" /></Field>
              <Field label="BP bottom (diastolic)"><Input name="bpDia" inputMode="numeric" placeholder="85" className="h-12 text-center text-lg tabular-nums" /></Field>
            </div>
            <Field label="Blood sugar (mmol/L)"><Input name="glucose" inputMode="decimal" placeholder="6.2" className="h-12 text-center text-lg tabular-nums" /></Field>
            <Submit size="lg" className="w-full">Save reading</Submit>
          </ActionForm>
          {d.readings.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Recent readings</div>
              <ul className="space-y-1.5 text-sm">
                {d.readings.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted tabular-nums">{dateTime(r.recordedAt, tz)}</span>
                    <span className="flex gap-1.5">
                      {r.bpSys ? <span className="rounded-md bg-accent/12 px-2 py-0.5 text-xs font-medium tabular-nums text-accent">BP {r.bpSys}/{r.bpDia}</span> : null}
                      {r.glucose ? <span className="rounded-md bg-accent-2/12 px-2 py-0.5 text-xs font-medium tabular-nums text-accent-2">Sugar {r.glucose}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-subtle"><Lock className="h-3 w-3" aria-hidden />Private link for {s.patient.firstName} — please don&apos;t share it. <Link href={base} className="underline underline-offset-4 hover:text-fg">Refresh</Link></p>
    </div>
  );
}
