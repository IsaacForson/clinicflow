import { and, count, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock, FlaskConical, Plus, Send, Stethoscope } from "lucide-react";
import { ActionButton } from "@/components/form";
import { Avatar, Badge, cx, EmptyState, LinkButton, PageHeader, Panel, Tabs } from "@/components/ui";
import { labOrderItems, labOrders, patients, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName } from "@/lib/format";
import { setLabStatusAction } from "./actions";
import { LAB_TONE } from "./flag";

export const metadata = { title: "Lab & imaging" };

const STATUSES = ["ordered", "collected", "resulted", "notified", "cancelled"] as const;
const HINT = {
  ordered: "Waiting for a sample — oldest first.",
  collected: "Samples in the lab, awaiting results — oldest first.",
  resulted: "Results ready to share with the patient.",
  notified: "Patients have been told their results.",
  cancelled: "Orders that were stopped.",
} as const;

function ageOf(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60_000);
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}
/** Waiting orders turn amber after 2h and red after 24h. */
function ageTone(d: Date, pending: boolean) {
  const m = (Date.now() - d.getTime()) / 60_000;
  return !pending ? "text-muted bg-surface-3" : m > 1440 ? "text-bad bg-bad/12" : m > 120 ? "text-warn bg-warn/12" : "text-ok bg-ok/12";
}

export default async function LabPage({ searchParams }: PageProps<"/lab">) {
  const ctx = await requireCtx("lab.result");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? "ordered";
  const { rows, items, counts } = await tx(ctx, async (t) => {
    const rows = await t.select({ o: labOrders, p: patients, doctor: users.name }).from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId)).leftJoin(users, eq(users.id, labOrders.orderedBy))
      .where(and(eq(labOrders.branchId, ctx.branchId), eq(labOrders.status, status)))
      .orderBy(status === "ordered" || status === "collected" ? labOrders.createdAt : desc(labOrders.createdAt)).limit(200);
    const items = rows.length ? await t.select({ orderId: labOrderItems.orderId, name: labOrderItems.name }).from(labOrderItems).where(inArray(labOrderItems.orderId, rows.map((r) => r.o.id))) : [];
    const counts = await t.select({ status: labOrders.status, n: count() }).from(labOrders).where(eq(labOrders.branchId, ctx.branchId)).groupBy(labOrders.status);
    return { rows, items, counts };
  });
  const tz = ctx.tenant.timezone;
  const pending = status === "ordered" || status === "collected";
  const countOf = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  return (
    <>
      <PageHeader icon={<FlaskConical />} eyebrow="Diagnostics" title="Lab & imaging"
        subtitle={`${countOf("ordered")} awaiting sample · ${countOf("collected")} in progress · ${countOf("resulted")} ready to notify`}
        actions={<><LinkButton variant="secondary" href="/lab/tests"><BookOpen className="h-4 w-4" />Test catalogue</LinkButton><LinkButton href="/lab/new"><Plus className="h-4 w-4" />New lab order</LinkButton></>} />

      {/* Pipeline stepper */}
      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STATUSES.map((s, i) => (
          <li key={s}>
            <Link href={`/lab?status=${s}`} aria-current={s === status ? "page" : undefined}
              className={cx("group relative flex h-full flex-col gap-1 rounded-2xl border px-4 py-3 transition",
                s === status ? "glass ring-aurora border-transparent shadow-glow" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2")}>
              <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
                <span>{i < 4 ? `Step ${i + 1}` : "Closed"}</span>
                <Badge tone={LAB_TONE[s]}>{s}</Badge>
              </span>
              <span className={cx("text-2xl font-semibold tabular-nums tracking-tight", s === status ? "text-fg" : "text-muted group-hover:text-fg")}>{countOf(s)}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="sm:hidden"><Tabs current={status} tabs={STATUSES.map((s) => ({ key: s, href: `/lab?status=${s}`, label: s[0].toUpperCase() + s.slice(1), count: countOf(s) }))} /></div>

      <Panel eyebrow="Worklist" title={<span className="capitalize">{status}</span>} actions={<span className="text-xs text-muted">{HINT[status]}</span>} bodyClassName="p-3 sm:p-4">
        {rows.length === 0 ? (
          <EmptyState icon={<FlaskConical />} title={`No ${status} orders`}>
            {pending ? <>All caught up. Start a <Link className="text-accent hover:underline" href="/lab/new">walk-in lab order</Link> or wait for orders from consultations.</> : "Orders move here as they progress through the lab."}
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ o, p, doctor }) => {
              const tests = items.filter((i) => i.orderId === o.id).map((i) => i.name);
              return (
                <li key={o.id} className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-px hover:border-line-strong hover:bg-surface-2 md:flex-row md:items-center">
                  <div className="flex min-w-0 items-center gap-3 md:w-64">
                    <Avatar name={fullName(p)} />
                    <div className="min-w-0">
                      <Link href={`/lab/${o.id}`} className="block truncate text-sm font-semibold text-fg hover:text-accent">{fullName(p)}</Link>
                      <span className="font-mono text-xs text-muted">{p.patientNo}</span>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {tests.map((n, i) => <span key={i} className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-fg">{n}</span>)}
                    {o.externalLab && <span className="inline-flex items-center gap-1 rounded-lg border border-info/30 bg-info/10 px-2 py-1 text-xs text-info"><Send className="h-3 w-3" />{o.externalLab}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted md:justify-end">
                    <span className="inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{doctor ?? "Walk-in"}</span>
                    <span title={dateTime(o.createdAt, tz)} className={cx("inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium tabular-nums", ageTone(o.createdAt, pending))}>
                      <Clock className="h-3.5 w-3.5" />{ageOf(o.createdAt)}
                    </span>
                    {o.status === "ordered" && <ActionButton action={setLabStatusAction} fields={{ id: o.id, status: "collected" }}>Sample collected</ActionButton>}
                    <LinkButton variant="ghost" size="sm" href={`/lab/${o.id}`} aria-label={`Open order for ${fullName(p)}`}>Open<ArrowRight className="h-3.5 w-3.5" /></LinkButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
