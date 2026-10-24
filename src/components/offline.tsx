"use client";
import { useSyncExternalStore } from "react";

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
    <div role="status" className="bg-slate-800 px-4 py-2 text-center text-sm text-white print:hidden">
      You are offline. Recent pages stay available; visit notes and payments are saved on this device and sync when you reconnect.
    </div>
  );
}
