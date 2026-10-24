import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const btn = {
  primary: "text-white bg-gradient-to-br from-brand-500 via-brand-600 to-violet-600 shadow-glow hover:brightness-110 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:shadow-none",
  secondary: "bg-white/90 text-slate-800 shadow-sm ring-1 ring-slate-900/10 hover:bg-white hover:ring-slate-900/20",
  danger: "text-white bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_8px_24px_-8px_rgb(225_29_72/0.5)] hover:brightness-110",
  ghost: "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900",
};
const btnBase = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed";
export type BtnVariant = keyof typeof btn;

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant }) {
  return <button className={cx(btnBase, btn[variant], className)} {...p} />;
}
export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link className={cx(btnBase, btn[variant], className)} {...p} />;
}

const field = "block w-full rounded-xl border-0 bg-white/70 px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-inset ring-slate-900/10 placeholder:text-slate-400 transition focus:bg-white focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100/70 disabled:text-slate-500";
export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cx(field, className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => <textarea rows={3} className={cx(field, "leading-relaxed", className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cx(field, "pr-9", className)} {...p} />;

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("cf-card animate-fade-up", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5 pt-3">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  gray: ["bg-slate-500/10 text-slate-700", "bg-slate-400"],
  green: ["bg-emerald-500/10 text-emerald-700", "bg-emerald-500"],
  yellow: ["bg-amber-500/10 text-amber-800", "bg-amber-500"],
  red: ["bg-rose-500/10 text-rose-700", "bg-rose-500"],
  blue: ["bg-sky-500/10 text-sky-700", "bg-sky-500"],
  teal: ["bg-brand-500/10 text-brand-700", "bg-brand-500"],
  purple: ["bg-violet-500/10 text-violet-700", "bg-violet-500"],
} as const;
export type Tone = keyof typeof tones;
export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", tones[tone][0])}>
      <span className={cx("h-1.5 w-1.5 rounded-full", tones[tone][1])} aria-hidden />
      {children}
    </span>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-y border-slate-900/5 bg-slate-50/60">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900/5 [&>tr]:transition-colors [&>tr:hover]:bg-brand-50/50">{children}</tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-cyan-100 text-brand-600" aria-hidden>◌</span>
          {empty ?? "Nothing here yet."}
        </div>
      )}
    </div>
  );
}
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cx("whitespace-nowrap px-5 py-3 text-slate-700", className)} {...p} />;

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="cf-card group relative overflow-hidden p-5 animate-fade-up">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-brand-400/25 to-cyan-300/25 blur-2xl transition group-hover:scale-125" aria-hidden />
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-900/15 bg-white/50 p-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-900/[0.04] p-1 ring-1 ring-inset ring-slate-900/5">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={cx("whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition", t.key === current ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5" : "text-slate-500 hover:text-slate-900")}>{t.label}</Link>
      ))}
    </nav>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-slate-900/5 pb-2 sm:block sm:border-0 sm:pb-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className="font-medium text-slate-900 sm:mt-0.5">{v || <span className="text-slate-300">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
