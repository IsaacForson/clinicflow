import { zonedToUtc } from "@/lib/format";

export type Busy = { start: Date; end: Date };

/** Start times of free slots on a local day: 15-min grid inside clinic hours, not overlapping busy ranges, not in the past. */
export function freeSlots(o: { day: string; tz: string; durationMin: number; busy: Busy[]; now?: Date; open?: string; close?: string; stepMin?: number }): Date[] {
  const step = (o.stepMin ?? 15) * 60_000;
  const dur = Math.max(o.durationMin, 5) * 60_000;
  const close = zonedToUtc(o.day, o.close ?? "17:00", o.tz).getTime();
  const now = (o.now ?? new Date()).getTime();
  const out: Date[] = [];
  for (let s = zonedToUtc(o.day, o.open ?? "08:00", o.tz).getTime(); s + dur <= close; s += step) {
    if (s <= now) continue;
    if (o.busy.some((b) => s < b.end.getTime() && s + dur > b.start.getTime())) continue;
    out.push(new Date(s));
  }
  return out;
}
