import { cx } from "@/components/ui";

const DOT = { normal: "bg-ok", low: "bg-warn", high: "bg-warn", critical: "bg-bad" } as const;

/** Where a numeric result sits against an "a-b" reference range: the range fills the middle half of the track. */
export function RangeBar({ value, refRange, flag }: { value: string | null; refRange: string | null; flag: string | null }) {
  const m = refRange?.trim().match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
  const v = value?.trim();
  if (!m || !v || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  const lo = Number(m[1]), hi = Number(m[2]), n = Number(v);
  const pos = Math.min(Math.max(25 + ((n - lo) / (hi - lo || 1)) * 50, 2), 98);
  return (
    <div className="relative h-2 rounded-full bg-surface-3" role="img" aria-label={`${v} against reference range ${lo} to ${hi}`}>
      <div className="absolute inset-y-0 left-1/4 right-1/4 rounded-full bg-ok/25" />
      <span className="absolute -bottom-4 left-1/4 -translate-x-1/2 text-[9px] tabular-nums text-subtle">{lo}</span>
      <span className="absolute -bottom-4 right-1/4 translate-x-1/2 text-[9px] tabular-nums text-subtle">{hi}</span>
      <span className={cx("absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas shadow-panel", DOT[(flag ?? "normal") as keyof typeof DOT] ?? "bg-accent")} style={{ left: `${pos}%` }} />
    </div>
  );
}
