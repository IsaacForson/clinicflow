// Pure scheduling helpers (no DB) — safe to import from server, client and tests.
import type { Tone } from "@/components/ui";

export type ApptStatus = "scheduled" | "confirmed" | "arrived" | "completed" | "cancelled" | "no_show";

const TRANSITIONS: Record<ApptStatus, ApptStatus[]> = {
  scheduled: ["confirmed", "arrived", "cancelled", "no_show"],
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};
export const nextStatuses = (from: ApptStatus) => TRANSITIONS[from];
export const canTransition = (from: ApptStatus, to: ApptStatus) => TRANSITIONS[from].includes(to);
export const canReschedule = (s: ApptStatus) => s === "scheduled" || s === "confirmed";

export const STATUS_LABEL: Record<ApptStatus, string> = {
  scheduled: "Scheduled", confirmed: "Confirmed", arrived: "Arrived", completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
};
export const STATUS_TONE: Record<ApptStatus, Tone> = {
  scheduled: "blue", confirmed: "teal", arrived: "yellow", completed: "green", cancelled: "gray", no_show: "red",
};
export const ACTION_LABEL: Record<ApptStatus, string> = {
  scheduled: "Reopen", confirmed: "Confirm", arrived: "Arrived", completed: "Complete", cancelled: "Cancel", no_show: "No-show",
};

/** Minutes since local midnight of an instant in tz. */
export function localMinutes(d: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Visible window for the day grid: default 07:00–19:00, widened to whole hours covering every appointment. */
export function dayWindow(items: { start: number; end: number }[], from = 7 * 60, to = 19 * 60) {
  let s = from, e = to;
  for (const i of items) { s = Math.min(s, Math.floor(i.start / 60) * 60); e = Math.max(e, Math.ceil(i.end / 60) * 60); }
  return { start: Math.max(0, s), end: Math.min(24 * 60, e) };
}

/** Slot start times (minutes) in [start, end). */
export function timeSlots(start: number, end: number, step = 15): number[] {
  const out: number[] = [];
  for (let m = start; m < end; m += step) out.push(m);
  return out;
}

/**
 * Side-by-side lanes for overlapping blocks in one column (double bookings stay visible).
 * Each item gets a lane index and the lane count of its overlap cluster.
 */
export function assignLanes<T extends { start: number; end: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number })[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = laneEnds.length;
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = []; laneEnds = []; clusterEnd = -Infinity;
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    cluster.push({ ...it, lane });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Monday of the week containing day (YYYY-MM-DD). */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** "Dr. Ama Mensah" style practitioner label. */
export const practitionerName = (u: { name: string; title?: string | null } | null | undefined) =>
  u ? [u.title, u.name].filter(Boolean).join(" ") : "";
