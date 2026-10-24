import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import Link from "next/link";
import { ActionButton } from "@/components/form";
import { Badge, Card, LinkButton, PageHeader, Table, Td } from "@/components/ui";
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

  return (
    <>
      <PageHeader title="Consultations" subtitle={`Today · ${rows.length} consultation${rows.length === 1 ? "" : "s"}`}
        actions={ctx.user.isPractitioner && (mine
          ? <LinkButton variant="secondary" href="/visits?all=1">Show all practitioners</LinkButton>
          : <LinkButton variant="secondary" href="/visits">My patients only</LinkButton>)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={mine ? "Waiting for me" : "Waiting"} className="lg:order-2">
          <ul className="divide-y divide-slate-100">
            {tickets.map(({ q, p }) => (
              <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">#{q.ticketNo}</span>
                    <span className="truncate font-medium">{fullName(p)}</span>
                    {q.priority > 0 && <Badge tone="red">urgent</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">{[age(p.dob), q.status.replace("_", " "), q.note].filter(Boolean).join(" · ")}</div>
                </div>
                {q.visitId ? <LinkButton variant="secondary" href={`/visits/${q.visitId}`} className="px-3 py-2">Open</LinkButton>
                  : write && <ActionButton action={startVisitAction} fields={{ ticketId: q.id }} variant="primary" className="px-4 py-2 text-sm">Start</ActionButton>}
              </li>
            ))}
            {tickets.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Nobody waiting.</li>}
          </ul>
        </Card>
        <Card title="Today's consultations" className="lg:col-span-2 lg:order-1">
          <Table head={["Started", "Patient", "Practitioner", "Complaint", "Status"]} empty="No consultations yet today.">
            {rows.map(({ v, p, doctor }) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <Td>{timeOnly(v.startedAt, tz)}</Td>
                <Td><Link href={`/visits/${v.id}`} className="font-medium text-teal-800 hover:underline">{fullName(p)}</Link> <span className="text-xs text-slate-500">{p.patientNo}</span></Td>
                <Td>{doctor}</Td>
                <Td className="max-w-xs truncate">{v.complaint}</Td>
                <Td><Badge tone={v.status === "signed" ? "green" : "yellow"}>{v.status}</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
