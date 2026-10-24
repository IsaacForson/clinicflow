import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { REPORTS, type Report } from "./queries";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireCtx("reports.view");
  const groups = new Map<string, [string, Report][]>();
  for (const [name, r] of Object.entries(REPORTS) as [string, Report][]) groups.set(r.group, [...(groups.get(r.group) ?? []), [name, r]]);
  return (
    <>
      <PageHeader title="Reports" subtitle="Pick a report, choose a date range, and download any report as CSV." />
      <div className="grid gap-4 md:grid-cols-2">
        {[...groups].map(([group, list]) => (
          <Card key={group} title={group}>
            <ul className="divide-y divide-slate-100">
              {list.map(([name, r]) => (
                <li key={name}>
                  <Link href={`/reports/${name}`} className="block rounded px-2 py-2.5 hover:bg-slate-50">
                    <span className="font-medium text-teal-800">{r.title}</span>
                    <span className="block text-sm text-slate-500">{r.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
