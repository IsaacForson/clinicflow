"use client";
import {
  Activity, BarChart3, Building2, CalendarDays, ClipboardList, CreditCard, FlaskConical, HeartPulse, LayoutDashboard,
  ListOrdered, Menu, MessageSquare, Pill, Settings, ShieldCheck, Stethoscope, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";

const ICONS = { LayoutDashboard, ListOrdered, CalendarDays, Users, Stethoscope, FlaskConical, Pill, CreditCard, ShieldCheck, MessageSquare, HeartPulse, BarChart3, Settings, Activity, ClipboardList, Building2 };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function Nav({ items, footer }: { items: NavItem[]; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const links = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const active = path === i.href || path.startsWith(i.href + "/");
        return (
          <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
            className={cx("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium", active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 lg:hidden print:hidden">
        <span className="font-semibold text-teal-800">ClinicFlow</span>
        <button onClick={() => setOpen(!open)} aria-label="Menu" className="rounded p-1.5 hover:bg-slate-100">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 print:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <Link href="/dashboard" className="flex items-center gap-2 border-b border-slate-100 px-4 py-3.5 font-semibold text-teal-800">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-teal-700 text-sm text-white">C</span> ClinicFlow
        </Link>
        {links}
        <div className="border-t border-slate-100 p-3">{footer}</div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
