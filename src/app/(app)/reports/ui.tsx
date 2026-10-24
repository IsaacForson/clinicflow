import Link from "next/link";
import { cx, Input } from "@/components/ui";
import { PRESETS, type Range } from "./range";

/** Single-series bar chart as inline SVG (no chart library). Hover a bar for its value; pair with a table for exact numbers. */
export function BarChart({ data, format, label, height = 160 }: {
  data: { label: string; value: number }[]; format: (v: number) => string; label: string; height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const w = 100 / Math.max(data.length, 1);
  const tickEvery = Math.ceil(data.length / 8);
  const short = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label}. Highest ${format(max)}.`} className="h-40 w-full overflow-visible">
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} className="stroke-slate-200" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const h = max ? (d.value / max) * (height - 4) : 0;
          return (
            <g key={d.label} className="group">
              {/* Full-height hit target so tiny bars are still hoverable. */}
              <rect x={i * w} y={0} width={w} height={height} className="fill-transparent group-hover:fill-slate-100" />
              <rect x={i * w + w * 0.15} y={height - Math.max(h, d.value ? 1 : 0)} width={w * 0.7} height={Math.max(h, d.value ? 1 : 0)} rx="0.6" className="fill-brand-600 group-hover:fill-brand-800" />
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-slate-500" aria-hidden>
        {data.map((d, i) => <span key={d.label} className="truncate text-center" style={{ width: `${w}%` }}>{i % tickEvery === 0 ? short(d.label) : ""}</span>)}
      </div>
    </figure>
  );
}

/** Preset chips + custom from/to form; works without JavaScript. */
export function RangePicker({ range, path }: { range: Range; path: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
      <nav aria-label="Date range presets" className="flex flex-wrap gap-1">
        {Object.entries(PRESETS).map(([k, label]) => (
          <Link key={k} href={`${path}?preset=${k}`} aria-current={range.preset === k ? "true" : undefined}
            className={cx("rounded-full px-3 py-1.5 text-sm ring-1", range.preset === k ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
            {label}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" action={path}>
        <label className="text-xs text-slate-600">From<Input type="date" name="from" defaultValue={range.from} className="mt-0.5 py-1.5" /></label>
        <label className="text-xs text-slate-600">To<Input type="date" name="to" defaultValue={range.to} className="mt-0.5 py-1.5" /></label>
        <button className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Apply</button>
      </form>
    </div>
  );
}

export const rangeQuery = (r: Range) => (r.preset === "custom" ? `from=${r.from}&to=${r.to}` : `preset=${r.preset}`);
