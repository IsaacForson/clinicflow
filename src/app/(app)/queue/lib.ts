// Pure queue helpers (no DB).
export type QueueStatus = "waiting" | "with_doctor" | "lab" | "billing" | "pharmacy" | "done" | "left";

export const BOARD_COLUMNS: { key: QueueStatus; label: string }[] = [
  { key: "waiting", label: "Waiting" },
  { key: "with_doctor", label: "With doctor" },
  { key: "lab", label: "Lab" },
  { key: "billing", label: "Billing" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "done", label: "Done" },
];
export const QUEUE_STATUSES = [...BOARD_COLUMNS.map((c) => c.key), "left"] as const;
export const SHORT_LABEL: Record<QueueStatus, string> = {
  waiting: "Wait", with_doctor: "Doctor", lab: "Lab", billing: "Billing", pharmacy: "Pharmacy", done: "Done", left: "Left",
};

/** Average minutes from joining the queue to being called, over tickets that were called. Null when none. */
export function averageWaitMinutes(tickets: { createdAt: Date; calledAt: Date | null }[]): number | null {
  const waits = tickets.filter((t) => t.calledAt).map((t) => (t.calledAt!.getTime() - t.createdAt.getTime()) / 60_000);
  if (!waits.length) return null;
  return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}

/** Order for "who's next": urgent first, then first come first served. */
export const byNext = (a: { priority: number; createdAt: Date }, b: { priority: number; createdAt: Date }) =>
  b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime();

export const minutesSince = (d: Date, now = Date.now()) => Math.max(0, Math.round((now - d.getTime()) / 60_000));

export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}
