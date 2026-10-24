import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { getReport, type Cell, type Col } from "../queries";
import { resolveRange } from "../range";
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
    if (v === null || v === "") return <span className="text-slate-400">—</span>;
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
  return (
    <>
      <PageHeader title={report.title} subtitle={<>{report.description} <span className="whitespace-nowrap">{dateOnly(range.start, tz)} – {dateOnly(new Date(range.end.getTime() - 1), tz)}</span></>}
        actions={<>
          <Link href="/reports" className="text-sm text-slate-600 hover:text-slate-900">All reports</Link>
          <a href={`/api/reports/${name}?${rangeQuery(range)}`} download className="inline-flex items-center rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800">Download CSV</a>
        </>} />
      <RangePicker range={range} path={`/reports/${name}`} />
      {name === "notifiable" && ctx.tenant.notifiableIcd.length === 0 && (
        <p className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">No notifiable ICD-10 codes are configured yet. Add codes or prefixes (e.g. A00, A01, B50) in clinic settings.</p>
      )}
      {chartCol && rows.length > 0 && (
        <Card className="mb-4">
          <BarChart label={`${chartCol.label} by ${report.cols[0].label.toLowerCase()}`} data={rows.map((r) => ({ label: String(r[xKey]), value: Number(r[chartCol.key] ?? 0) }))}
            format={(v) => (chartCol.kind === "money" ? money(v, cur) : chartCol.kind === "pct" ? `${v}%` : String(v))} />
        </Card>
      )}
      <Card>
        <Table head={report.cols.map((c) => c.label)} empty="No data for this period.">
          {rows.map((r, i) => (
            <tr key={i} className={r.label === "All ages" ? "bg-slate-50 font-semibold" : undefined}>
              {report.cols.map((c) => <Td key={c.key} className={c.kind && c.kind !== "text" ? "text-right tabular-nums" : "max-w-xs truncate"}>{fmt(c, r[c.key] ?? null)}</Td>)}
            </tr>
          ))}
          {rows.length > 1 && totals.some((x) => x !== null) && name !== "hmis" && (
            <tr className="border-t-2 border-slate-200 font-semibold">
              {report.cols.map((c, i) => <Td key={c.key} className={i ? "text-right tabular-nums" : ""}>{i === 0 ? "Total" : totals[i] === null ? "" : fmt(c, totals[i])}</Td>)}
            </tr>
          )}
        </Table>
      </Card>
    </>
  );
}
