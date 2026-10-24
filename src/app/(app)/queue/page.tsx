import { and, eq } from "drizzle-orm";
import { Activity, BellRing, ChevronDown, CircleCheck, CreditCard, FlaskConical, Hourglass, ListOrdered, PhoneCall, Pill, Siren, Sparkles, Stethoscope, Ticket, Timer, Tv } from "lucide-react";
import type { ReactNode } from "react";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { A, Avatar, Badge, EmptyState, Field, IconTile, Input, Kpi, LinkButton, PageHeader, Panel, Select, StatusDot, cx, type Tone } from "@/components/ui";
import { patients, queueTickets, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { fullName, localDay, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/plans";
import { branchPractitioners } from "../appointments/data";
import { practitionerName } from "../appointments/lib";
import { Toggle } from "../appointments/bits";
import { PatientChip, PatientSearch } from "../appointments/patient-search";
import { Refresher } from "./display/refresher";
import { addToQueueAction, assignTicketAction, callNextAction, moveTicketAction, togglePriorityAction } from "./actions";
import { averageWaitMinutes, BOARD_COLUMNS, byNext, minutesSince, SHORT_LABEL, type QueueStatus } from "./lib";

export const metadata = { title: "Queue" };

export default async function QueuePage({ searchParams }: PageProps<"/queue">) {
  const ctx = await requireCtx("queue.manage");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const patientId = typeof sp.patient === "string" ? sp.patient : undefined;
  if (!hasFeature(ctx.tenant, "queue")) {
    return <><PageHeader title="Queue" eyebrow="Front desk · Live" icon={<ListOrdered />} /><Panel><EmptyState icon={<Sparkles />} title="The walk-in queue is part of the Clinic plan">Give walk-ins a ticket, call them in order and show a TV board in the waiting room. Upgrade in <A href="/settings/subscription">Settings → Subscription</A>.</EmptyState></Panel></>;
  }
  const tz = ctx.tenant.timezone;
  const day = localDay(tz);
  const { tickets, practitioners, picked } = await tx(ctx, async (t) => ({
    tickets: await t.select({ q: queueTickets, p: { firstName: patients.firstName, lastName: patients.lastName, otherNames: patients.otherNames, patientNo: patients.patientNo }, doc: { name: users.name, title: users.title } })
      .from(queueTickets).innerJoin(patients, eq(patients.id, queueTickets.patientId)).leftJoin(users, eq(users.id, queueTickets.practitionerId))
      .where(and(eq(queueTickets.branchId, ctx.branchId), eq(queueTickets.day, day))),
    practitioners: await branchPractitioners(t, ctx),
    picked: patientId && /^[0-9a-f-]{36}$/i.test(patientId) ? (await t.select().from(patients).where(eq(patients.id, patientId)))[0] : undefined,
  }));
  const write = ctx.access === "full";
  const avg = averageWaitMinutes(tickets.map((r) => r.q));
  const waiting = tickets.filter((r) => r.q.status === "waiting");
  const col = (s: QueueStatus) => tickets.filter((r) => r.q.status === s).sort((a, b) => s === "waiting" ? byNext(a.q, b.q) : (b.q.calledAt ?? b.q.createdAt).getTime() - (a.q.calledAt ?? a.q.createdAt).getTime());

  const urgent = waiting.filter((r) => r.q.priority > 0).length;
  const seen = tickets.filter((r) => r.q.status !== "waiting" && r.q.status !== "left").length;
  const inClinic = tickets.filter((r) => r.q.status !== "done" && r.q.status !== "left").length;

  return (
    <>
      <Refresher seconds={30} />
      <PageHeader title="Queue" eyebrow="Front desk · Live" icon={<ListOrdered />}
        subtitle={<span className="inline-flex items-center gap-2"><StatusDot tone="green" label="Live" /> {waiting.length} waiting{avg !== null && ` · avg ${avg} min`} · updates every 30 s</span>}
        actions={<LinkButton variant="secondary" href="/queue/display" target="_blank"><Tv className="h-4 w-4" aria-hidden /> TV display</LinkButton>} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Waiting" value={waiting.length} icon={<Hourglass />} tone="yellow" sub={urgent ? <span className="font-medium text-bad">{urgent} urgent</span> : "none urgent"} />
        <Kpi label="Average wait" value={avg === null ? "—" : `${avg}m`} icon={<Timer />} tone="blue" sub="Joined → called, today" />
        <Kpi label="In clinic" value={inClinic} icon={<Activity />} tone="teal" sub="Not yet done" />
        <Kpi label="Seen today" value={seen} icon={<CircleCheck />} tone="green" sub={`${tickets.length} tickets issued`} />
      </div>

      {write && (
        <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Add to queue" eyebrow="Walk-in" icon={<Ticket />} glow={!!picked}>
            {picked ? (
              <ActionForm action={addToQueueAction} onSuccessHref="/queue" successMessage="Added to the queue." className="space-y-4">
                <input type="hidden" name="patientId" value={picked.id} />
                <PatientChip p={picked} changeHref="/queue" />
                <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <Field label="Practitioner">
                    <Select name="practitionerId" defaultValue="">
                      <option value="">Next available</option>
                      {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Note"><Input name="note" placeholder="e.g. fever, review" maxLength={200} /></Field>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex-1"><Toggle name="urgent" tone="bad" icon={<Siren />} label="Urgent" hint="Jumps to the front of the line" /></div>
                  <Submit size="lg" className="sm:w-48"><Ticket className="h-4 w-4" aria-hidden /> Give ticket</Submit>
                </div>
              </ActionForm>
            ) : (
              <PatientSearch ctx={ctx} q={q} action="/queue" hrefFor={(id) => `/queue?patient=${id}`} />
            )}
          </Panel>
          <Panel title="Call next" eyebrow="Per practitioner" icon={<BellRing />}>
            {practitioners.length ? (
              <ul className="space-y-2">
                {practitioners.map((d) => {
                  const n = waiting.filter((r) => !r.q.practitionerId || r.q.practitionerId === d.id).length;
                  const serving = tickets.find((r) => r.q.status === "with_doctor" && r.q.practitionerId === d.id);
                  return (
                    <li key={d.id}>
                      <ActionForm action={callNextAction} className="space-y-2">
                        <input type="hidden" name="practitionerId" value={d.id} />
                        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
                          <Avatar name={practitionerName(d)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-fg">{practitionerName(d)}</span>
                            <span className="block text-xs text-muted">
                              <span className="tabular-nums">{n}</span> waiting{serving && <> · with <span className="font-mono text-accent">#{serving.q.ticketNo}</span></>}
                            </span>
                          </span>
                          <Submit size="sm" disabled={!n}><PhoneCall className="h-3.5 w-3.5" aria-hidden /> Call</Submit>
                        </div>
                      </ActionForm>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState compact icon={<Stethoscope />} title="No practitioners at this branch">Mark staff as practitioners in Settings → Users.</EmptyState>}
          </Panel>
        </div>
      )}

      {/* Board: horizontally scrolling glass lanes */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
        {BOARD_COLUMNS.map((c) => {
          const rows = col(c.key);
          const L = LANE[c.key];
          return (
            <section key={c.key} aria-label={`${c.label}: ${rows.length}`} className="glass flex w-[290px] shrink-0 snap-start flex-col animate-rise">
              <header className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
                <IconTile tone={L.tone} className="h-8 w-8">{L.icon}</IconTile>
                <h2 className="flex-1 text-sm font-semibold tracking-tight text-fg">{c.label}</h2>
                {rows.length > 0 && c.key !== "done" && <StatusDot tone={L.tone} pulse={c.key === "waiting" || c.key === "with_doctor"} />}
                <span className="rounded-lg bg-surface-3 px-2 py-0.5 font-mono text-xs tabular-nums text-muted">{rows.length}</span>
              </header>
              <ul className="flex-1 space-y-2.5 p-3">
                {rows.length === 0 && <li className="rounded-2xl border border-dashed border-line px-3 py-8 text-center text-xs text-subtle">{L.empty}</li>}
                {rows.map(({ q: tk, p, doc }) => {
                  const mins = minutesSince(tk.createdAt);
                  return (
                    <li key={tk.id} className={cx("group rounded-2xl border bg-surface-2 p-3.5 transition hover:-translate-y-px hover:border-line-strong",
                      tk.priority > 0 && c.key === "waiting" ? "border-bad/50 bg-bad/10 shadow-[0_0_0_1px_var(--bad),0_12px_32px_-12px_var(--bad)]" : "border-line",
                      c.key === "done" && "opacity-70")}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={cx("font-mono text-[34px] font-semibold leading-none tracking-tight tabular-nums", c.key === "with_doctor" ? "text-aurora" : "text-fg")}>
                          <span className="text-lg text-subtle">#</span>{tk.ticketNo}
                        </span>
                        <div className="flex flex-col items-end gap-1.5">
                          {tk.priority > 0 && <Badge tone="red" pulse>Urgent</Badge>}
                          <span className={cx("inline-flex items-center gap-1 font-mono text-xs tabular-nums", c.key === "waiting" && mins >= 30 ? "text-warn" : "text-muted")}>
                            {c.key === "waiting" ? <><Timer className="h-3 w-3" aria-hidden />{mins} min</> : timeOnly(tk.calledAt ?? tk.createdAt, tz)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2.5">
                        <Avatar name={fullName(p)} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-fg">{fullName(p)}</div>
                          <div className="truncate text-xs text-muted">{doc ? practitionerName(doc) : "Unassigned"}{tk.note && ` · ${tk.note}`}</div>
                        </div>
                      </div>
                      {write && c.key !== "done" && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {can(ctx.user.role, "clinical.write") && (c.key === "waiting" || c.key === "with_doctor") && (
                            <LinkButton href={`/visits/new?ticket=${tk.id}`} size="sm"><Stethoscope className="h-3.5 w-3.5" aria-hidden /> Consult</LinkButton>
                          )}
                          <details className="group/move relative">
                            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-muted transition hover:bg-surface-3 hover:text-fg [&::-webkit-details-marker]:hidden">
                              Move <ChevronDown className="h-3 w-3 transition group-open/move:rotate-180" aria-hidden />
                            </summary>
                            <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-2">
                              <div className="flex flex-wrap gap-1">
                                {BOARD_COLUMNS.filter((x) => x.key !== c.key).map((x) => (
                                  <ActionButton key={x.key} action={moveTicketAction} fields={{ id: tk.id, status: x.key }}>{SHORT_LABEL[x.key]}</ActionButton>
                                ))}
                              </div>
                              {c.key === "waiting" && <>
                                <div className="flex flex-wrap gap-1 border-t border-line pt-2">
                                  <ActionButton action={togglePriorityAction} fields={{ id: tk.id }} variant="ghost">{tk.priority > 0 ? "Not urgent" : "Mark urgent"}</ActionButton>
                                  <ActionButton action={moveTicketAction} fields={{ id: tk.id, status: "left" }} variant="ghost" confirm="Mark as left without being seen?">Left</ActionButton>
                                </div>
                                <ActionForm action={assignTicketAction} className="flex gap-1 space-y-0 border-t border-line pt-2">
                                  <input type="hidden" name="id" value={tk.id} />
                                  <Select name="practitionerId" defaultValue={tk.practitionerId ?? ""} aria-label="Assign practitioner" className="h-8 text-xs">
                                    <option value="">Any</option>
                                    {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                                  </Select>
                                  <Submit variant="secondary" size="sm">Assign</Submit>
                                </ActionForm>
                              </>}
                            </div>
                          </details>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

const LANE: Record<QueueStatus, { tone: Tone; icon: ReactNode; empty: string }> = {
  waiting: { tone: "yellow", icon: <Hourglass />, empty: "Nobody waiting" },
  with_doctor: { tone: "purple", icon: <Stethoscope />, empty: "No one in consultation" },
  lab: { tone: "blue", icon: <FlaskConical />, empty: "Lab is clear" },
  billing: { tone: "teal", icon: <CreditCard />, empty: "Nothing to bill" },
  pharmacy: { tone: "green", icon: <Pill />, empty: "Pharmacy is clear" },
  done: { tone: "gray", icon: <CircleCheck />, empty: "Finished visits show here" },
  left: { tone: "gray", icon: <CircleCheck />, empty: "" },
};
