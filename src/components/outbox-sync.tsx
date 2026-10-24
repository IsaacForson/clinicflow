"use client";
import { useCallback, useEffect, useState } from "react";
import { discardOp, flush, listOps, OUTBOX_EVENT, type StoredOp } from "@/lib/offline-client";

const label = (o: StoredOp) => (o.type === "payment" ? `Payment ${(o.amountMinor / 100).toFixed(2)} (${o.method.replace("_", " ")})` : "Consultation note");

/** Replays the offline outbox when the connection returns and every 30s; shows what is still waiting. */
export function OutboxSync() {
  const [ops, setOps] = useState<StoredOp[]>([]);
  const [syncing, setSyncing] = useState(false);
  const refresh = useCallback(() => { listOps().then(setOps, () => setOps([])); }, []);
  const sync = useCallback(async () => {
    if (!("indexedDB" in window)) return;
    setSyncing(true);
    await flush();
    setSyncing(false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!("indexedDB" in window)) return;
    const first = setTimeout(sync, 0);
    const timer = setInterval(sync, 30_000);
    window.addEventListener("online", sync);
    window.addEventListener(OUTBOX_EVENT, refresh);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("online", sync); window.removeEventListener(OUTBOX_EVENT, refresh); };
  }, [sync, refresh]);

  const pending = ops.filter((o) => o.status === "pending");
  const rejected = ops.filter((o) => o.status === "rejected");
  if (!ops.length) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        {pending.length > 0 && <span>{pending.length} change{pending.length === 1 ? "" : "s"} saved on this device, waiting to sync.</span>}
        {pending.length > 0 && <button type="button" onClick={sync} disabled={syncing} className="rounded bg-white px-2 py-0.5 text-xs font-medium ring-1 ring-amber-300 hover:bg-amber-100 disabled:opacity-60">{syncing ? "Syncing…" : "Sync now"}</button>}
        {rejected.length > 0 && (
          <details className="w-full">
            <summary className="cursor-pointer font-medium text-red-800">{rejected.length} change{rejected.length === 1 ? "" : "s"} could not be saved — review</summary>
            <ul className="mt-2 space-y-2">
              {rejected.map((o) => (
                <li key={o.id} className="rounded bg-white p-2 ring-1 ring-red-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{label(o)}</strong> · {new Date(o.queuedAt).toLocaleString()} — <span className="text-red-700">{o.error}</span></span>
                    <button type="button" className="text-xs text-slate-600 underline" onClick={() => { if (window.confirm("Discard this change from this device? Copy anything you need first.")) discardOp(o.id); }}>Discard</button>
                  </div>
                  {o.type === "visit.note" && (
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{Object.entries(o.note).filter(([k, v]) => k !== "extra" && v).map(([k, v]) => `${k}: ${v}`).join("\n\n")}</pre>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
