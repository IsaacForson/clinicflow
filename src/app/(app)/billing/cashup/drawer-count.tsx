"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { cx, Field, Input, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { money } from "@/lib/format";

/** Counted-cash form with a live expected-vs-counted variance read-out. */
export function DrawerCount({ action, day, expectedMinor, currency }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; day: string; expectedMinor: number; currency: string;
}) {
  const [counted, setCounted] = useState("");
  const variance = Math.round(Number(counted || 0) * 100) - expectedMinor;
  const tone = !counted ? "idle" : variance === 0 ? "ok" : variance < 0 ? "bad" : "warn";
  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="day" value={day} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Expected</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-fg">{money(expectedMinor, currency)}</div>
        </div>
        <div className={cx("rounded-2xl border p-4 transition", {
          idle: "border-line bg-surface-2", ok: "border-ok/30 bg-ok/10", bad: "border-bad/30 bg-bad/10", warn: "border-warn/30 bg-warn/10",
        }[tone])} role="status">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Variance</div>
          <div className={cx("mt-1 text-xl font-semibold tabular-nums", { idle: "text-subtle", ok: "text-ok", bad: "text-bad", warn: "text-warn" }[tone])}>
            {counted ? `${variance > 0 ? "+" : variance < 0 ? "−" : ""}${money(Math.abs(variance), currency)}` : "—"}
          </div>
          <div className="text-[11px] text-muted">{{ idle: "Count to compare", ok: "Balanced", bad: "Drawer is short", warn: "Drawer is over" }[tone]}</div>
        </div>
      </div>
      <Field label="Counted cash">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-subtle">{currency}</span>
          <Input name="counted" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className="h-14 pl-14 text-2xl font-semibold tabular-nums" />
        </div>
      </Field>
      <Field label="Notes"><Textarea name="notes" placeholder="Explain any difference" /></Field>
      <Submit size="lg" className="w-full">Save cash-up</Submit>
    </ActionForm>
  );
}
