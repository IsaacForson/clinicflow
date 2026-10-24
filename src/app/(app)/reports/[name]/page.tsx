import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarX, ChartColumn, Download, Hash, Lock, Rows3, Table2, TriangleAlert, Wallet } from "lucide-react";
import { Callout, EmptyState, Kpi, LinkButton, PageHeader, Panel, Table, Td } from "@/components/ui";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { getReport, type Cell, type Col } from "../queries";
import { resolveRange } from "../range";
import { groupMeta } from "../icons";
import { BarChart, RangePicker, rangeQuery } from "../ui";


export async function generateMetadata({ params }: PageProps<"/reports/[name]">) {
  return { title: getReport((await params).name)?.title ?? "Report" };
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[name]">) {
  const { name } = await params;
  const report = getReport(name);
  if (!report) notFound();
  const ctx = await requireCtx("reports.view");
  const range = resolveRange(await searchParams, ctx.tenant.timezone, new Date(), report.defaultPreset);
  const rows = await tx(ctx, async (t) => {
    const out = await report.run(t, ctx, range);
    if (report.patientData) await audit(t, ctx, "view", "report", name, { details: { from: range.from, to: range.to, rows: out.length } });
    return out;
  });
  const cur = ctx.tenant.currency;
  const fmt = (c: Col, v: Cell) => {
    if (v === null || v === "") return <span className="text-subtle">—</span>;
    if (c.kind === "money") return money(Number(v), cur);
    if (c.kind === "pct") return `${v}%`;
    if (c.kind === "minutes") return `${v} min`;
    if (c.kind === "int") return Number(v).toLocaleString("en");
    return String(v);
  };
  const chartCol = report.chart ? report.cols.find((c) => c.key === report.chart) : undefined;
  const xKey = report.cols[0].key;
  const totals = report.cols.map((c, i) => i > 0 && (c.kind === "money" || c.kind === "int") && !report.patientData
    ? rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0) : null);
  const tz = ctx.tenant.timezone;
  const m = groupMeta(report.group);
  const kpis = report.cols.map((c, i) => ({ c, total: totals[i] })).filter((k) => k.total !== null && rows.length > 0 && name !== "hmis").slice(0, 4);
  return (
    <>
      <PageHeader icon={m.icon} eyebrow={<Link href="/reports" className="hover:underline underline-offset-4">Reports · {report.group}</Link>} title={report.title}
        subtitle={<>{report.description} <span className="whitespace-nowrap font-medium text-fg">{dateOnly(range.start, tz)} – {dateOnly(new Date(range.end.getTime() - 1), tz)}</span></>}
        actions={<>
          <LinkButton href="/reports" variant="ghost"><ArrowLeft className="h-4 w-4" aria-hidden />All reports</LinkButton>
          <a href={`/api/reports/${name}?${rangeQuery(range)}`} download className="inline-flex h-10 items-center gap-2 rounded-xl bg-aurora px-4 text-sm font-medium text-on-accent shadow-glow transition hover:-translate-y-px hover:brightness-110">
            <Download className="h-4 w-4" aria-hidden />Download CSV
          </a>
        </>} />
      <RangePicker range={range} path={`/reports/${name}`} />
      {report.patientData && <div className="mb-4"><Callout tone="yellow" icon={<Lock />}>Contains identifiable patient data. Viewing and downloading this report is recorded in the audit log.</Callout></div>}
      {name === "notifiable" && ctx.tenant.notifiableIcd.length === 0 && (
        <div className="mb-4"><Callout tone="yellow" icon={<TriangleAlert />} actions={<LinkButton href="/settings/reminders" size="sm" variant="secondary">Add codes</LinkButton>}>
          No notifiable ICD-10 codes are configured yet. Add codes or prefixes (e.g. A00, A01, B50) in clinic settings.
        </Callout></div>
      )}

      {kpis.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Rows" value={rows.length.toLocaleString("en")} icon={<Rows3 />} tone="gray" sub="in this period" />
          {kpis.slice(0, 3).map(({ c, total }) => (
            <Kpi key={c.key} label={`Total ${c.label.toLowerCase()}`} value={fmt(c, total)} icon={c.kind === "money" ? <Wallet /> : <Hash />} tone={c.kind === "money" ? "green" : "purple"}
              trend={rows.length > 2 && rows.length <= 400 ? rows.map((r) => Number(r[c.key] ?? 0)) : undefined} />
          ))}
        </div>
      )}

      {chartCol && rows.length > 0 && (
        <Panel className="mb-6" icon={<ChartColumn />} eyebrow="Trend" title={`${chartCol.label} by ${report.cols[0].label.toLowerCase()}`}>
          <BarChart label={`${chartCol.label} by ${report.cols[0].label.toLowerCase()}`} data={rows.map((r) => ({ label: String(r[xKey]), value: Number(r[chartCol.key] ?? 0) }))}
            format={(v) => (chartCol.kind === "money" ? money(v, cur) : chartCol.kind === "pct" ? `${v}%` : String(v))} />
        </Panel>
      )}

      <Panel icon={<Table2 />} eyebrow={`${rows.length.toLocaleString("en")} row${rows.length === 1 ? "" : "s"}`} title="Data">
        {rows.length === 0 ? (
          <EmptyState compact icon={<CalendarX />} title="No data for this period">Try a wider range such as “Last 30 days” or “This year”.</EmptyState>
        ) : (
          <Table head={report.cols.map((c) => c.label)}>
            {rows.map((r, i) => (
              <tr key={i} className={r.label === "All ages" ? "bg-surface-2 font-semibold" : undefined}>
                {report.cols.map((c) => <Td key={c.key} className={c.kind && c.kind !== "text" ? "text-right tabular-nums" : "max-w-xs truncate"}>{fmt(c, r[c.key] ?? null)}</Td>)}
              </tr>
            ))}
            {rows.length > 1 && totals.some((x) => x !== null) && name !== "hmis" && (
              <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                {report.cols.map((c, i) => <Td key={c.key} className={i ? "text-right tabular-nums" : ""}>{i === 0 ? "Total" : totals[i] === null ? "" : fmt(c, totals[i])}</Td>)}
              </tr>
            )}
          </Table>
        )}
      </Panel>
    </>
  );
}
