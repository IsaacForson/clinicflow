"use client";
import { useSyncExternalStore } from "react";
import { clearOfflineData, flush, listOps } from "@/lib/offline-client";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-gradient-to-r from-slate-900 to-brand-950 px-4 py-2 text-center text-sm text-white print:hidden">
      You are offline. Recent pages stay available; visit notes and payments are saved on this device and sync when you reconnect.
    </div>
  );
}

/** Sign-out that first wipes cached pages and the offline outbox, so shared front-desk devices keep no patient data. */
export function SignOutButton({ action, className, children }: { action: () => Promise<void>; className?: string; children?: React.ReactNode }) {
  return (
    <form action={async () => {
      // Try to sync first; never silently drop a note or payment saved offline.
      await flush().catch(() => {});
      const pending = (await listOps().catch(() => [])).filter((o) => o.status === "pending").length;
      if (pending && !window.confirm(`${pending} change(s) saved offline have not synced yet and will be lost if you sign out. Sign out anyway?`)) return;
      await clearOfflineData().catch(() => 0);
      await action();
    }}>
      <button className={className ?? "text-slate-600 hover:text-slate-900"}>{children ?? "Sign out"}</button>
    </form>
  );
}
