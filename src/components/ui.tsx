/**
 * ClinicFlow "Aurora OS" component library. Screens compose these; they never hardcode palette colors.
 * Tokens: bg-canvas / bg-surface(-2,-3) / bg-solid / border-line(-strong) / text-fg / text-muted / text-subtle /
 * text-accent / text-accent-2 / ok / warn / bad / info (use /10../20 opacity for soft fills), utilities: glass, bg-aurora, text-aurora, ring-aurora.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Buttons ----------
const btn = {
  primary: "bg-aurora text-on-accent shadow-glow hover:brightness-110 hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:shadow-none",
  secondary: "bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong",
  danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
  ghost: "text-muted hover:text-fg hover:bg-surface-2",
};
const sizes = { sm: "h-8 px-3 text-xs rounded-lg gap-1.5", md: "h-10 px-4 text-sm rounded-xl gap-2", lg: "h-12 px-6 text-[15px] rounded-2xl gap-2" };
const btnBase = "inline-flex items-center justify-center font-medium whitespace-nowrap transition duration-200 disabled:cursor-not-allowed select-none";
export type BtnVariant = keyof typeof btn;
type BtnProps = { variant?: BtnVariant; size?: keyof typeof sizes };

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & BtnProps) {
  return <button className={cx(btnBase, sizes[size], btn[variant], className)} {...p} />;
}
export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & BtnProps) {
  return <Link className={cx(btnBase, sizes[size], btn[variant], className)} {...p} />;
}
export function IconButton({ label, className, ...p }: ComponentProps<"button"> & { label: string }) {
  return <button aria-label={label} title={label} className={cx("grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:bg-surface-3 hover:text-fg", className)} {...p} />;
}

// ---------- Form controls ----------
const control = "block w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-fg placeholder:text-subtle transition outline-none hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:opacity-50";
export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cx(control, "h-10", className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => <textarea rows={3} className={cx(control, "py-2.5 leading-relaxed", className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cx(control, "h-10 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239aa0bb%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]", className)} {...p} />;

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-xs font-medium tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-subtle">{hint}</span>}
    </label>
  );
}

export function Check({ label, className, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm text-fg", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line-strong bg-surface-2 accent-[var(--accent)]" {...p} />
      {label}
    </label>
  );
}

// ---------- Surfaces ----------
/** Glass panel with optional header (eyebrow/icon/title/actions). The base building block of every screen. */
export function Panel({ title, eyebrow, icon, actions, children, className, bodyClassName, glow }: {
  title?: ReactNode; eyebrow?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; glow?: boolean;
}) {
  return (
    <section className={cx("glass animate-rise overflow-hidden", glow && "ring-aurora", className)}>
      {(title || actions || eyebrow) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <IconTile>{icon}</IconTile>}
            <div className="min-w-0">
              {eyebrow && <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{eyebrow}</div>}
              {title && <h2 className="truncate text-[15px] font-semibold tracking-tight text-fg">{title}</h2>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
/** Back-compat alias used across screens. */
export const Card = Panel;

export function IconTile({ children, tone = "accent", className }: { children: ReactNode; tone?: Tone | "accent"; className?: string }) {
  const t = tone === "accent" ? "bg-accent/15 text-accent border-accent/25" : TONE[tone].tile;
  return <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl border [&>svg]:h-[18px] [&>svg]:w-[18px]", t, className)} aria-hidden>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, eyebrow, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="flex min-w-0 items-center gap-4">
        {icon && <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-aurora text-on-accent shadow-glow [&>svg]:h-6 [&>svg]:w-6" aria-hidden>{icon}</span>}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</div>}
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Filter / action strip above lists. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

// ---------- Status ----------
const TONE = {
  gray: { soft: "bg-surface-3 text-muted", dot: "bg-subtle", tile: "bg-surface-3 text-muted border-line" },
  green: { soft: "bg-ok/12 text-ok", dot: "bg-ok", tile: "bg-ok/12 text-ok border-ok/25" },
  yellow: { soft: "bg-warn/12 text-warn", dot: "bg-warn", tile: "bg-warn/12 text-warn border-warn/25" },
  red: { soft: "bg-bad/12 text-bad", dot: "bg-bad", tile: "bg-bad/12 text-bad border-bad/25" },
  blue: { soft: "bg-info/12 text-info", dot: "bg-info", tile: "bg-info/12 text-info border-info/25" },
  teal: { soft: "bg-accent-2/12 text-accent-2", dot: "bg-accent-2", tile: "bg-accent-2/12 text-accent-2 border-accent-2/25" },
  purple: { soft: "bg-accent/12 text-accent", dot: "bg-accent", tile: "bg-accent/12 text-accent border-accent/25" },
} as const;
export type Tone = keyof typeof TONE;

export function Badge({ tone = "gray", children, pulse }: { tone?: Tone; children: ReactNode; pulse?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium capitalize leading-none", TONE[tone].soft)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", TONE[tone].dot, pulse && "animate-pulse-ring")} aria-hidden />
      {children}
    </span>
  );
}

export function StatusDot({ tone = "green", pulse = true, label }: { tone?: Tone; pulse?: boolean; label?: string }) {
  return <span role={label ? "img" : undefined} aria-label={label} className={cx("inline-block h-2 w-2 rounded-full", TONE[tone].dot, pulse && "animate-pulse-ring", TONE[tone].soft.split(" ")[1])} />;
}

export function Callout({ tone = "purple", icon, children, actions }: { tone?: Tone; icon?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div role="status" className={cx("flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm animate-rise", TONE[tone].tile)}>
      {icon && <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden>{icon}</span>}
      <div className="min-w-0 flex-1 text-fg">{children}</div>
      {actions}
    </div>
  );
}

// ---------- Data display ----------
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-5 pb-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-surface-2">{children}</tbody>
      </table>
      {rows.length === 0 && <EmptyState title={empty ?? "Nothing here yet"} compact />}
    </div>
  );
}
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cx("whitespace-nowrap px-5 py-3.5 text-fg", className)} {...p} />;

