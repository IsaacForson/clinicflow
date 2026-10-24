"use client";
import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/** Tabbed side rail for the consultation workspace. All panes stay mounted (hidden) so half-filled forms survive tab switches. */
export function RailTabs({ tabs }: { tabs: { key: string; label: string; count?: number; content: ReactNode }[] }) {
  const [cur, setCur] = useState(tabs[0]?.key);
  return (
    <div className="glass animate-rise overflow-hidden">
      <div role="tablist" aria-label="Consultation tools" className="flex gap-1 overflow-x-auto border-b border-line p-1.5">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={cur === t.key} aria-controls={`pane-${t.key}`}
            onClick={() => setCur(t.key)}
            className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition",
              cur === t.key ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className={cx("rounded-md px-1.5 text-[10px] tabular-nums", cur === t.key ? "bg-accent/20 text-accent" : "bg-surface-3 text-subtle")}>{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`pane-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={cur !== t.key} className="p-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
