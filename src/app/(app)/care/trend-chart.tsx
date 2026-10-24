type Series = { label: string; color: string; values: (number | null)[] };

/** Minimal inline SVG line chart (no chart library). Points share one time axis; nulls break nothing, they're skipped. */
export function TrendChart({ title, dates, series, targets = [], unit, tz }: {
  title: string; dates: Date[]; series: Series[]; targets?: { label: string; value: number }[]; unit: string; tz: string;
}) {
  const W = 600, H = 170, L = 36, R = 8, T = 10, B = 22;
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v != null)), ...targets.map((t) => t.value)];
  if (dates.length < 2 || all.length === 0) return <p className="text-sm text-slate-500">{title}: not enough readings for a trend yet.</p>;
  const min = Math.floor(Math.min(...all) * 0.95), max = Math.ceil(Math.max(...all) * 1.05);
  const t0 = dates[0].getTime(), t1 = dates[dates.length - 1].getTime() || t0 + 1;
  const x = (d: Date) => L + ((d.getTime() - t0) / Math.max(t1 - t0, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / Math.max(max - min, 1)) * (H - T - B);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  return (
    <figure>
      <figcaption className="mb-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span className="font-medium text-slate-800">{title} ({unit})</span>
        {series.map((s) => <span key={s.label} className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: s.color }} />{s.label}</span>)}
        {targets.length > 0 && <span className="flex items-center gap-1"><span className="inline-block w-4 border-t border-dashed border-red-500" />target</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title} trend`}>
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#cbd5e1" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke="#cbd5e1" />
        <text x={L - 4} y={T + 4} textAnchor="end" fontSize="10" fill="#64748b">{max}</text>
        <text x={L - 4} y={H - B} textAnchor="end" fontSize="10" fill="#64748b">{min}</text>
        <text x={L} y={H - 6} fontSize="10" fill="#64748b">{fmt(dates[0])}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="#64748b">{fmt(dates[dates.length - 1])}</text>
        {targets.map((t) => (
          <g key={t.label}>
            <line x1={L} x2={W - R} y1={y(t.value)} y2={y(t.value)} stroke="#ef4444" strokeDasharray="4 3" strokeWidth="1" />
            <text x={W - R} y={y(t.value) - 3} textAnchor="end" fontSize="9" fill="#ef4444">{t.label} {t.value}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = dates.map((d, i) => [d, s.values[i]] as const).filter((p): p is readonly [Date, number] => p[1] != null);
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" points={pts.map(([d, v]) => `${x(d)},${y(v)}`).join(" ")} />
              {pts.map(([d, v], i) => <circle key={i} cx={x(d)} cy={y(v)} r="2.5" fill={s.color}><title>{`${fmt(d)}: ${v}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
