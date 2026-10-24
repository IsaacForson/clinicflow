import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import Link from "next/link";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, LinkButton } from "@/components/ui";
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
  return (
    <div className="space-y-4">
      <ClinicHeader tenant={s.tenant} patientName={s.patient.firstName} />

      <Card title="Your appointments" actions={<LinkButton href={`${base}/book`} className="px-2 py-1 text-xs">Book new</LinkButton>}>
        {d.appts.length === 0 && <p className="text-sm text-slate-500">No upcoming appointments.</p>}
        <ul className="space-y-3">
          {d.appts.map(({ a, doctor, title }) => (
            <li key={a.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">{dateOnly(a.startsAt, tz)} · {timeOnly(a.startsAt, tz)}</div>
                  <div className="text-sm text-slate-500">{[title, doctor].filter(Boolean).join(" ") || "Any practitioner"}{a.reason ? ` · ${a.reason}` : ""}</div>
                </div>
                <Badge tone={a.status === "confirmed" ? "green" : "blue"}>{a.status}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.status === "scheduled" && <ActionButton action={confirmApptAction} fields={{ token, id: a.id }} variant="primary" className="px-3 py-2 text-sm">Confirm</ActionButton>}
                <LinkButton variant="secondary" href={`${base}/book?appt=${a.id}`}>Reschedule</LinkButton>
                <ActionButton action={cancelApptAction} fields={{ token, id: a.id }} variant="ghost" confirm="Cancel this appointment?" className="px-3 py-2 text-sm">Cancel</ActionButton>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {d.invoices.length > 0 && (
        <Card title="Bills">
          <ul className="divide-y divide-slate-100">
            {d.invoices.map((i) => {
              const balance = i.patientPortionMinor - i.paidMinor;
              return (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{i.invoiceNo} · {money(i.totalMinor, cur)}</div>
                    <div className="text-xs text-slate-500">{dateOnly(i.createdAt, tz)} · {balance > 0 ? `Balance ${money(balance, cur)}` : "Paid"}</div>
                  </div>
                  {balance > 0 && <ActionButton action={payInvoiceAction} fields={{ token, id: i.id }} variant="primary" className="px-3 py-2 text-sm">Pay now</ActionButton>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {d.labs.length > 0 && (
        <Card title="Test results">
          <ul className="divide-y divide-slate-100 text-sm">
            {d.labs.map(({ o, item }) => (
              <li key={item.id} className="py-2">
                <div className="flex justify-between gap-2"><span className="font-medium text-slate-900">{item.name}</span><span className="text-xs text-slate-500">{dateOnly(item.resultedAt ?? o.createdAt, tz)}</span></div>
                <div className="text-slate-700">{[item.resultValue, item.unit].filter(Boolean).join(" ")}{item.refRange ? <span className="text-slate-500"> (range {item.refRange})</span> : null} {item.flag && item.flag !== "normal" && <Badge tone="yellow">{item.flag}</Badge>}</div>
                {item.resultText && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.resultText}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Please discuss your results with your clinic.</p>
        </Card>
      )}

      {d.showClinical && d.signed.length > 0 && (
        <Card title="Visit summaries">
          <ul className="space-y-3 text-sm">
            {d.signed.map(({ v, doctor, title }) => {
              const meds = d.rx.filter((r) => r.visitId === v.id);
              return (
                <li key={v.id}>
                  <details className="rounded-md border border-slate-200 p-3">
                    <summary className="cursor-pointer font-medium text-slate-900">{dateOnly(v.startedAt, tz)} · {[title, doctor].filter(Boolean).join(" ")}</summary>
                    <div className="mt-2 space-y-2 text-slate-700">
                      {v.assessment && <p><span className="font-medium">Assessment: </span><span className="whitespace-pre-wrap">{v.assessment}</span></p>}
                      {v.plan && <p><span className="font-medium">Plan: </span><span className="whitespace-pre-wrap">{v.plan}</span></p>}
                      {meds.length > 0 && (
                        <div><span className="font-medium">Prescriptions:</span>
                          <ul className="ml-4 list-disc">{meds.map(({ item }) => <li key={item.id}>{[item.drugName, item.dose, item.frequency, item.duration].filter(Boolean).join(" · ")}{item.instructions ? ` — ${item.instructions}` : ""}</li>)}</ul>
                        </div>
                      )}
                      {v.followUpDate && <p><span className="font-medium">Follow-up: </span>{dateOnly(`${v.followUpDate}T12:00:00Z`, tz)}</p>}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {d.plan && (
        <Card title="Log a home reading">
          <ActionForm action={logReadingAction} resetOnSuccess>
            <input type="hidden" name="token" value={token} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="BP top (systolic)"><Input name="bpSys" inputMode="numeric" placeholder="130" /></Field>
              <Field label="BP bottom (diastolic)"><Input name="bpDia" inputMode="numeric" placeholder="85" /></Field>
            </div>
            <Field label="Blood sugar (mmol/L)"><Input name="glucose" inputMode="decimal" placeholder="6.2" /></Field>
            <Submit className="w-full py-3">Save reading</Submit>
          </ActionForm>
          {d.readings.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
              {d.readings.map((r) => <li key={r.id}>{dateTime(r.recordedAt, tz)}: {r.bpSys ? `BP ${r.bpSys}/${r.bpDia}` : ""} {r.glucose ? `Sugar ${r.glucose}` : ""}</li>)}
            </ul>
          )}
        </Card>
      )}

      <p className="pt-2 text-center text-xs text-slate-400">Private link for {s.patient.firstName} — please don&apos;t share it. <Link href={base} className="underline">Refresh</Link></p>
    </div>
  );
}
