import { Suspense } from "react";

// Per-patient, per-request data behind a magic link.
export const instant = false;

export const metadata = { title: "Patient portal", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-lg px-4 py-5">
        <Suspense fallback={<div className="animate-pulse space-y-3"><div className="h-16 rounded-lg bg-slate-200" /><div className="h-40 rounded-lg bg-slate-200" /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
