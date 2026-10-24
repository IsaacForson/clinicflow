import type { ReactNode } from "react";
import { PrintButton } from "@/components/form";
import { LinkButton } from "@/components/ui";
import type { Tenant } from "@/db/schema";

/** Print page wrapper: back link + print button (hidden on paper) and the clinic letterhead. */
export function PrintDoc({ tenant, title, back, children }: { tenant: Tenant; title: string; back: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
      <div className="mb-6 flex justify-between print:hidden">
        <LinkButton variant="ghost" href={back}>← Back</LinkButton>
        <PrintButton />
      </div>
      <header className="mb-6 flex items-start justify-between gap-4 border-b border-slate-300 pb-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {tenant.logoUrl && <img src={tenant.logoUrl} alt="" className="h-14 w-14 object-contain" />}
          <div>
            <div className="text-xl font-bold text-slate-900">{tenant.name}</div>
            {tenant.letterhead && <div className="whitespace-pre-line text-xs text-slate-600">{tenant.letterhead}</div>}
            <div className="text-xs text-slate-600">{[tenant.address, tenant.phone, tenant.email].filter(Boolean).join(" · ")}</div>
            {(tenant.registrationNo || tenant.taxId) && (
              <div className="text-xs text-slate-500">{[tenant.registrationNo && `Reg. ${tenant.registrationNo}`, tenant.taxId && `TIN ${tenant.taxId}`].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        </div>
        <div className="text-right text-lg font-semibold uppercase tracking-wide text-slate-700">{title}</div>
      </header>
      {children}
    </div>
  );
}
