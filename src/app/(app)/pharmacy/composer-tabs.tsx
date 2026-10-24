"use client";
import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/** Pill tabs that switch between pre-rendered panels (panels stay mounted so half-filled forms survive a switch). */
export function ComposerTabs({ tabs }: { tabs: { key: string; label: ReactNode; content: ReactNode }[] }) {
  const [cur, setCur] = useState(tabs[0]?.key);
  return (
    <div>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === cur} onClick={() => setCur(t.key)}
            className={cx("inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition [&>svg]:h-4 [&>svg]:w-4",
              t.key === cur ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:text-fg")}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.key} role="tabpanel" hidden={t.key !== cur}>{t.content}</div>)}
    </div>
  );
}
