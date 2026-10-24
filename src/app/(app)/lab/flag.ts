export const FLAGS = ["normal", "low", "high", "critical"] as const;
export type Flag = (typeof FLAGS)[number];

/** Suggests low/high/normal when the value is numeric and the reference range reads "a-b" (e.g. "3.5-5.0"). */
export function suggestFlag(value: string | null | undefined, refRange: string | null | undefined): Flag | null {
  const v = value?.trim();
  if (!v || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  const m = refRange?.trim().match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Number(v), lo = Number(m[1]), hi = Number(m[2]);
  return n < lo ? "low" : n > hi ? "high" : "normal";
}

export const LAB_TONE = { ordered: "yellow", collected: "blue", resulted: "teal", notified: "green", cancelled: "gray" } as const;
export const FLAG_TONE = { normal: "green", low: "yellow", high: "yellow", critical: "red" } as const;
