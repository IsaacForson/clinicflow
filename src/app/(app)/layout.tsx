import Link from "next/link";
import { Suspense } from "react";
import { requireCtx } from "@/lib/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { hasFeature, type Feature } from "@/lib/plans";
import { logoutAction } from "../(auth)/actions";
import { Nav, type NavItem } from "./nav";
import { switchBranchAction } from "./shell-actions";
import { OfflineBanner } from "@/components/offline";

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

async function Shell({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const items = NAV.filter((n) => (!n.perm || can(ctx.user.role, n.perm)) && (!n.feature || hasFeature(ctx.tenant, n.feature)))
    .map(({ href, label, icon }) => ({ href, label, icon }));
  const trialDays = ctx.tenant.planStatus === "trialing" && ctx.tenant.trialEndsAt
    ? Math.ceil((ctx.tenant.trialEndsAt.getTime() - Date.now()) / 86400_000) : null;
  return (
    <>
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
            <form action={logoutAction}><button className="text-slate-600 hover:text-slate-900">Sign out</button></form>
          </div>
        </div>
      } />
      <div className="lg:pl-60">
        <OfflineBanner />
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
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
        <Shell>{children}</Shell>
      </Suspense>
    </div>
  );
}
