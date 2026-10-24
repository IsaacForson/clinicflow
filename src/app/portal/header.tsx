import type { Tenant } from "@/db/schema";

export function ClinicHeader({ tenant, patientName }: { tenant: Tenant; patientName: string }) {
  return (
    <header className="mb-4 flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      {tenant.logoUrl
        ? <img src={tenant.logoUrl} alt="" className="h-12 w-12 rounded object-contain" />
        : <span className="grid h-12 w-12 place-items-center rounded-md bg-brand-700 text-lg font-semibold text-white">{tenant.name[0]}</span>}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-slate-900">{tenant.name}</h1>
        <p className="text-sm text-slate-500">Hello {patientName}{tenant.phone ? ` · ${tenant.phone}` : ""}</p>
      </div>
    </header>
  );
}

export function Expired() {
  return (
    <div className="rounded-lg bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
      <h1 className="text-lg font-semibold text-slate-900">This link has expired</h1>
      <p className="mt-2 text-sm text-slate-600">For your privacy, portal links work for 7 days. Reply <strong>PORTAL</strong> to your clinic on WhatsApp or SMS to get a new link.</p>
    </div>
  );
}
