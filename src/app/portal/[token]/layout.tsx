import { Suspense } from "react";

// Per-patient, per-request data behind a magic link.
export const instant = false;

export const metadata = { title: "Patient portal", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="backdrop-os min-h-screen text-fg">
      <main className="mx-auto max-w-lg px-4 pb-12 pt-5 sm:pt-10">
        <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="skeleton h-36 rounded-[1.25rem]" /><div className="skeleton h-56 rounded-[1.25rem]" /><div className="skeleton h-32 rounded-[1.25rem]" /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
