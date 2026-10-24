import Link from "next/link";
import { Suspense } from "react";
import { requireCtx } from "@/lib/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { hasFeature, trialDaysLeft, type Feature } from "@/lib/plans";
import { logoutAction } from "../(auth)/actions";
import { Nav, type NavItem } from "./nav";
import { switchBranchAction } from "./shell-actions";
import { OfflineBanner, SignOutButton } from "@/components/offline";
import { OutboxSync } from "@/components/outbox-sync";
import { SwRegister } from "@/components/sw-register";

// Every screen here is per-user, per-request data; opt out of instant-navigation validation.
export const instant = false;

const NAV: (NavItem & { perm?: Permission; feature?: Feature })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/queue", label: "Queue", icon: "ListOrdered", perm: "queue.manage" },
  { href: "/appointments", label: "Appointments", icon: "CalendarDays", perm: "appointments.manage" },
  { href: "/patients", label: "Patients", icon: "Users", perm: "patients.read" },
  { href: "/visits", label: "Consultations", icon: "Stethoscope", perm: "clinical.read" },
  { href: "/lab", label: "Lab & imaging", icon: "FlaskConical", perm: "lab.result", feature: "lab" },
  { href: "/pharmacy", label: "Pharmacy", icon: "Pill", perm: "dispense", feature: "dispensary" },
  { href: "/billing", label: "Billing", icon: "CreditCard", perm: "billing.read" },
  { href: "/insurance", label: "Insurance", icon: "ShieldCheck", perm: "insurance.manage", feature: "insurance" },
  { href: "/care", label: "Chronic care", icon: "HeartPulse", perm: "clinical.read" },
  { href: "/messages", label: "Messages", icon: "MessageSquare", perm: "messaging.send" },
  { href: "/reports", label: "Reports", icon: "BarChart3", perm: "reports.view" },
  { href: "/settings", label: "Settings", icon: "Settings", perm: "settings.manage" },
];

async function SessionNav() {
  const ctx = await requireCtx();
  const items = NAV.filter((n) => (!n.perm || can(ctx.user.role, n.perm)) && (!n.feature || hasFeature(ctx.tenant, n.feature)))
    .map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <Nav items={items} footer={
      <div className="space-y-2 text-sm">
        {ctx.branches.length > 1 && (
          <form action={switchBranchAction}>
            <select name="branchId" defaultValue={ctx.branchId} className="w-full rounded-md border-slate-300 py-1 text-sm ring-1 ring-slate-300">
              {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button className="mt-1 w-full rounded bg-slate-100 py-1 text-xs text-slate-700 hover:bg-slate-200">Switch branch</button>
          </form>
        )}
        <div>
          <div className="truncate font-medium text-slate-900">{ctx.user.name}</div>
          <div className="truncate text-xs text-slate-500">{ROLE_LABELS[ctx.user.role]} · {ctx.tenant.name}</div>
        </div>
        <div className="flex gap-3 text-xs">
          <Link href="/account" className="text-slate-600 hover:text-slate-900">My account</Link>
          <SignOutButton action={logoutAction} />
        </div>
      </div>
    } />
  );
}

async function Banners() {
  const ctx = await requireCtx();
  const trialDays = trialDaysLeft(ctx.tenant);
  return (
    <>
      {ctx.access === "read_only" && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 print:hidden">
          This account is read-only because the subscription is unpaid. Your data is safe and exportable. <Link href="/settings/subscription" className="font-semibold underline">Renew</Link>
        </div>
      )}
      {trialDays !== null && trialDays <= 7 && ctx.access === "full" && (
        <div className="bg-teal-50 px-4 py-2 text-center text-sm text-teal-900 print:hidden">
          {trialDays > 0 ? `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial.` : "Your trial has ended."}{" "}
          {can(ctx.user.role, "settings.manage") && <Link href="/settings/subscription" className="font-semibold underline">Choose a plan</Link>}
        </div>
      )}
      {ctx.user.role === "owner" && !ctx.user.totpEnabled && (
        <div className="bg-slate-100 px-4 py-1.5 text-center text-xs text-slate-700 print:hidden">
          Protect patient data: <Link href="/account" className="font-semibold underline">turn on two-factor authentication</Link> for your owner account.
        </div>
      )}
    </>
  );
}

const PageFallback = <div className="animate-pulse space-y-3"><div className="h-7 w-48 rounded bg-slate-200" /><div className="h-40 rounded-lg bg-slate-200" /></div>;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <Suspense fallback={<aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white lg:block" />}>
        <SessionNav />
      </Suspense>
      <div className="lg:pl-60">
        <OfflineBanner />
        <SwRegister />
        <OutboxSync />
        <Suspense fallback={null}><Banners /></Suspense>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 print:max-w-none print:p-0">
          <Suspense fallback={PageFallback}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
