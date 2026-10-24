type Series = { label: string; color: string; values: (number | null)[] };

/** Minimal inline SVG line chart (no chart library). Points share one time axis; nulls break nothing, they're skipped. Colours are CSS variables, e.g. "var(--accent)". */
export function TrendChart({ title, dates, series, targets = [], unit, tz }: {
  title: string; dates: Date[]; series: Series[]; targets?: { label: string; value: number }[]; unit: string; tz: string;
}) {
  const W = 600, H = 190, L = 36, R = 8, T = 12, B = 22;
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v != null)), ...targets.map((t) => t.value)];
  if (dates.length < 2 || all.length === 0) return (
    <div className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">{title}: not enough readings for a trend yet.</div>
  );
  const min = Math.floor(Math.min(...all) * 0.95), max = Math.ceil(Math.max(...all) * 1.05);
  const t0 = dates[0].getTime(), t1 = dates[dates.length - 1].getTime() || t0 + 1;
  const x = (d: Date) => L + ((d.getTime() - t0) / Math.max(t1 - t0, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / Math.max(max - min, 1)) * (H - T - B);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  const gid = title.replace(/\W/g, "");
  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="font-medium text-fg">{title} <span className="text-subtle">({unit})</span></span>
        {series.map((s) => <span key={s.label} className="flex items-center gap-1.5"><span className="inline-block h-1 w-4 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
        {targets.length > 0 && <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-bad" />target</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`${title} trend`}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gid}${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.22" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} stroke="var(--line)" />)}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="var(--line-strong)" />
        <text x={L - 6} y={T + 4} textAnchor="end" fontSize="10" fill="var(--subtle)">{max}</text>
        <text x={L - 6} y={H - B} textAnchor="end" fontSize="10" fill="var(--subtle)">{min}</text>
        <text x={L} y={H - 6} fontSize="10" fill="var(--subtle)">{fmt(dates[0])}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--subtle)">{fmt(dates[dates.length - 1])}</text>
        {targets.map((t) => (
          <g key={t.label}>
            <line x1={L} x2={W - R} y1={y(t.value)} y2={y(t.value)} stroke="var(--bad)" strokeOpacity="0.8" strokeDasharray="4 4" strokeWidth="1" />
            <text x={W - R} y={y(t.value) - 4} textAnchor="end" fontSize="9" fill="var(--bad)">{t.label} {t.value}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = dates.map((d, i) => [d, s.values[i]] as const).filter((p): p is readonly [Date, number] => p[1] != null);
          const line = pts.map(([d, v]) => `${x(d)},${y(v)}`).join(" ");
          return (
            <g key={s.label}>
              {pts.length > 1 && <polygon points={`${x(pts[0][0])},${H - B} ${line} ${x(pts[pts.length - 1][0])},${H - B}`} fill={`url(#${gid}${si})`} />}
              <polyline fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" points={line} />
              {pts.map(([d, v], i) => <circle key={i} cx={x(d)} cy={y(v)} r="3" fill="var(--canvas)" stroke={s.color} strokeWidth="2"><title>{`${fmt(d)}: ${v}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
