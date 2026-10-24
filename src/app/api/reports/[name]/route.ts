import { getReport } from "@/app/(app)/reports/queries";
import { resolveRange, toCsv } from "@/app/(app)/reports/range";
import { audit, getCtx, tx } from "@/lib/auth";
import { toMajor } from "@/lib/format";
import { can } from "@/lib/permissions";

/** CSV export of any report. Read-only accounts can still export (data is never locked). */
export async function GET(req: Request, { params }: RouteContext<"/api/reports/[name]">) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!can(ctx.user.role, "reports.view")) return new Response("Forbidden", { status: 403 });
  const { name } = await params;
  const report = getReport(name);
  if (!report) return new Response("Not found", { status: 404 });
  const range = resolveRange(Object.fromEntries(new URL(req.url).searchParams), ctx.tenant.timezone, new Date(), report.defaultPreset);
  const rows = await tx(ctx, async (t) => {
    const out = await report.run(t, ctx, range);
    await audit(t, ctx, "export", "report", name, { details: { from: range.from, to: range.to, rows: out.length } });
    return out;
  });
  const csv = toCsv(
    report.cols.map((c) => (c.kind === "money" ? `${c.label} (${ctx.tenant.currency})` : c.kind === "minutes" ? `${c.label} (min)` : c.kind === "pct" ? `${c.label} (%)` : c.label)),
    rows.map((r) => report.cols.map((c) => (c.kind === "money" && r[c.key] !== null && r[c.key] !== undefined ? toMajor(Number(r[c.key])) : r[c.key]))),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.tenant.slug}-${name}-${range.from}_${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
