import { and, asc, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Activity, Baby, Bell, CalendarClock, CheckCircle2, ClipboardList, HeartPulse, Plus, Syringe, User } from "lucide-react";
import { A, Avatar, Badge, cx, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select, Table, Td } from "@/components/ui";
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

  const day = (d: string) => dateOnly(`${d}T12:00:00Z`, tz);
  const latest = data.readings[0];
  const doneCount = data.items.filter((s) => s.status === "done").length;
  return (
    <>
      <PageHeader icon={<HeartPulse />} eyebrow="Patient care" title={fullName(p)} subtitle={[p.patientNo, p.sex, age(p.dob), p.phone].filter(Boolean).join(" · ")}
        actions={<>
          <LinkButton variant="secondary" href={`/patients/${p.id}`}><User className="h-4 w-4" />Patient record</LinkButton>
          {canPlan && <LinkButton href={`/care/new?patient=${p.id}`}><Plus className="h-4 w-4" />Add care plan</LinkButton>}
        </>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel eyebrow="Trends" title="Readings over time" icon={<Activity />}>
            <div className="space-y-8">
              <TrendChart title="Blood pressure" unit="mmHg" tz={tz} dates={bp.map((r) => r.recordedAt)}
                series={[{ label: "Systolic", color: "var(--accent)", values: bp.map((r) => r.bpSys) }, { label: "Diastolic", color: "var(--accent-2)", values: bp.map((r) => r.bpDia) }]}
                targets={[...(tg.bpSys ? [{ label: "sys", value: tg.bpSys }] : []), ...(tg.bpDia ? [{ label: "dia", value: tg.bpDia }] : [])]} />
              <TrendChart title="Blood glucose" unit="mmol/L" tz={tz} dates={sugar.map((r) => r.recordedAt)}
                series={[{ label: "Glucose", color: "var(--accent-2)", values: sugar.map((r) => r.glucose) }]}
                targets={tg.glucose ? [{ label: "target", value: tg.glucose }] : []} />
            </div>
          </Panel>

          <Panel eyebrow="Log" title="Readings" icon={<ClipboardList />}>
            <Table head={["When", "BP", "Glucose", "Source", ""]} empty="No readings yet. Readings come from vitals taken in clinic or sent from home.">
              {data.readings.map((r) => {
                const vs = readingVsTarget(r, tg);
                return (
                  <tr key={r.id}>
                    <Td className="text-muted">{dateTime(r.recordedAt, tz)}</Td>
                    <Td className="font-semibold tabular-nums">{r.bpSys != null ? `${r.bpSys}/${r.bpDia}` : <span className="text-subtle">—</span>}</Td>
                    <Td className="font-semibold tabular-nums">{r.glucose ?? <span className="text-subtle">—</span>}</Td>
                    <Td><Badge tone={r.source === "patient" ? "purple" : "gray"}>{r.source === "patient" ? "home" : "clinic"}</Badge></Td>
                    <Td>{active && vs === "above" && <Badge tone="yellow">above target</Badge>}</Td>
                  </tr>
                );
              })}
            </Table>
          </Panel>

          <Panel eyebrow="Schedule" title="Immunization & antenatal" icon={<Syringe />}
            actions={data.items.length > 0 && <span className="text-xs tabular-nums text-muted">{doneCount} of {data.items.length} done</span>}>
            {data.items.length === 0 ? (
              <EmptyState compact icon={<Baby />} title="No schedule started">{canSchedule ? "Start an immunization or antenatal schedule below." : "No schedule for this patient."}</EmptyState>
            ) : (
              <ol className="relative space-y-3 before:absolute before:inset-y-2 before:left-[7px] before:w-px before:bg-line">
                {data.items.map((s) => {
                  const overdue = s.status === "due" && s.dueDate < today;
                  const tone = s.status === "done" ? "green" : s.status === "missed" ? "red" : s.status === "skipped" ? "gray" : overdue ? "red" : "blue";
                  return (
                    <li key={s.id} className="relative pl-7">
                      <span className={cx("absolute left-0 top-4 grid h-[15px] w-[15px] place-items-center rounded-full border-2 border-canvas",
                        { green: "bg-ok", red: "bg-bad", gray: "bg-subtle", blue: "bg-info" }[tone])} aria-hidden />
                      <div className={cx("flex flex-col gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center", overdue ? "border-bad/40 bg-bad/5" : "border-line bg-surface", s.status === "skipped" && "opacity-60")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-fg">{s.name}</span>
                            <Badge tone={tone}>{overdue ? "overdue" : s.status}</Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-muted">
                            Due <span className={cx("tabular-nums", overdue && "font-medium text-bad")}>{day(s.dueDate)}</span>
                            {s.status === "done" && <> · given {dateOnly(s.doneAt, tz)}{s.batchNo ? ` · batch ${s.batchNo}` : ""}</>}
                          </div>
                        </div>
                        {canSchedule && (s.status === "due" || s.status === "missed") && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ActionForm action={updateScheduleItemAction} className="flex flex-wrap items-center gap-1.5 space-y-0">
                              <input type="hidden" name="id" value={s.id} /><input type="hidden" name="patientId" value={p.id} /><input type="hidden" name="status" value="done" />
                              <Input type="date" name="doneDate" defaultValue={today} max={today} className="h-8 w-36 text-xs" aria-label="Date given" />
                              <Input name="batchNo" placeholder="Batch no." className="h-8 w-24 text-xs" aria-label="Batch number" />
                              <Submit variant="secondary" size="sm"><CheckCircle2 className="h-3.5 w-3.5" />Done</Submit>
                            </ActionForm>
                            <ActionButton action={updateScheduleItemAction} fields={{ id: s.id, patientId: p.id, status: "skipped" }} variant="ghost">Skip</ActionButton>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {canSchedule && (
              <ActionForm action={startScheduleAction} className="mt-5 grid gap-3 space-y-0 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="patientId" value={p.id} />
                <Field label="Start schedule"><Select name="templateId" required>{data.templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="From (DOB for immunization, LMP for antenatal)"><Input type="date" name="startDate" defaultValue={p.dob ?? today} required /></Field>
                <Submit variant="secondary">Start</Submit>
              </ActionForm>
            )}
            {data.templates.length === 0 && <p className="mt-2 text-xs text-subtle">No schedule templates. Run scripts/seed-schedules.mts.</p>}
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel glow={!!active} bodyClassName="p-5">
            <div className="flex items-center gap-4">
              <Avatar name={fullName(p)} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-fg">{fullName(p)}</div>
                <div className="font-mono text-xs text-muted">{p.patientNo}</div>
                {active && <div className="mt-1"><Badge tone="purple">{active.condition}</Badge></div>}
              </div>
            </div>
            {latest && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Latest BP</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{latest.bpSys != null ? `${latest.bpSys}/${latest.bpDia}` : "—"}</div>
                  {tg.bpSys && <div className="text-[11px] text-muted">target &lt;{tg.bpSys}/{tg.bpDia ?? "–"}</div>}
                </div>
                <div className="rounded-xl border border-line bg-surface-2 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Glucose</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{latest.glucose ?? "—"}</div>
                  {tg.glucose && <div className="text-[11px] text-muted">target &lt;{tg.glucose}</div>}
                </div>
              </div>
            )}
          </Panel>
          <Panel eyebrow="Plans" title="Care plans" icon={<HeartPulse />}>
            {data.plans.length === 0 && <EmptyState compact icon={<HeartPulse />} title="Not enrolled"><A href={`/care/new?patient=${p.id}`}>Enroll</A> to track check-ups and targets.</EmptyState>}
            <ul className="space-y-3 text-sm">
              {data.plans.map((pl) => (
                <li key={pl.id} className={cx("rounded-2xl border p-4", pl.active ? "border-line-strong bg-surface-2" : "border-line opacity-70")}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize text-fg">{pl.condition}</span>
                    <Badge tone={pl.active ? "green" : "gray"}>{pl.active ? "active" : "inactive"}</Badge>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <div className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Every {pl.intervalDays} days{pl.nextDueAt && ` · next ${day(pl.nextDueAt)}`}</div>
                    <div className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />Targets: {[pl.targets.bpSys && `BP <${pl.targets.bpSys}/${pl.targets.bpDia ?? "–"}`, pl.targets.glucose && `glucose <${pl.targets.glucose}`].filter(Boolean).join(", ") || "none"}</div>
                    <div className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" />Medication reminder: {pl.adherenceNudges && pl.nudgeTime ? `daily at ${pl.nudgeTime}` : "off"}</div>
                  </div>
                  {canPlan && pl.active && <div className="mt-3"><ActionButton action={deactivatePlanAction} fields={{ id: pl.id, patientId: p.id }} variant="ghost" confirm="Deactivate this care plan? Reminders will stop.">Deactivate</ActionButton></div>}
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
