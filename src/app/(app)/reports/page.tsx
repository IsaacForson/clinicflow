import { ArrowUpRight, BarChart3, ChartColumn, Download, Lock } from "lucide-react";
import Link from "next/link";
import { IconTile, PageHeader, Section } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { groupMeta } from "./icons";
import { REPORTS, type Report } from "./queries";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireCtx("reports.view");
  const groups = new Map<string, [string, Report][]>();
  for (const [name, r] of Object.entries(REPORTS) as [string, Report][]) groups.set(r.group, [...(groups.get(r.group) ?? []), [name, r]]);
  return (
    <>
      <PageHeader icon={<BarChart3 />} eyebrow="Insights" title="Reports"
        subtitle={`${Object.keys(REPORTS).length} reports across ${groups.size} areas · pick one, choose a date range, download as CSV.`} />
      <div className="space-y-10">
        {[...groups].map(([group, list]) => {
          const m = groupMeta(group);
          return (
            <Section key={group} title={<span className="inline-flex items-center gap-2">{group}<span className="rounded-md bg-surface-3 px-1.5 text-[10px] tabular-nums text-subtle">{list.length}</span></span>}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map(([name, r]) => (
                  <Link key={name} href={`/reports/${name}`} className="glass group relative flex flex-col overflow-hidden p-5 animate-rise transition hover:-translate-y-0.5 hover:border-line-strong">
                    <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-aurora opacity-0 blur-3xl transition duration-500 group-hover:opacity-20" aria-hidden />
                    <div className="flex items-start justify-between gap-3">
                      <IconTile tone={m.tone}>{m.icon}</IconTile>
                      <ArrowUpRight className="h-4 w-4 text-subtle transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-fg">{r.title}</h3>
                    <p className="mt-1 flex-1 text-sm text-muted">{r.description}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] text-subtle">
                      {r.chart && <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5"><ChartColumn className="h-3 w-3" aria-hidden />Chart</span>}
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5"><Download className="h-3 w-3" aria-hidden />CSV</span>
                      {r.patientData && <span className="inline-flex items-center gap-1 rounded-md bg-warn/12 px-1.5 py-0.5 text-warn"><Lock className="h-3 w-3" aria-hidden />Patient data · audited</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          );
        })}
      </div>
    </>
  );
}
