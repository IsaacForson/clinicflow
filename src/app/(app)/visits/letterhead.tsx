import type { ReactNode } from "react";
import { PrintButton } from "@/components/form";
import { LinkButton } from "@/components/ui";
import type { Tenant } from "@/db/schema";

/** A4-ish printable document with the clinic letterhead. Chrome is hidden when printing. */
export function PrintDoc({ tenant, title, backHref, children }: { tenant: Tenant; title: string; backHref: string; children: ReactNode }) {
  return (
    <>
      <div className="mb-4 flex gap-2 print:hidden"><LinkButton variant="secondary" href={backHref}>← Back to consultation</LinkButton><PrintButton /></div>
      <article className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-900 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-teal-800 pb-3">
          <div>
            <div className="text-xl font-bold text-teal-900">{tenant.name}</div>
            {tenant.letterhead?.split("\n").map((l, i) => <div key={i} className="text-xs text-slate-600">{l}</div>)}
            <div className="text-xs text-slate-600">{[tenant.address, tenant.phone, tenant.email].filter(Boolean).join(" · ")}</div>
            {tenant.registrationNo && <div className="text-xs text-slate-600">Reg. no. {tenant.registrationNo}</div>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {tenant.logoUrl && <img src={tenant.logoUrl} alt="" className="h-16 w-auto object-contain" />}
        </header>
        <h1 className="mt-4 text-center text-base font-semibold uppercase tracking-wide">{title}</h1>
        {children}
      </article>
    </>
  );
}
