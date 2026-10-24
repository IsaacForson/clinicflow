"use client";
import { useCallback, useRef, useState } from "react";
import type { OpResult } from "@/app/api/offline/sync/ops";
import { queueOp } from "@/lib/offline-client";
import type { NoteInput } from "@/lib/visits";

export type SaveResult = { status: "saved"; version: number } | { status: "queued" } | { status: "error"; error: string };

/**
 * Consultation note saving that survives dropped connections: posts straight to the sync endpoint when online,
 * otherwise (or if the request fails) keeps the note in the device outbox for <OutboxSync/> to replay.
 * Usage: const { save, state, version } = useOfflineSave({ visitId, userId: ctx.user.id, version: visit.version });
 */
export function useOfflineSave(o: { visitId: string; userId: string; version: number }) {
  const version = useRef(o.version);
  const [current, setCurrent] = useState(o.version);
  const [state, setState] = useState<SaveResult | null>(null);

  const save = useCallback(async (note: NoteInput): Promise<SaveResult> => {
    const op = { type: "visit.note" as const, userId: o.userId, visitId: o.visitId, baseVersion: version.current, note };
    let result: SaveResult;
    try {
      if (!navigator.onLine) throw new Error("offline");
      const res = await fetch("/api/offline/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ops: [{ id: 0, ...op }] }),
      });
      if (res.status === 401) throw new Error("signed out"); // keep the note on the device; it syncs after sign-in
      if (res.status === 400) {
        result = { status: "error", error: ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save" };
      } else {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const r = ((await res.json()) as { results: OpResult[] }).results[0];
        if (r?.status === "saved" && r.version) { version.current = r.version; setCurrent(r.version); result = { status: "saved", version: r.version }; }
        else if (r?.status === "rejected") result = { status: "error", error: r.error ?? "Could not save" };
        else throw new Error("retry");
      }
    } catch {
      await queueOp(op);
      result = { status: "queued" };
    }
    setState(result);
    return result;
  }, [o.userId, o.visitId]);

  return { save, state, version: current };
}

/** Small status line to show next to the Save button. */
export function SaveStatus({ state }: { state: SaveResult | null }) {
  if (!state) return null;
  const text = state.status === "saved" ? "Saved" : state.status === "queued" ? "Saved on this device — will sync when online" : state.error;
  const tone = state.status === "error" ? "text-bad" : state.status === "queued" ? "text-warn" : "text-ok";
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />{text}
    </span>
  );
}
