import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Empty, Field, Input, LinkButton, PageHeader, Select, Stat, cx } from "@/components/ui";
import { patients, queueTickets, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { fullName, localDay, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/plans";
import { branchPractitioners } from "../appointments/data";
import { practitionerName } from "../appointments/lib";
import { PatientSearch } from "../appointments/patient-search";
import { addToQueueAction, assignTicketAction, callNextAction, moveTicketAction, togglePriorityAction } from "./actions";
import { averageWaitMinutes, BOARD_COLUMNS, byNext, minutesSince, SHORT_LABEL, type QueueStatus } from "./lib";

export const metadata = { title: "Queue · ClinicFlow" };

export default async function QueuePage({ searchParams }: PageProps<"/queue">) {
  const ctx = await requireCtx("queue.manage");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const patientId = typeof sp.patient === "string" ? sp.patient : undefined;
  if (!hasFeature(ctx.tenant, "queue")) {
    return <><PageHeader title="Queue" /><Empty title="The walk-in queue is part of the Clinic plan">Upgrade in Settings → Subscription.</Empty></>;
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

  return (
    <>
      <PageHeader title="Queue" subtitle={`Today · ${day}`} actions={<LinkButton variant="secondary" href="/queue/display" target="_blank">TV display</LinkButton>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting" value={waiting.length} sub={waiting.some((r) => r.q.priority > 0) ? `${waiting.filter((r) => r.q.priority > 0).length} urgent` : undefined} />
        <Stat label="Average wait" value={avg === null ? "—" : `${avg} min`} sub="Joined → called, today" />
        <Stat label="Seen today" value={tickets.filter((r) => r.q.status !== "waiting" && r.q.status !== "left").length} />
      </div>

      {write && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Card title="Add to queue" className="lg:col-span-2">
            {picked ? (
              <ActionForm action={addToQueueAction} onSuccessHref="/queue" successMessage="Added to the queue.">
                <input type="hidden" name="patientId" value={picked.id} />
                <div className="flex items-center justify-between rounded-md bg-teal-50 px-3 py-2">
                  <span className="font-medium text-teal-900">{fullName(picked)} <span className="text-xs text-teal-700">{picked.patientNo}</span></span>
                  <Link href="/queue" className="text-sm text-teal-800 underline">Change</Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Practitioner">
                    <Select name="practitionerId" defaultValue="">
                      <option value="">Next available</option>
                      {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Note" className="sm:col-span-2"><Input name="note" placeholder="e.g. fever, review" maxLength={200} /></Field>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-red-700"><input type="checkbox" name="urgent" className="h-5 w-5" /> Urgent</label>
                  <Submit className="px-6 py-3">Give ticket</Submit>
                </div>
              </ActionForm>
            ) : (
              <PatientSearch ctx={ctx} q={q} action="/queue" hrefFor={(id) => `/queue?patient=${id}`} />
            )}
          </Card>
          <Card title="Call next">
            {practitioners.length ? (
              <div className="space-y-2">
                {practitioners.map((d) => {
                  const n = waiting.filter((r) => !r.q.practitionerId || r.q.practitionerId === d.id).length;
                  return (
                    <ActionForm key={d.id} action={callNextAction} className="space-y-1">
                      <input type="hidden" name="practitionerId" value={d.id} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-800">{practitionerName(d)} <span className="text-xs text-slate-500">({n} waiting)</span></span>
                        <Submit disabled={!n} className="px-3 py-2">Call next</Submit>
                      </div>
                    </ActionForm>
                  );
                })}
              </div>
            ) : <p className="text-sm text-slate-500">No practitioners set up for this branch.</p>}
          </Card>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {BOARD_COLUMNS.map((c) => {
          const rows = col(c.key);
          return (
            <section key={c.key} className="rounded-lg bg-slate-100 p-2">
              <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {c.label} <span className="rounded-full bg-white px-2 text-slate-700">{rows.length}</span>
              </h2>
              <ul className="space-y-2">
                {rows.map(({ q: tk, p, doc }) => (
                  <li key={tk.id} className={cx("rounded-md bg-white p-2 shadow-sm ring-1", tk.priority > 0 ? "ring-red-300" : "ring-slate-200")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl font-bold tabular-nums text-slate-900">{tk.ticketNo}</span>
                      <div className="text-right text-xs text-slate-500">
                        {tk.priority > 0 && <Badge tone="red">Urgent</Badge>}
                        <div>{c.key === "waiting" ? `${minutesSince(tk.createdAt)} min` : timeOnly(tk.calledAt ?? tk.createdAt, tz)}</div>
                      </div>
                    </div>
                    <div className="truncate text-sm font-medium text-slate-900">{fullName(p)}</div>
                    <div className="truncate text-xs text-slate-500">{doc ? practitionerName(doc) : "Unassigned"}{tk.note && ` · ${tk.note}`}</div>
                    {write && c.key !== "done" && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {can(ctx.user.role, "clinical.write") && (c.key === "waiting" || c.key === "with_doctor") && (
                          <LinkButton href={`/visits/new?ticket=${tk.id}`} className="px-2 py-1 text-xs">Start consultation</LinkButton>
                        )}
                        {BOARD_COLUMNS.filter((x) => x.key !== c.key).map((x) => (
                          <ActionButton key={x.key} action={moveTicketAction} fields={{ id: tk.id, status: x.key }}>{SHORT_LABEL[x.key]}</ActionButton>
                        ))}
                        {c.key === "waiting" && <>
                          <ActionButton action={togglePriorityAction} fields={{ id: tk.id }} variant="ghost">{tk.priority > 0 ? "Not urgent" : "Urgent"}</ActionButton>
                          <ActionButton action={moveTicketAction} fields={{ id: tk.id, status: "left" }} variant="ghost" confirm="Mark as left without being seen?">Left</ActionButton>
                        </>}
                      </div>
                    )}
                    {write && c.key === "waiting" && (
                      <ActionForm action={assignTicketAction} className="mt-2 flex gap-1 space-y-0">
                        <input type="hidden" name="id" value={tk.id} />
                        <Select name="practitionerId" defaultValue={tk.practitionerId ?? ""} aria-label="Assign practitioner" className="py-1 text-xs">
                          <option value="">Any</option>
                          {practitioners.map((d) => <option key={d.id} value={d.id}>{practitionerName(d)}</option>)}
                        </Select>
                        <Submit variant="secondary" className="px-2 py-1 text-xs">Assign</Submit>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
