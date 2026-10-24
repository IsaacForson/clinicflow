import { and, asc, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { carePlans, patients, patientScheduleItems, scheduleTemplates, vitals } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateOnly, dateTime, fullName, localDay } from "@/lib/format";
import { can } from "@/lib/permissions";
import { deactivatePlanAction, startScheduleAction, updateScheduleItemAction } from "../actions";
import { readingVsTarget } from "../lib";
import { TrendChart } from "../trend-chart";

export default async function PatientCarePage({ params }: PageProps<"/care/[patientId]">) {
  const { patientId } = await params;
  const ctx = await requireCtx("clinical.read");
  const tz = ctx.tenant.timezone;
  const today = localDay(tz);
  const data = await tx(ctx, async (t) => {
    const [p] = await t.select().from(patients).where(eq(patients.id, patientId));
    if (!p) return null;
    await audit(t, ctx, "view", "care", patientId, { patientId });
    return {
      p,
      plans: await t.select().from(carePlans).where(eq(carePlans.patientId, patientId)).orderBy(desc(carePlans.active), desc(carePlans.createdAt)),
      readings: await t.select().from(vitals).where(and(eq(vitals.patientId, patientId), or(isNotNull(vitals.bpSys), isNotNull(vitals.glucose)))).orderBy(desc(vitals.recordedAt)).limit(60),
      items: await t.select().from(patientScheduleItems).where(eq(patientScheduleItems.patientId, patientId)).orderBy(asc(patientScheduleItems.dueDate)),
      templates: await t.select().from(scheduleTemplates).where(or(isNull(scheduleTemplates.tenantId), eq(scheduleTemplates.tenantId, ctx.tenant.id))).orderBy(scheduleTemplates.name),
    };
  });
  if (!data) notFound();
  const { p } = data;
  const active = data.plans.find((x) => x.active);
  const tg = active?.targets ?? {};
  const chrono = [...data.readings].reverse();
  const bp = chrono.filter((r) => r.bpSys != null);
  const sugar = chrono.filter((r) => r.glucose != null);
  const canPlan = can(ctx.user.role, "clinical.write") && ctx.access === "full";
  const canSchedule = can(ctx.user.role, "vitals.write") && ctx.access === "full";

  return (
    <>
      <PageHeader title={`${fullName(p)} · care`} subtitle={[p.patientNo, p.sex, age(p.dob), p.phone].filter(Boolean).join(" · ")}
        actions={<>
          <LinkButton variant="secondary" href={`/patients/${p.id}`}>Patient record</LinkButton>
          {canPlan && <LinkButton href={`/care/new?patient=${p.id}`}>Add care plan</LinkButton>}
        </>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Trends">
            <div className="space-y-5">
              <TrendChart title="Blood pressure" unit="mmHg" tz={tz} dates={bp.map((r) => r.recordedAt)}
                series={[{ label: "Systolic", color: "#5d47ea", values: bp.map((r) => r.bpSys) }, { label: "Diastolic", color: "#22d3ee", values: bp.map((r) => r.bpDia) }]}
                targets={[...(tg.bpSys ? [{ label: "sys", value: tg.bpSys }] : []), ...(tg.bpDia ? [{ label: "dia", value: tg.bpDia }] : [])]} />
              <TrendChart title="Blood glucose" unit="mmol/L" tz={tz} dates={sugar.map((r) => r.recordedAt)}
                series={[{ label: "Glucose", color: "#7c3aed", values: sugar.map((r) => r.glucose) }]}
                targets={tg.glucose ? [{ label: "target", value: tg.glucose }] : []} />
            </div>
          </Card>

          <Card title="Readings">
            <Table head={["When", "BP", "Glucose", "Source", ""]} empty="No readings yet.">
              {data.readings.map((r) => {
                const vs = readingVsTarget(r, tg);
                return (
                  <tr key={r.id}>
                    <Td>{dateTime(r.recordedAt, tz)}</Td><Td>{r.bpSys != null ? `${r.bpSys}/${r.bpDia}` : "—"}</Td><Td>{r.glucose ?? "—"}</Td>
                    <Td><Badge tone={r.source === "patient" ? "purple" : "gray"}>{r.source === "patient" ? "home" : "clinic"}</Badge></Td>
                    <Td>{active && vs === "above" && <Badge tone="yellow">above target</Badge>}</Td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card title="Immunization & antenatal schedule">
            <Table head={["Due", "Item", "Status", ""]} empty="No schedule started.">
              {data.items.map((s) => {
                const overdue = s.status === "due" && s.dueDate < today;
                return (
                  <tr key={s.id}>
                    <Td className={overdue ? "font-medium text-red-700" : ""}>{dateOnly(`${s.dueDate}T12:00:00Z`, tz)}</Td>
                    <Td className="whitespace-normal">{s.name}</Td>
                    <Td><Badge tone={s.status === "done" ? "green" : s.status === "missed" ? "red" : s.status === "skipped" ? "gray" : overdue ? "red" : "blue"}>{overdue ? "overdue" : s.status}</Badge>
                      {s.status === "done" && <span className="ml-1 text-xs text-slate-500">{dateOnly(s.doneAt, tz)}{s.batchNo ? ` · batch ${s.batchNo}` : ""}</span>}</Td>
                    <Td>{canSchedule && (s.status === "due" || s.status === "missed") && (
                      <div className="flex items-center gap-1">
                        <ActionForm action={updateScheduleItemAction} className="flex items-center gap-1 space-y-0">
                          <input type="hidden" name="id" value={s.id} /><input type="hidden" name="patientId" value={p.id} /><input type="hidden" name="status" value="done" />
                          <Input type="date" name="doneDate" defaultValue={today} max={today} className="w-36 py-1" aria-label="Date given" />
                          <Input name="batchNo" placeholder="Batch no." className="w-24 py-1" aria-label="Batch number" />
                          <Submit variant="secondary" className="px-2 py-1 text-xs">Done</Submit>
                        </ActionForm>
                        <ActionButton action={updateScheduleItemAction} fields={{ id: s.id, patientId: p.id, status: "skipped" }} variant="ghost">Skip</ActionButton>
                      </div>
                    )}</Td>
                  </tr>
                );
              })}
            </Table>
            {canSchedule && (
              <ActionForm action={startScheduleAction} className="mt-4 flex flex-wrap items-end gap-2 space-y-0 border-t border-slate-100 pt-3">
                <input type="hidden" name="patientId" value={p.id} />
                <Field label="Start schedule"><Select name="templateId" required>{data.templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="From (DOB for immunization, LMP for antenatal)"><Input type="date" name="startDate" defaultValue={p.dob ?? today} required /></Field>
                <Submit variant="secondary">Start</Submit>
              </ActionForm>
            )}
            {data.templates.length === 0 && <p className="mt-2 text-xs text-slate-500">No schedule templates. Run scripts/seed-schedules.mts.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Care plans">
            {data.plans.length === 0 && <p className="text-sm text-slate-500">Not enrolled. <Link className="text-brand-800 underline" href={`/care/new?patient=${p.id}`}>Enroll</Link></p>}
            <ul className="space-y-3 text-sm">
              {data.plans.map((pl) => (
                <li key={pl.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{pl.condition}</span>
                    <Badge tone={pl.active ? "green" : "gray"}>{pl.active ? "active" : "inactive"}</Badge>
                  </div>
                  <div className="mt-1 text-slate-600">Every {pl.intervalDays} days{pl.nextDueAt && ` · next ${dateOnly(`${pl.nextDueAt}T12:00:00Z`, tz)}`}</div>
                  <div className="text-slate-600">Targets: {[pl.targets.bpSys && `BP <${pl.targets.bpSys}/${pl.targets.bpDia ?? "–"}`, pl.targets.glucose && `glucose <${pl.targets.glucose}`].filter(Boolean).join(", ") || "none"}</div>
                  <div className="text-slate-600">Medication reminder: {pl.adherenceNudges && pl.nudgeTime ? `daily at ${pl.nudgeTime}` : "off"}</div>
                  {canPlan && pl.active && <div className="mt-2"><ActionButton action={deactivatePlanAction} fields={{ id: pl.id, patientId: p.id }} variant="ghost" confirm="Deactivate this care plan? Reminders will stop.">Deactivate</ActionButton></div>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