/** KPI tile with optional icon, delta and sparkline. */
export function Kpi({ label, value, sub, icon, trend, delta, tone = "purple", href }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; trend?: number[]; delta?: { value: string; good: boolean }; tone?: Tone; href?: string;
}) {
  const body = (
    <div className="glass group relative h-full overflow-hidden p-5 transition hover:border-line-strong animate-rise">
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-aurora opacity-[0.12] blur-3xl transition duration-500 group-hover:opacity-25" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</span>
        {icon && <IconTile tone={tone} className="h-8 w-8">{icon}</IconTile>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-fg tabular-nums">{value}</div>
        {trend && trend.length > 1 && <Sparkline values={trend} className="h-9 w-24" />}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        {delta && <span className={cx("rounded-md px-1.5 py-0.5 font-medium", delta.good ? "bg-ok/12 text-ok" : "bg-bad/12 text-bad")}>{delta.value}</span>}
        {sub}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-[1.25rem]">{body}</Link> : body;
}
/** Back-compat: simple stat tile. */
export const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => <Kpi label={label} value={value} sub={sub} />;

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 28 - 1}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="spk" x1="0" x2="1"><stop offset="0" stopColor="var(--accent-2)" /><stop offset="1" stopColor="var(--accent)" /></linearGradient>
        <linearGradient id="spkf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient>
      </defs>
      <polygon points={`0,30 ${pts} 100,30`} fill="url(#spkf)" />
      <polyline points={pts} fill="none" stroke="url(#spk)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Vertical bar chart (inline SVG, no library). */
export function BarChart({ data, format, height = 160 }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${format ? format(d.value) : d.value}`).join(", ")}>
      {data.map((d, i) => (
        <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <div className="relative w-full flex-1">
            <div className="absolute inset-x-0 bottom-0 rounded-t-md bg-gradient-to-t from-accent/50 to-accent-2/90 transition group-hover:brightness-125" style={{ height: `${Math.max((d.value / max) * 100, d.value ? 3 : 0)}%` }} />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-solid px-1.5 py-0.5 text-[10px] text-fg shadow-panel group-hover:block">{format ? format(d.value) : d.value}</span>
          </div>
          <span className="text-[10px] text-subtle">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "purple", className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full", tone === "purple" ? "bg-aurora" : TONE[tone].dot)} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </div>
  );
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name.replace(/^(dr|prof|mr|mrs|ms|nurse)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  const s = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-lg" }[size];
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-canvas", s, className)}
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 85% 62%), hsl(${(hue + 60) % 360} 80% 52%))` }} aria-hidden>{initials}</span>
  );
}

export function ListRow({ title, meta, leading, trailing, href }: { title: ReactNode; meta?: ReactNode; leading?: ReactNode; trailing?: ReactNode; href?: string }) {
  const inner = (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{title}</div>
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
      </div>
      {trailing}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function EmptyState({ title, children, icon, compact }: { title: ReactNode; children?: ReactNode; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center text-center", compact ? "gap-2 py-10" : "gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-14")}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-accent [&>svg]:h-5 [&>svg]:w-5" aria-hidden>
        {icon ?? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" /></svg>}
      </span>
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}
/** Back-compat alias. */
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <EmptyState title={title}>{children}</EmptyState>;

/** Segmented control made of links (tabs/sub-navigation/filters). */
export function Tabs({ tabs, current }: { tabs: { href: string; label: ReactNode; key: string; count?: number }[]; current: string }) {
  return (
    <nav className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}
          className={cx("inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition", t.key === current ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:text-fg")}>
          {t.label}
          {t.count !== undefined && <span className={cx("rounded-md px-1.5 text-[10px] tabular-nums", t.key === current ? "bg-accent/20 text-accent" : "bg-surface-3 text-subtle")}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
export const Segmented = Tabs;

export function Dl({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-8 gap-y-4 text-sm", cols === 1 ? "grid-cols-1" : cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">{k}</dt>
          <dd className="mt-1 truncate font-medium text-fg">{v || <span className="text-subtle">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}

export function Timeline({ items }: { items: { id: string; title: ReactNode; meta?: ReactNode; body?: ReactNode; tone?: Tone; href?: string }[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:inset-y-1 before:left-[7px] before:w-px before:bg-line">
      {items.map((i) => (
        <li key={i.id} className="relative pl-7">
          <span className={cx("absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-2 border-canvas", TONE[i.tone ?? "purple"].dot)} aria-hidden />
          {i.href ? <Link href={i.href} className="text-sm font-medium text-fg hover:text-accent">{i.title}</Link> : <div className="text-sm font-medium text-fg">{i.title}</div>}
          {i.meta && <div className="text-xs text-muted">{i.meta}</div>}
          {i.body && <div className="mt-1.5 text-sm text-muted">{i.body}</div>}
        </li>
      ))}
    </ol>
  );
}

/** Link styled in the accent color (inline text links in tables, etc.). */
export const A = ({ className, ...p }: ComponentProps<typeof Link>) => <Link className={cx("font-medium text-accent hover:underline underline-offset-4", className)} {...p} />;
