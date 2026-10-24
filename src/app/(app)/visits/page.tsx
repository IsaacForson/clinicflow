import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { ArrowRight, CheckCircle2, Clock, Hourglass, Stethoscope, Users } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/form";
import { Avatar, Badge, EmptyState, Kpi, LinkButton, PageHeader, Tabs } from "@/components/ui";
import { patients, queueTickets, users, visits } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { age, dayRange, fullName, localDay, timeOnly } from "@/lib/format";
import { can } from "@/lib/permissions";
import { startVisitAction } from "./actions";

export const metadata = { title: "Consultations" };

export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const ctx = await requireCtx("clinical.read");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone;
  const today = localDay(tz);
  const { start, end } = dayRange(today, tz);
  const mine = ctx.user.isPractitioner && sp.all !== "1";
  const { rows, tickets } = await tx(ctx, async (t) => ({
    rows: await t.select({ v: visits, p: patients, doctor: users.name }).from(visits)
      .innerJoin(patients, eq(patients.id, visits.patientId)).leftJoin(users, eq(users.id, visits.practitionerId))
      .where(and(eq(visits.branchId, ctx.branchId), gte(visits.startedAt, start), lt(visits.startedAt, end), mine ? eq(visits.practitionerId, ctx.user.id) : undefined))
      .orderBy(desc(visits.startedAt)),
    tickets: await t.select({ q: queueTickets, p: patients }).from(queueTickets).innerJoin(patients, eq(patients.id, queueTickets.patientId))
      .where(and(eq(queueTickets.branchId, ctx.branchId), eq(queueTickets.day, today), inArray(queueTickets.status, ["waiting", "with_doctor"]),
        mine ? or(eq(queueTickets.practitionerId, ctx.user.id), isNull(queueTickets.practitionerId)) : undefined))
      .orderBy(desc(queueTickets.priority), asc(queueTickets.ticketNo)),
  }));
  const write = can(ctx.user.role, "clinical.write") && ctx.access === "full";
  const openCount = rows.filter((r) => r.v.status === "open").length;

  return (
    <>
      <PageHeader eyebrow="Care · Today" icon={<Stethoscope />} title="Consultations"
        subtitle={`${tickets.length} waiting · ${rows.length} consultation${rows.length === 1 ? "" : "s"} today`} />

      {ctx.user.isPractitioner && (
        <Tabs current={mine ? "mine" : "all"} tabs={[
          { key: "mine", href: "/visits", label: "My patients" },
          { key: "all", href: "/visits?all=1", label: "All practitioners" },
        ]} />
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Waiting" value={tickets.length} icon={<Hourglass />} tone="yellow" sub={mine ? "for you or anyone" : "in the queue"} />
        <Kpi label="In progress" value={openCount} icon={<Clock />} tone="blue" sub="notes not signed yet" />
        <Kpi label="Signed" value={rows.length - openCount} icon={<CheckCircle2 />} tone="green" sub="finished today" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Waiting lane */}
        <section className="glass flex flex-col overflow-hidden animate-rise lg:sticky lg:top-24 lg:self-start">
          <header className="flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-fg">{mine ? "Waiting for me" : "Waiting"}</span>
              <span className="rounded-md bg-warn/12 px-1.5 text-xs font-medium tabular-nums text-warn">{tickets.length}</span>
            </div>
            {tickets.length > 0 && <Badge tone="yellow" pulse>live</Badge>}
          </header>
          <ul className="space-y-2 p-3">
            {tickets.map(({ q, p }) => (
              <li key={q.id} className={q.priority > 0 ? "rounded-2xl border border-bad/30 bg-bad/8 p-3" : "rounded-2xl border border-line bg-surface-2 p-3 transition hover:border-line-strong"}>
                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-center font-mono text-xl font-semibold tabular-nums text-fg">#{q.ticketNo}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-fg">{fullName(p)}</span>
                      {q.priority > 0 && <Badge tone="red" pulse>urgent</Badge>}
                    </div>
                    <div className="truncate text-xs capitalize text-muted">{[age(p.dob), q.status.replace("_", " "), q.note].filter(Boolean).join(" · ")}</div>
                  </div>
                  {q.visitId ? <LinkButton variant="secondary" size="sm" href={`/visits/${q.visitId}`}>Open</LinkButton>
                    : write && <ActionButton action={startVisitAction} fields={{ ticketId: q.id }} variant="primary">Start</ActionButton>}
                </div>
              </li>
            ))}
          </ul>
          {tickets.length === 0 && <div className="px-3 pb-3"><EmptyState compact icon={<Users />} title="Nobody waiting">New arrivals from the queue show up here.</EmptyState></div>}
        </section>

        {/* Today's consultations */}
        <section className="glass overflow-hidden animate-rise">
          <header className="flex items-center justify-between px-5 pt-5">
            <span className="text-[15px] font-semibold text-fg">Today&apos;s consultations</span>
            <span className="text-xs text-subtle tabular-nums">{rows.length}</span>
          </header>
          {rows.length === 0 ? (
            <div className="p-5"><EmptyState icon={<Stethoscope />} title="No consultations yet today">Start one from the waiting list or from a patient&apos;s record.</EmptyState></div>
          ) : (
            <ul className="divide-y divide-line p-2">
              {rows.map(({ v, p, doctor }) => (
                <li key={v.id}>
                  <Link href={`/visits/${v.id}`} className="group flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-surface-2">
                    <span className="w-14 shrink-0 text-sm font-medium tabular-nums text-muted">{timeOnly(v.startedAt, tz)}</span>
                    <Avatar name={fullName(p)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg group-hover:text-accent">{fullName(p)}</span>
                        <span className="hidden font-mono text-xs text-muted sm:inline">{p.patientNo}</span>
                      </div>
                      <div className="truncate text-xs text-muted">{[v.complaint, !mine && doctor].filter(Boolean).join(" · ") || "No complaint recorded"}</div>
                    </div>
                    <Badge tone={v.status === "signed" ? "green" : "yellow"}>{v.status}</Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
