import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/form";
import { LinkButton } from "@/components/ui";
import type { Tenant } from "@/db/schema";

/** A4-ish printable sheet with the clinic letterhead. Glass on screen, plain paper when printing (tokens switch to light on print). */
export function PrintDoc({ tenant, title, backHref, children }: { tenant: Tenant; title: string; backHref: string; children: ReactNode }) {
  return (
    <>
      <div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-2 print:hidden">
        <LinkButton variant="ghost" href={backHref}><ArrowLeft className="h-4 w-4" aria-hidden />Back to consultation</LinkButton>
        <PrintButton />
      </div>
      <article className="glass relative mx-auto max-w-3xl overflow-hidden text-sm leading-relaxed text-fg animate-rise print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:shadow-none print:backdrop-blur-none">
        <div className="h-1.5 bg-aurora print:h-1" aria-hidden />
        <div className="p-8 sm:p-12 print:p-0 print:pt-4">
          <header className="flex items-start justify-between gap-6 border-b border-line-strong pb-5">
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-tight text-fg">{tenant.name}</div>
              <div className="mt-1 space-y-0.5 text-xs text-muted">
                {tenant.letterhead?.split("\n").map((l, i) => <div key={i}>{l}</div>)}
                <div>{[tenant.address, tenant.phone, tenant.email].filter(Boolean).join(" · ")}</div>
                {tenant.registrationNo && <div>Reg. no. {tenant.registrationNo}</div>}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {tenant.logoUrl && <img src={tenant.logoUrl} alt="" className="h-16 w-auto object-contain" />}
          </header>
          <h1 className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.3em] text-muted">{title}</h1>
          {children}
        </div>
      </article>
    </>
  );
}
