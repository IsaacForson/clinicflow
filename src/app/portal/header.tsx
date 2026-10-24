import { Clock, Phone } from "lucide-react";
import { LogoMark, ThemeToggle } from "@/app/(app)/nav";
import type { Tenant } from "@/db/schema";

const greeting = (tz: string) => {
  const h = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** Greeting hero: clinic identity, patient greeting, quick call. */
export function ClinicHeader({ tenant, patientName, compact }: { tenant: Tenant; patientName: string; compact?: boolean }) {
  return (
    <header className="mb-5 animate-rise">
      <div className="mb-4 flex items-center gap-3">
        {tenant.logoUrl
          ? <img src={tenant.logoUrl} alt="" className="h-10 w-10 rounded-xl border border-line bg-surface-2 object-contain p-1" />
          : <span className="grid h-10 w-10 place-items-center rounded-xl bg-aurora text-base font-semibold text-on-accent shadow-glow">{tenant.name[0]}</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{tenant.name}</div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-subtle">Patient portal</div>
        </div>
        {tenant.phone && (
          <a href={`tel:${tenant.phone}`} aria-label={`Call ${tenant.name}`} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:bg-surface-3 hover:text-fg">
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        )}
        <ThemeToggle className="h-10 w-10 border border-line bg-surface" />
      </div>
      {!compact && (
        <div className="glass relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-aurora opacity-25 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 text-xs text-muted"><Clock className="h-3.5 w-3.5" aria-hidden />{greeting(tenant.timezone)}</div>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg">Hello, <span className="text-aurora">{patientName}</span></h1>
            <p className="mt-1 text-sm text-muted">Your appointments, bills and results in one place.</p>
          </div>
        </div>
      )}
    </header>
  );
}

export function Expired() {
  return (
    <div className="flex min-h-[70vh] items-center">
      <div className="glass w-full p-8 text-center animate-rise">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-fg">This link has expired</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">For your privacy, portal links work for 7 days. Reply <strong className="text-fg">PORTAL</strong> to your clinic on WhatsApp or SMS to get a new link.</p>
      </div>
    </div>
  );
}
