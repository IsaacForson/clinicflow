import { LogOut, Plus, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { requireCtx } from "@/lib/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { hasFeature, trialDaysLeft, type Feature } from "@/lib/plans";
import { logoutAction } from "../(auth)/actions";
import { CommandPalette, CommandTrigger } from "./command-palette";
import { LogoMark, Nav, type NavItem } from "./nav";
import { switchBranchAction } from "./shell-actions";
import { OfflineBanner, SignOutButton } from "@/components/offline";
import { OutboxSync } from "@/components/outbox-sync";
import { SwRegister } from "@/components/sw-register";

// Every screen here is per-user, per-request data; opt out of instant-navigation validation.
export const instant = false;

const NAV: (NavItem & { perm?: Permission; feature?: Feature })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", group: "Today" },
  { href: "/queue", label: "Queue", icon: "ListOrdered", perm: "queue.manage", group: "Today" },
  { href: "/appointments", label: "Appointments", icon: "CalendarDays", perm: "appointments.manage", group: "Today" },
  { href: "/patients", label: "Patients", icon: "Users", perm: "patients.read", group: "Care" },
  { href: "/visits", label: "Consultations", icon: "Stethoscope", perm: "clinical.read", group: "Care" },
  { href: "/lab", label: "Lab & imaging", icon: "FlaskConical", perm: "lab.result", feature: "lab", group: "Care" },
  { href: "/pharmacy", label: "Pharmacy", icon: "Pill", perm: "dispense", feature: "dispensary", group: "Care" },
  { href: "/care", label: "Chronic care", icon: "HeartPulse", perm: "clinical.read", group: "Care" },
  { href: "/billing", label: "Billing", icon: "CreditCard", perm: "billing.read", group: "Business" },
  { href: "/insurance", label: "Insurance", icon: "ShieldCheck", perm: "insurance.manage", feature: "insurance", group: "Business" },
  { href: "/messages", label: "Messages", icon: "MessageSquare", perm: "messaging.send", group: "Business" },
  { href: "/reports", label: "Reports", icon: "BarChart3", perm: "reports.view", group: "Business" },
  { href: "/settings", label: "Settings", icon: "Settings", perm: "settings.manage", group: "Business" },
];

const ACTIONS: { href: string; label: string; perm: Permission }[] = [
  { href: "/patients/new", label: "Register a patient", perm: "patients.write" },
  { href: "/queue", label: "Add a walk-in to the queue", perm: "queue.manage" },
  { href: "/appointments/new", label: "Book an appointment", perm: "appointments.manage" },
  { href: "/billing/new", label: "Create an invoice", perm: "billing.write" },
  { href: "/billing/cashup", label: "Do today's cash-up", perm: "cashup" },
  { href: "/lab/new", label: "New lab order", perm: "lab.result" },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

async function SessionNav() {
  const ctx = await requireCtx();
  const items = NAV.filter((n) => (!n.perm || can(ctx.user.role, n.perm)) && (!n.feature || hasFeature(ctx.tenant, n.feature)))
    .map(({ href, label, icon, group }) => ({ href, label, icon, group }));
  return (
    <>
      <Nav items={items} clinic={ctx.tenant.name} footer={
        <div className="space-y-2">
          {ctx.branches.length > 1 && (
            <form action={switchBranchAction} className="flex gap-1.5">
              <select name="branchId" defaultValue={ctx.branchId} aria-label="Branch"
                className="min-w-0 flex-1 rounded-lg border-0 bg-white/[0.06] py-1.5 pl-2.5 text-xs text-slate-200 ring-1 ring-white/10 focus:ring-cyan-400">
                {ctx.branches.map((b) => <option key={b.id} value={b.id} className="text-slate-900">{b.name}</option>)}
              </select>
              <button className="rounded-lg bg-white/[0.08] px-2.5 text-xs font-medium text-slate-200 hover:bg-white/[0.14]">Switch</button>
            </form>
          )}
          <Link href="/account" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.05]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-cyan-400 text-xs font-semibold text-white ring-2 ring-white/10">{initials(ctx.user.name)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-100">{[ctx.user.title, ctx.user.name].filter(Boolean).join(" ")}</span>
              <span className="block truncate text-xs text-slate-500">{ROLE_LABELS[ctx.user.role]}</span>
            </span>
          </Link>
        </div>
      } />
      <CommandPalette pages={items} actions={ACTIONS.filter((a) => can(ctx.user.role, a.perm)).map(({ href, label }) => ({ href, label }))} canSearch={can(ctx.user.role, "patients.read")} />
    </>
  );
}

