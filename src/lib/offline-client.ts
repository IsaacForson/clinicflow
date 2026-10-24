"use client";
// Offline outbox: ops saved on this device (IndexedDB) and replayed to /api/offline/sync in order.
import type { OpResult, OutboxOp } from "@/app/api/offline/sync/ops";

export type { OutboxOp };
export type StoredOp = OutboxOp & { id: number; queuedAt: number; status: "pending" | "rejected"; error?: string };

const DB = "clinicflow-outbox";
const STORE = "ops";
export const OUTBOX_EVENT = "clinicflow:outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const changed = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

/** All ops in queue order (pending and rejected). */
export async function listOps(): Promise<StoredOp[]> {
  return (await withStore<StoredOp[]>("readonly", (s) => s.getAll() as IDBRequest<StoredOp[]>)) ?? [];
}

/** Saves an op on this device. Repeated note edits for the same visit fold into one op (keeping the original baseVersion). */
export async function queueOp(op: OutboxOp): Promise<void> {
  if (op.type === "visit.note") {
    const prev = (await listOps()).find((o): o is Extract<StoredOp, { type: "visit.note" }> =>
      o.type === "visit.note" && o.status === "pending" && o.visitId === op.visitId && o.userId === op.userId);
    if (prev) {
      const merged = { ...prev, note: { ...prev.note, ...op.note, extra: op.note.extra || prev.note.extra ? { ...prev.note.extra, ...op.note.extra } : undefined }, queuedAt: Date.now() };
      await withStore("readwrite", (s) => { s.put(merged); });
      changed();
      return;
    }
  }
  await withStore("readwrite", (s) => { s.add({ ...op, queuedAt: Date.now(), status: "pending" }); });
  changed();
}

export async function discardOp(id: number) {
  await withStore("readwrite", (s) => { s.delete(id); });
  changed();
}

let flushing: Promise<{ saved: number; pending: number }> | null = null;

/** Sends pending ops to the server. Saved ops are removed; refused ones stay (marked rejected) so nothing typed is lost. */
export function flush(): Promise<{ saved: number; pending: number }> {
  return (flushing ??= (async () => {
    try {
      const pending = (await listOps()).filter((o) => o.status === "pending");
      if (!pending.length || !navigator.onLine) return { saved: 0, pending: pending.length };
      const res = await fetch("/api/offline/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ ops: pending.slice(0, 100) }), // server schema strips the local-only fields
      });
      if (!res.ok) return { saved: 0, pending: pending.length };
      const { results } = (await res.json()) as { results: OpResult[] };
      let saved = 0;
      await withStore("readwrite", (s) => {
        for (const r of results) {
          const op = pending.find((o) => o.id === r.id);
          if (!op || r.status === "retry") continue;
          if (r.status === "saved") saved++;
          // An edit folded into this op while it was in flight changes queuedAt: keep it pending so it is sent again.
          const cur = s.get(r.id);
          cur.onsuccess = () => {
            if ((cur.result as StoredOp | undefined)?.queuedAt !== op.queuedAt) return;
            if (r.status === "saved") s.delete(r.id); else s.put({ ...op, status: "rejected", error: r.error });
          };
        }
      });
      changed();
      return { saved, pending: pending.length - saved };
    } catch {
      return { saved: 0, pending: (await listOps().catch(() => [])).filter((o) => o.status === "pending").length };
    } finally {
      flushing = null;
    }
  })());
}

/** Wipes locally cached pages and the outbox (call on sign-out on shared devices). Returns ops that were still unsynced. */
export async function clearOfflineData(): Promise<number> {
  const unsynced = (await listOps().catch(() => [])).filter((o) => o.status === "pending").length;
  if ("caches" in window) for (const k of await caches.keys()) if (k.startsWith("cf-pages")) await caches.delete(k);
  await new Promise<void>((r) => { const req = indexedDB.deleteDatabase(DB); req.onsuccess = req.onerror = req.onblocked = () => r(); });
  changed();
  return unsynced;
}
