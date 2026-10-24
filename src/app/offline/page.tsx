/* eslint-disable @next/next/no-html-link-for-pages -- full navigations are answered from the service worker cache while offline; <Link> would fetch RSC and fail */
import { OutboxSync } from "@/components/outbox-sync";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <OutboxSync />
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-teal-700 text-xl font-semibold text-white" aria-hidden>C</span>
        <h1 className="mt-5 text-2xl font-semibold text-slate-900">You&apos;re offline</h1>
        <p className="mt-2 text-slate-600">
          This page hasn&apos;t been saved on this device yet. Pages you opened recently — the dashboard, queue, patient records and
          consultations — are still available. Notes and payments you save now are kept on this device and sync automatically when the
          connection returns.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a href="/dashboard" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Dashboard</a>
          <a href="/queue" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Queue</a>
          <a href="/patients" className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">Patients</a>
        </div>
      </div>
    </main>
  );
}