async function TopBar() {
  const ctx = await requireCtx();
  const branch = ctx.branches.find((b) => b.id === ctx.branchId)?.name;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-900/5 bg-white/60 backdrop-blur-xl print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 pl-16 pr-4 lg:px-8">
        <CommandTrigger canSearch={can(ctx.user.role, "patients.read")} />
        <div className="ml-auto flex items-center gap-2">
          {ctx.branches.length > 1 && <span className="hidden rounded-full bg-slate-900/5 px-3 py-1 text-xs font-medium text-slate-600 md:inline">{branch}</span>}
          {can(ctx.user.role, "patients.write") && ctx.access === "full" && (
            <Link href="/patients/new" className="hidden h-10 items-center gap-1.5 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-3.5 text-sm font-medium text-white shadow-glow transition hover:brightness-110 sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden /> New patient
            </Link>
          )}
          <SignOutButton action={logoutAction} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-900/10 transition hover:bg-white hover:text-slate-900">
            <LogOut className="h-4 w-4" aria-label="Sign out" />
          </SignOutButton>
        </div>
      </div>
    </header>
  );
}

async function Banners() {
  const ctx = await requireCtx();
  const trialDays = trialDaysLeft(ctx.tenant);
  const bar = "mx-auto mt-4 flex max-w-7xl items-center gap-3 rounded-2xl px-4 py-2.5 text-sm print:hidden";
  return (
    <div className="px-4 lg:px-8">
      {ctx.access === "read_only" && (
        <div className={`${bar} bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/20`}>
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>This account is read-only because the subscription is unpaid. Your data is safe and exportable.</span>
          <Link href="/settings/subscription" className="ml-auto font-semibold underline">Renew</Link>
        </div>
      )}
      {trialDays !== null && trialDays <= 7 && ctx.access === "full" && (
        <div className={`${bar} bg-gradient-to-r from-brand-500/10 to-cyan-400/10 text-brand-900 ring-1 ring-brand-500/15`}>
          <Sparkles className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
          <span>{trialDays > 0 ? `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial.` : "Your trial has ended."}</span>
          {can(ctx.user.role, "settings.manage") && <Link href="/settings/subscription" className="ml-auto font-semibold underline">Choose a plan</Link>}
        </div>
      )}
      {ctx.user.role === "owner" && !ctx.user.totpEnabled && (
        <div className={`${bar} bg-white/70 text-xs text-slate-600 ring-1 ring-slate-900/5`}>
          <ShieldAlert className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
          <span>Protect patient data: turn on two-factor authentication for your owner account.</span>
          <Link href="/account" className="ml-auto font-semibold text-brand-700 underline">Set up</Link>
        </div>
      )}
    </div>
  );
}

const PageFallback = (
  <div className="space-y-4">
    <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-900/[0.06]" />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-900/[0.05]" />)}</div>
    <div className="h-64 animate-pulse rounded-2xl bg-slate-900/[0.05]" />
  </div>
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cf-aurora min-h-screen print:bg-white">
      <Suspense fallback={<aside className="fixed inset-y-0 left-0 hidden w-64 bg-slate-950 lg:block"><div className="p-5"><LogoMark /></div></aside>}>
        <SessionNav />
      </Suspense>
      <div className="lg:pl-64">
        <OfflineBanner />
        <SwRegister />
        <OutboxSync />
        <Suspense fallback={<div className="h-16 border-b border-slate-900/5 bg-white/60" />}><TopBar /></Suspense>
        <Suspense fallback={null}><Banners /></Suspense>
        <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8 print:max-w-none print:p-0">
          <Suspense fallback={PageFallback}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
