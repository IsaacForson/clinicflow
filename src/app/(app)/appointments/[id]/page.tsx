import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Dl, Field, Input, PageHeader, Select } from "@/components/ui";
import { appointments, intakeForms, invoices, patients, queueTickets, services, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName, localDay, money, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  rescheduleAppointmentAction, sendIntakeFormAction, sendJoinLinkAction, sendPaymentLinkAction, setAppointmentStatusAction,
} from "../actions";
import { branchPractitioners } from "../data";
import { ACTION_LABEL, canReschedule, hhmm, localMinutes, nextStatuses, practitionerName, STATUS_LABEL, STATUS_TONE } from "../lib";

export default async function AppointmentPage({ params }: PageProps<"/appointments/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("appointments.manage");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ a: appointments, p: patients, service: services.name, doc: { name: users.name, title: users.title } })
      .from(appointments).innerJoin(patients, eq(patients.id, appointments.patientId))
      .leftJoin(services, eq(services.id, appointments.serviceId)).leftJoin(users, eq(users.id, appointments.practitionerId))
      .where(eq(appointments.id, id));
    if (!row) return null;
    await audit(t, ctx, "view", "appointment", id, { patientId: row.a.patientId });
    return {
      ...row,
      inv: row.a.prepaidInvoiceId ? (await t.select().from(invoices).where(eq(invoices.id, row.a.prepaidInvoiceId)))[0] : undefined,
      forms: await t.select().from(intakeForms).where(eq(intakeForms.appointmentId, id)).orderBy(desc(intakeForms.createdAt)),
      ticket: (await t.select().from(queueTickets).where(eq(queueTickets.appointmentId, id)).orderBy(desc(queueTickets.createdAt)).limit(1))[0],
      practitioners: await branchPractitioners(t, ctx),
    };
  });
  if (!data) notFound();
  const { a, p, inv } = data;
  const tz = ctx.tenant.timezone;
  const cur = ctx.tenant.currency;
  const write = ctx.access === "full";
  const paid = !inv || inv.status === "paid";

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{fullName(p)} <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>{a.telehealth && <Badge tone="purple">Video</Badge>}</span>}
        subtitle={`${dateTime(a.startsAt, tz, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${timeOnly(a.startsAt, tz)}–${timeOnly(a.endsAt, tz)}`}
        actions={write && nextStatuses(a.status).map((s) => (
          <ActionButton key={s} action={setAppointmentStatusAction} fields={{ id: a.id, status: s }} variant={s === "arrived" ? "primary" : s === "cancelled" ? "danger" : "secondary"}
            className="px-3 py-2 text-sm" confirm={s === "cancelled" ? "Cancel this appointment?" : s === "no_show" ? "Mark as no-show?" : undefined}>
            {s === "arrived" ? "Arrived → add to queue" : ACTION_LABEL[s]}
          </ActionButton>
        ))}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Details">
            <Dl items={[
              ["Patient", <Link key="p" href={`/patients/${p.id}`} className="text-teal-800 hover:underline">{fullName(p)} ({p.patientNo})</Link>],
              ["Phone", p.phone],
              ["Practitioner", practitionerName(data.doc)],
              ["Service", data.service],
              ["Reason", a.reason],
              ["Booked via", a.source.replace("_", " ")],
              ["Queue ticket", data.ticket ? `#${data.ticket.ticketNo} · ${data.ticket.status.replace("_", " ")}` : null],
            ]} />
          </Card>

          {write && canReschedule(a.status) && (
            <Card title="Reschedule">
              <ActionForm action={rescheduleAppointmentAction}>
                <input type="hidden" name="id" value={a.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Practitioner">
                    <Select name="practitionerId" defaultValue={a.practitionerId ?? ""} required>
                      <option value="" disabled>Choose…</option>
                      {data.practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date"><Input type="date" name="date" defaultValue={localDay(tz, a.startsAt)} required /></Field>
                  <Field label="Time"><Input type="time" name="time" step={300} defaultValue={hhmm(localMinutes(a.startsAt, tz))} required /></Field>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Submit>Reschedule</Submit>
                  <label className="flex items-center gap-2 text-sm text-slate-500"><input type="checkbox" name="force" /> Book anyway if the slot is taken</label>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {a.telehealth && (
            <Card title="Video consultation">
              <div className="space-y-3 text-sm">
                {a.telehealthUrl && <a href={a.telehealthUrl} target="_blank" rel="noreferrer" className="block break-all text-teal-800 underline">{a.telehealthUrl}</a>}
                {inv && (
                  <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                    <span>{inv.invoiceNo} · {money(inv.patientPortionMinor, cur)}</span>
                    <Badge tone={paid ? "green" : "yellow"}>{paid ? "Paid" : `Due ${money(inv.patientPortionMinor - inv.paidMinor, cur)}`}</Badge>
                  </div>
                )}
                {write && inv && !paid && can(ctx.user.role, "payments.receive") && (
                  <ActionForm action={sendPaymentLinkAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Submit variant="secondary" className="w-full">Send payment link</Submit>
                  </ActionForm>
                )}
                {write && (
                  <ActionForm action={sendJoinLinkAction}>
                    <input type="hidden" name="id" value={a.id} />
                    {paid ? <Submit className="w-full">Send join link</Submit>
                      : ctx.user.role === "owner" ? <>
                        <input type="hidden" name="override" value="1" />
                        <Submit variant="secondary" className="w-full">Send join link anyway (owner override)</Submit>
                      </> : <Submit disabled className="w-full">Send join link (after payment)</Submit>}
                  </ActionForm>
                )}
              </div>
            </Card>
          )}

          <Card title="Intake form">
            <div className="space-y-3 text-sm">
              {data.forms.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">Sent {dateTime(f.createdAt, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {f.status === "sent" ? <Badge tone={f.expiresAt < new Date() ? "gray" : "blue"}>{f.expiresAt < new Date() ? "Expired" : "Awaiting patient"}</Badge>
                    : <Link href={`/appointments/intake/${f.id}`} className="text-teal-800 underline">{f.status === "submitted" ? "Review" : "View (applied)"}</Link>}
                </div>
              ))}
              {write && (
                <ActionForm action={sendIntakeFormAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <Submit variant="secondary" className="w-full">{data.forms.length ? "Send a new intake form" : "Send intake form"}</Submit>
                </ActionForm>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
