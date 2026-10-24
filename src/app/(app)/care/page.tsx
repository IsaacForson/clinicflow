import { and, asc, desc, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Activity, AlertTriangle, CalendarClock, Droplet, HeartPulse, Home, Syringe, UserPlus } from "lucide-react";
import { Avatar, Badge, cx, EmptyState, Kpi, LinkButton, PageHeader, Panel } from "@/components/ui";
import { carePlans, patients, patientScheduleItems, vitals } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, fullName, localDay } from "@/lib/format";
import { can } from "@/lib/permissions";
import { readingVsTarget } from "./lib";

export const metadata = { title: "Chronic care" };

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

  const overdueCount = data.plans.filter(({ plan }) => plan.nextDueAt != null && plan.nextDueAt < today).length;
  const aboveCount = data.plans.filter(({ plan, p }) => readingVsTarget(data.last.get(p.id), plan.targets) === "above").length;
  const day = (d: string) => dateOnly(`${d}T12:00:00Z`, tz);
  return (
    <>
      <PageHeader icon={<HeartPulse />} eyebrow="Long-term care" title="Chronic care" subtitle="Patients on long-term care plans, immunization and antenatal schedules."
        actions={can(ctx.user.role, "clinical.write") && <LinkButton href="/care/new"><UserPlus className="h-4 w-4" />Enroll patient</LinkButton>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Enrolled" icon={<HeartPulse />} value={data.plans.length} sub="Active care plans" />
        <Kpi label="Overdue check-ups" icon={<CalendarClock />} tone={overdueCount ? "red" : "green"} value={overdueCount} sub="Past their next check" />
        <Kpi label="Above target" icon={<AlertTriangle />} tone={aboveCount ? "yellow" : "green"} value={aboveCount} sub="Latest reading vs clinic target" />
        <Kpi label="Schedule items due" icon={<Syringe />} tone="teal" value={data.due.length} sub="Next 7 days and overdue" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel eyebrow="Command centre" title="Enrolled patients" icon={<Activity />} actions={<span className="text-xs text-muted">Overdue first</span>} bodyClassName="p-3 sm:p-4">
          {data.plans.length === 0 ? (
            <EmptyState icon={<HeartPulse />} title="No patients enrolled yet">Enroll patients with hypertension, diabetes or other long-term conditions to track their readings and check-ups.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {data.plans.map(({ plan, p }) => {
                const r = data.last.get(p.id);
                const overdue = plan.nextDueAt != null && plan.nextDueAt < today;
                const vs = readingVsTarget(r, plan.targets);
                const bpAbove = r?.bpSys != null && ((plan.targets.bpSys != null && r.bpSys > plan.targets.bpSys) || (r.bpDia != null && plan.targets.bpDia != null && r.bpDia > plan.targets.bpDia));
                const gAbove = r?.glucose != null && plan.targets.glucose != null && r.glucose > plan.targets.glucose;
                return (
                  <li key={plan.id}>
                    <Link href={`/care/${p.id}`} className={cx("flex flex-col gap-3 rounded-2xl border bg-surface p-4 transition hover:-translate-y-px hover:bg-surface-2 md:flex-row md:items-center",
                      overdue ? "border-bad/40" : "border-line hover:border-line-strong")}>
                      <div className="flex min-w-0 items-center gap-3 md:w-60">
                        <Avatar name={fullName(p)} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-fg">{fullName(p)}</div>
                          <div className="flex items-center gap-2 text-xs text-muted"><span className="font-mono">{p.patientNo}</span><span className="capitalize">· {plan.condition}</span></div>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        {r?.bpSys != null && (
                          <span className={cx("inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs", bpAbove ? "border-warn/30 bg-warn/10" : "border-line bg-surface-2")}>
                            <HeartPulse className={cx("h-3.5 w-3.5", bpAbove ? "text-warn" : "text-accent")} />
                            <span className="font-semibold tabular-nums text-fg">{r.bpSys}/{r.bpDia}</span>
                            {plan.targets.bpSys && <span className="text-subtle">/ &lt;{plan.targets.bpSys}/{plan.targets.bpDia ?? "–"}</span>}
                          </span>
                        )}
                        {r?.glucose != null && (
                          <span className={cx("inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs", gAbove ? "border-warn/30 bg-warn/10" : "border-line bg-surface-2")}>
                            <Droplet className={cx("h-3.5 w-3.5", gAbove ? "text-warn" : "text-accent-2")} />
                            <span className="font-semibold tabular-nums text-fg">{r.glucose}</span>
                            {plan.targets.glucose && <span className="text-subtle">/ &lt;{plan.targets.glucose}</span>}
                          </span>
                        )}
                        {r ? <span className="inline-flex items-center gap-1 text-xs text-subtle">{r.source === "patient" && <Home className="h-3 w-3" aria-label="home reading" />}{dateOnly(r.recordedAt, tz)}</span> : <span className="text-xs text-subtle">No readings yet</span>}
                        {vs && <Badge tone={vs === "above" ? "yellow" : "green"}>{vs === "above" ? "above target" : "in target"}</Badge>}
                      </div>
                      <div className="text-xs md:text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">Next check</div>
                        {plan.nextDueAt ? <div className={cx("font-medium tabular-nums", overdue ? "text-bad" : "text-fg")}>{day(plan.nextDueAt)}{overdue && " · overdue"}</div> : <div className="text-muted">—</div>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel eyebrow="Schedules" title="Immunizations & antenatal" icon={<Syringe />} actions={<span className="text-xs text-muted">Next 7 days</span>}>
          {data.due.length === 0 ? <EmptyState compact icon={<Syringe />} title="Nothing due">No vaccines or antenatal visits due this week.</EmptyState> : (
            <ol className="relative space-y-4 before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-line">
              {data.due.map(({ s, p }) => {
                const late = s.dueDate < today;
                return (
                  <li key={s.id} className="relative pl-7">
                    <span className={cx("absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-canvas", late ? "bg-bad" : "bg-info")} aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/care/${p.id}`} className="text-sm font-medium text-fg hover:text-accent">{fullName(p)}</Link>
                        <div className="text-xs text-muted">{s.name} · <span className="capitalize">{s.kind}</span></div>
                      </div>
                      <span className={cx("shrink-0 text-xs font-medium tabular-nums", late ? "text-bad" : "text-muted")}>{day(s.dueDate)}{late && " · overdue"}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
