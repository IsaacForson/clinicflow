export type Targets = { bpSys?: number; bpDia?: number; glucose?: number };
type Reading = { bpSys: number | null; bpDia: number | null; glucose: number | null };

/** Compares a reading with the clinic-set targets (display only, no clinical advice). */
export function readingVsTarget(r: Reading | undefined, tg: Targets) {
  if (!r) return null;
  const above = (r.bpSys != null && tg.bpSys != null && r.bpSys > tg.bpSys) || (r.bpDia != null && tg.bpDia != null && r.bpDia > tg.bpDia) || (r.glucose != null && tg.glucose != null && r.glucose > tg.glucose);
  return above ? "above" : "within";
}
