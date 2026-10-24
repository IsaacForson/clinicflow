import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { AlertTriangle, CalendarClock, CalendarDays, Check, CircleSlash, ClipboardList, CreditCard, ExternalLink, FileSignature, Phone, Send, UserRound, Video } from "lucide-react";
import { Avatar, Badge, Callout, Dl, Field, Input, LinkButton, PageHeader, Panel, Select, cx } from "@/components/ui";
import { appointments, intakeForms, invoices, patients, queueTickets, services, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName, localDay, money, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  rescheduleAppointmentAction, sendIntakeFormAction, sendJoinLinkAction, sendPaymentLinkAction, setAppointmentStatusAction,
} from "../actions";
import { Toggle } from "../bits";
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

  const STEPS = ["scheduled", "confirmed", "arrived", "completed"] as const;
  const ended = a.status === "cancelled" || a.status === "no_show";
  const reached = ended ? -1 : STEPS.indexOf(a.status as (typeof STEPS)[number]);
  const moves = write ? nextStatuses(a.status) : [];
  const forward = moves.filter((s) => s !== "cancelled" && s !== "no_show");
  const exits = moves.filter((s) => s === "cancelled" || s === "no_show");
  const fmtSent = (d: Date) => dateTime(d, tz, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <PageHeader title="Appointment" eyebrow="Front desk · Appointment" icon={<CalendarClock />}
        subtitle={`${fullName(p)} · ${dateTime(a.startsAt, tz, { weekday: "short", day: "numeric", month: "short" })}`}
        actions={<>
          <LinkButton variant="ghost" href={`/appointments?date=${localDay(tz, a.startsAt)}`}><CalendarDays className="h-4 w-4" aria-hidden /> Calendar</LinkButton>
          <LinkButton variant="secondary" href={`/patients/${p.id}`}><UserRound className="h-4 w-4" aria-hidden /> Patient record</LinkButton>
        </>} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {/* Hero */}
          <Panel glow bodyClassName="p-0">
            <div className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-aurora opacity-15 blur-3xl" aria-hidden />
              <div className="relative flex flex-wrap items-start gap-5">
                <Avatar name={fullName(p)} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/patients/${p.id}`} className="truncate text-xl font-semibold tracking-tight text-fg hover:text-accent">{fullName(p)}</Link>
                    <Badge tone={STATUS_TONE[a.status]} pulse={a.status === "arrived"}>{STATUS_LABEL[a.status]}</Badge>
                    {a.telehealth && <Badge tone="purple">Video</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="font-mono">{p.patientNo}</span>
                    {p.phone && <span className="inline-flex items-center gap-1 tabular-nums"><Phone className="h-3 w-3" aria-hidden />{p.phone}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-3xl font-semibold tracking-tight text-fg tabular-nums">{timeOnly(a.startsAt, tz)}</div>
                  <div className="text-xs text-muted">to {timeOnly(a.endsAt, tz)} · {dateTime(a.startsAt, tz, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
              </div>

              {/* Status stepper */}
              <ol className="relative mt-7 grid grid-cols-4 gap-2" aria-label="Appointment progress">
                {STEPS.map((s, i) => {
                  const done = i <= reached;
                  return (
                    <li key={s} className="flex flex-col gap-2">
                      <span className={cx("h-1.5 rounded-full", done ? "bg-aurora shadow-glow" : "bg-surface-3")} aria-hidden />
                      <span className={cx("flex items-center gap-1.5 text-xs font-medium", i === reached ? "text-fg" : done ? "text-muted" : "text-subtle")}>
                        {done && <Check className="h-3 w-3 text-accent" aria-hidden />}{STATUS_LABEL[s]}
                        {i === reached && <span className="sr-only">(current)</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {ended && (
                <div className="mt-4"><Callout tone={a.status === "no_show" ? "red" : "gray"} icon={<CircleSlash />}>This appointment was marked {STATUS_LABEL[a.status].toLowerCase()}.</Callout></div>
              )}

              {(forward.length > 0 || exits.length > 0) && (
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  {forward.map((s) => (
                    <ActionButton key={s} action={setAppointmentStatusAction} fields={{ id: a.id, status: s }} variant={s === "arrived" ? "primary" : "secondary"}
                      className="h-10 px-4 text-sm">
                      {s === "arrived" ? "Arrived → add to queue" : ACTION_LABEL[s]}
                    </ActionButton>
                  ))}
                  <span className="flex-1" />
                  {exits.map((s) => (
                    <ActionButton key={s} action={setAppointmentStatusAction} fields={{ id: a.id, status: s }} variant={s === "cancelled" ? "danger" : "ghost"}
                      className="h-10 px-4 text-sm" confirm={s === "cancelled" ? "Cancel this appointment?" : "Mark as no-show?"}>
                      {ACTION_LABEL[s]}
                    </ActionButton>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Details" eyebrow="Booking" icon={<ClipboardList />}>
            <Dl items={[
              ["Practitioner", practitionerName(data.doc)],
              ["Service", data.service],
              ["Reason", a.reason],
              ["Booked via", <span key="s" className="capitalize">{a.source.replace("_", " ")}</span>],
              ["Queue ticket", data.ticket ? <span key="t" className="flex items-center gap-2"><span className="font-mono">#{data.ticket.ticketNo}</span><Badge tone="purple">{data.ticket.status.replace("_", " ")}</Badge></span> : null],
              ["Phone", p.phone],
            ]} />
          </Panel>

          {write && canReschedule(a.status) && (
            <Panel title="Reschedule" eyebrow="Move booking" icon={<CalendarClock />}>
              <ActionForm action={rescheduleAppointmentAction} className="space-y-4">
                <input type="hidden" name="id" value={a.id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Practitioner">
                    <Select name="practitionerId" defaultValue={a.practitionerId ?? ""} required>
                      <option value="" disabled>Choose…</option>
                      {data.practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Date"><Input type="date" name="date" defaultValue={localDay(tz, a.startsAt)} required /></Field>
                  <Field label="Time"><Input type="time" name="time" step={300} defaultValue={hhmm(localMinutes(a.startsAt, tz))} required /></Field>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex-1"><Toggle name="force" tone="warn" icon={<AlertTriangle />} label="Book anyway" hint="Ignore clashes, past times and opening hours" /></div>
                  <Submit>Reschedule</Submit>
                </div>
              </ActionForm>
            </Panel>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {a.telehealth && (
            <Panel title="Video consultation" eyebrow="Telehealth" icon={<Video />}>
              <div className="space-y-3 text-sm">
                {a.telehealthUrl && (
                  <a href={a.telehealthUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-accent transition hover:border-accent/40">
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{a.telehealthUrl}</span>
                  </a>
                )}
                {inv && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-muted">{inv.invoiceNo}</span>
                      <span className="block font-medium tabular-nums text-fg">{money(inv.patientPortionMinor, cur)}</span>
                    </span>
                    <Badge tone={paid ? "green" : "yellow"}>{paid ? "Paid" : `Due ${money(inv.patientPortionMinor - inv.paidMinor, cur)}`}</Badge>
                  </div>
                )}
                {write && inv && !paid && can(ctx.user.role, "payments.receive") && (
                  <ActionForm action={sendPaymentLinkAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Submit variant="secondary" className="w-full"><CreditCard className="h-4 w-4" aria-hidden /> Send payment link</Submit>
                  </ActionForm>
                )}
                {write && (
                  <ActionForm action={sendJoinLinkAction}>
                    <input type="hidden" name="id" value={a.id} />
                    {paid ? <Submit className="w-full"><Send className="h-4 w-4" aria-hidden /> Send join link</Submit>
                      : ctx.user.role === "owner" ? <>
                        <input type="hidden" name="override" value="1" />
                        <Submit variant="secondary" className="w-full">Send join link anyway (owner override)</Submit>
                      </> : <Submit disabled className="w-full">Send join link (after payment)</Submit>}
                  </ActionForm>
                )}
              </div>
            </Panel>
          )}

          {!a.telehealth && inv && (
            <Panel title="Prepayment" eyebrow="Billing" icon={<CreditCard />}>
              <div className="flex items-center justify-between gap-2">
                <span><span className="block font-mono text-xs text-muted">{inv.invoiceNo}</span><span className="block text-lg font-semibold tabular-nums text-fg">{money(inv.patientPortionMinor, cur)}</span></span>
                <Badge tone={paid ? "green" : "yellow"}>{paid ? "Paid" : `Due ${money(inv.patientPortionMinor - inv.paidMinor, cur)}`}</Badge>
              </div>
            </Panel>
          )}

          <Panel title="Intake form" eyebrow="Before the visit" icon={<FileSignature />}>
            <div className="space-y-3 text-sm">
              {data.forms.length === 0 && <p className="text-muted">Send the patient a link to fill in their details, allergies and consents from their phone.</p>}
              {data.forms.length > 0 && (
                <ul className="space-y-1.5">
                  {data.forms.map((f) => {
                    const expired = f.status === "sent" && f.expiresAt < new Date();
                    return (
                      <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
                        <span className="text-xs text-muted">Sent {fmtSent(f.createdAt)}</span>
                        {f.status === "sent" ? <Badge tone={expired ? "gray" : "blue"}>{expired ? "Expired" : "Awaiting patient"}</Badge>
                          : <Link href={`/appointments/intake/${f.id}`} className="text-xs font-medium text-accent hover:underline">{f.status === "submitted" ? "Review →" : "View (applied)"}</Link>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {write && (
                <ActionForm action={sendIntakeFormAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <Submit variant="secondary" className="w-full"><Send className="h-4 w-4" aria-hidden /> {data.forms.length ? "Send a new intake form" : "Send intake form"}</Submit>
                </ActionForm>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
