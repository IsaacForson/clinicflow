import { and, asc, desc, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { carePlans, patients, patientScheduleItems, vitals } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, fullName, localDay } from "@/lib/format";
import { can } from "@/lib/permissions";
import { readingVsTarget } from "./lib";

export const metadata = { title: "Chronic care · ClinicFlow" };

export default async function CarePage() {
  const ctx = await requireCtx("clinical.read");
  const tz = ctx.tenant.timezone;
  const today = localDay(tz);
  const data = await tx(ctx, async (t) => {
    const plans = await t.select({ plan: carePlans, p: patients }).from(carePlans).innerJoin(patients, eq(patients.id, carePlans.patientId))
      .where(eq(carePlans.active, true)).orderBy(sql`${carePlans.nextDueAt} asc nulls last`).limit(500);
    const ids = [...new Set(plans.map((x) => x.p.id))];
    const last = ids.length
      ? await t.selectDistinctOn([vitals.patientId], { patientId: vitals.patientId, bpSys: vitals.bpSys, bpDia: vitals.bpDia, glucose: vitals.glucose, recordedAt: vitals.recordedAt, source: vitals.source })
        .from(vitals).where(and(inArray(vitals.patientId, ids), or(isNotNull(vitals.bpSys), isNotNull(vitals.glucose))))
        .orderBy(vitals.patientId, desc(vitals.recordedAt))
      : [];
    const due = await t.select({ s: patientScheduleItems, p: patients }).from(patientScheduleItems).innerJoin(patients, eq(patients.id, patientScheduleItems.patientId))
      .where(and(eq(patientScheduleItems.status, "due"), lte(patientScheduleItems.dueDate, addDays(today, 7)))).orderBy(asc(patientScheduleItems.dueDate)).limit(200);
    return { plans, last: new Map(last.map((l) => [l.patientId, l])), due };
  });

  return (
    <>
      <PageHeader title="Chronic care" subtitle="Patients on long-term care plans, immunization and antenatal schedules."
        actions={can(ctx.user.role, "clinical.write") && <LinkButton href="/care/new">Enroll patient</LinkButton>} />
      <div className="space-y-4">
        <Card title={`Enrolled patients (${data.plans.length})`}>
          <Table head={["Patient", "Condition", "Next check", "Last reading", "Targets"]} empty="No patients enrolled yet.">
            {data.plans.map(({ plan, p }) => {
              const r = data.last.get(p.id);
              const overdue = plan.nextDueAt != null && plan.nextDueAt < today;
              const vs = readingVsTarget(r, plan.targets);
              return (
                <tr key={plan.id} className="hover:bg-slate-50">
                  <Td><Link href={`/care/${p.id}`} className="font-medium text-teal-800 hover:underline">{fullName(p)}</Link> <span className="text-xs text-slate-500">{p.patientNo}</span></Td>
                  <Td className="capitalize">{plan.condition}</Td>
                  <Td>{plan.nextDueAt ? <span className={overdue ? "font-medium text-red-700" : ""}>{dateOnly(`${plan.nextDueAt}T12:00:00Z`, tz)}{overdue && " · overdue"}</span> : "—"}</Td>
                  <Td>{r ? <>
                    {r.bpSys != null && `BP ${r.bpSys}/${r.bpDia} `}{r.glucose != null && `Sugar ${r.glucose} `}
                    <span className="text-xs text-slate-500">{dateOnly(r.recordedAt, tz)}{r.source === "patient" ? " · home" : ""}</span>{" "}
                    {vs && <Badge tone={vs === "above" ? "yellow" : "green"}>{vs === "above" ? "above target" : "in target"}</Badge>}
                  </> : <span className="text-slate-400">none</span>}</Td>
                  <Td className="text-xs text-slate-500">{[plan.targets.bpSys && `BP <${plan.targets.bpSys}/${plan.targets.bpDia ?? "–"}`, plan.targets.glucose && `sugar <${plan.targets.glucose}`].filter(Boolean).join(", ") || "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>

        <Card title="Immunizations & antenatal due (next 7 days and overdue)">
          <Table head={["Due", "Patient", "Item", "Type"]} empty="Nothing due.">
            {data.due.map(({ s, p }) => (
              <tr key={s.id}>
                <Td className={s.dueDate < today ? "font-medium text-red-700" : ""}>{dateOnly(`${s.dueDate}T12:00:00Z`, tz)}{s.dueDate < today && " · overdue"}</Td>
                <Td><Link href={`/care/${p.id}`} className="text-teal-800 hover:underline">{fullName(p)}</Link></Td>
                <Td>{s.name}</Td><Td className="capitalize">{s.kind}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
