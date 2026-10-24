"use client";
import {
  Activity, BarChart3, Building2, CalendarDays, ClipboardList, CreditCard, FlaskConical, HeartPulse, LayoutDashboard,
  ListOrdered, Menu, MessageSquare, Pill, Settings, ShieldCheck, Stethoscope, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";

export const ICONS = { LayoutDashboard, ListOrdered, CalendarDays, Users, Stethoscope, FlaskConical, Pill, CreditCard, ShieldCheck, MessageSquare, HeartPulse, BarChart3, Settings, Activity, ClipboardList, Building2 };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; group?: string };

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cx("relative grid place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-brand-500 to-violet-500 text-white shadow-glow", className ?? "h-8 w-8")} aria-hidden>
      <svg viewBox="0 0 64 64" className="h-1/2 w-1/2"><path fill="currentColor" d="M23 6h18v17h17v18H41v17H23V41H6V23h17z" /></svg>
    </span>
  );
}

/** Dark "command centre" sidebar. Groups render as small section labels. */
export function Nav({ items, footer, clinic }: { items: NavItem[]; footer: React.ReactNode; clinic: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  let lastGroup: string | undefined;
  const links = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const active = path === i.href || path.startsWith(i.href + "/");
        const label = i.group && i.group !== lastGroup ? i.group : null;
        lastGroup = i.group;
        return (
          <div key={i.href}>
            {label && <div className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>}
            <Link href={i.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
              className={cx("group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                active ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100")}>
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-cyan-400 to-brand-500" aria-hidden />}
              <Icon className={cx("h-[18px] w-[18px] shrink-0 transition", active ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300")} aria-hidden />
              {i.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"}
        className="fixed left-3 top-3 z-50 grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white shadow-lg lg:hidden print:hidden">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <aside className={cx("fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden bg-slate-950 text-slate-300 transition-transform duration-300 lg:translate-x-0 print:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden />
        <Link href="/dashboard" className="relative flex items-center gap-3 px-5 pb-2 pt-5">
          <LogoMark />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold tracking-tight text-white">ClinicFlow</span>
            <span className="block truncate text-xs text-slate-500">{clinic}</span>
          </span>
        </Link>
        <div className="relative flex min-h-0 flex-1 flex-col">{links}</div>
        <div className="relative border-t border-white/[0.06] p-3">{footer}</div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
