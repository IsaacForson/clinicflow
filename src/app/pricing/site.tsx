// Shared chrome for the public marketing pages (/, /pricing, /terms, /privacy, /security).
import Link from "next/link";
import type { ReactNode } from "react";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-white" aria-hidden>
        <svg viewBox="0 0 64 64" className="h-4 w-4"><path fill="currentColor" d="M23 6h18v17h17v18H41v17H23V41H6V23h17z" /></svg>
      </span>
      ClinicFlow
    </Link>
  );
}

const NAV = [["/#features", "Features"], ["/pricing", "Pricing"], ["/security", "Security"]] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-white focus:px-3 focus:py-1 focus:shadow">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {NAV.map(([href, label]) => <Link key={href} href={href} className="hidden rounded-md px-3 py-2 text-slate-600 hover:text-slate-900 sm:block">{label}</Link>)}
          <Link href="/login" className="rounded-md px-3 py-2 text-slate-700 hover:text-slate-900">Sign in</Link>
          <Link href="/signup" className="rounded-md bg-brand-700 px-3.5 py-2 font-medium text-white shadow-sm hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Start free trial</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-4 sm:px-6">
        <div className="space-y-3 sm:col-span-2">
          <Logo />
          <p className="max-w-sm text-slate-600">Clinic software built for private practices in Ghana, Nigeria and Kenya. Your data is always yours.</p>
        </div>
        <nav aria-label="Product" className="space-y-2">
          <p className="font-semibold text-slate-900">Product</p>
          <Link href="/#features" className="block text-slate-600 hover:text-slate-900">Features</Link>
          <Link href="/pricing" className="block text-slate-600 hover:text-slate-900">Pricing</Link>
          <Link href="/security" className="block text-slate-600 hover:text-slate-900">Security</Link>
        </nav>
        <nav aria-label="Legal" className="space-y-2">
          <p className="font-semibold text-slate-900">Legal</p>
          <Link href="/terms" className="block text-slate-600 hover:text-slate-900">Terms of service</Link>
          <Link href="/privacy" className="block text-slate-600 hover:text-slate-900">Privacy policy</Link>
        </nav>
      </div>
      <p className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">© ClinicFlow. ClinicFlow is practice-management software and does not provide medical advice.</p>
    </footer>
  );
}

export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** Long-form legal/security page layout. */
export function DocPage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <SitePage>
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated {updated}</p>
        <div className="mt-6 text-lg text-slate-600">{intro}</div>
        <div className="mt-10 space-y-8 text-slate-700 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-brand-700 [&_a]:underline [&_table]:mt-3 [&_td]:border-t [&_td]:border-slate-200 [&_td]:py-2 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold">
          {children}
        </div>
      </article>
    </SitePage>
  );
}
