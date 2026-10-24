// Small presentational pieces shared by the front-desk screens (appointments + queue). Pure CSS, server-safe.
import type { ReactNode } from "react";
import { cx, IconTile } from "@/components/ui";

/** Checkbox rendered as a labelled switch row. Submits "on" like a plain checkbox. */
export function Toggle({ name, label, hint, icon, tone = "accent", defaultChecked }: {
  name: string; label: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "accent" | "warn" | "bad"; defaultChecked?: boolean;
}) {
  const on = { accent: "has-[:checked]:border-accent/40 has-[:checked]:bg-accent/10", warn: "has-[:checked]:border-warn/40 has-[:checked]:bg-warn/10", bad: "has-[:checked]:border-bad/40 has-[:checked]:bg-bad/10" }[tone];
  const track = { accent: "peer-checked:bg-aurora", warn: "peer-checked:bg-warn", bad: "peer-checked:bg-bad" }[tone];
  return (
    <label className={cx("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition hover:border-line-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent", on)}>
      {icon && <IconTile tone={tone === "accent" ? "accent" : tone === "warn" ? "yellow" : "red"}>{icon}</IconTile>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span aria-hidden className={cx(
        "relative h-6 w-10 shrink-0 rounded-full bg-surface-3 ring-1 ring-inset ring-line transition",
        "after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-muted after:transition",
        "peer-checked:ring-0 peer-checked:after:translate-x-4 peer-checked:after:bg-on-accent", track,
      )} />
    </label>
  );
}

/** Radio rendered as a selectable card/chip (practitioner cards, service chips). */
export function Choice({ name, value, defaultChecked, required, children, className }: {
  name: string; value: string; defaultChecked?: boolean; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <label className={cx(
      "relative flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface transition hover:-translate-y-px hover:border-line-strong",
      "has-[:checked]:border-accent/60 has-[:checked]:bg-accent/10 has-[:checked]:shadow-glow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
      className,
    )}>
      <input type="radio" name={name} value={value} defaultChecked={defaultChecked} required={required} className="peer sr-only" />
      {children}
    </label>
  );
}

/** Numbered section heading used inside long composers/forms. */
export function StepHeading({ n, title, hint }: { n: number | string; title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/12 font-mono text-xs font-semibold text-accent">{n}</span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}
