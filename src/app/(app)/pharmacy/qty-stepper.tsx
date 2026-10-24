"use client";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";

/** Number input with −/+ buttons; submits under `name` like a plain input. */
export function QtyStepper({ name, max, defaultValue, label }: { name: string; max: number; defaultValue: number; label: string }) {
  const [v, setV] = useState(defaultValue);
  const set = (n: number) => setV(Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), max));
  const b = "grid h-10 w-10 place-items-center text-muted transition hover:bg-surface-3 hover:text-fg disabled:opacity-30";
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-surface-2">
      <button type="button" className={b} onClick={() => set(v - 1)} disabled={v <= 0} aria-label={`Decrease ${label}`}><Minus className="h-4 w-4" /></button>
      <input name={name} type="number" min={0} max={max} value={v} onChange={(e) => set(Number(e.target.value))} aria-label={label}
        className="h-10 w-14 border-x border-line bg-transparent text-center text-sm font-semibold tabular-nums text-fg outline-none [appearance:textfield] focus:bg-surface-3 [&::-webkit-inner-spin-button]:appearance-none" />
      <button type="button" className={b} onClick={() => set(v + 1)} disabled={v >= max} aria-label={`Increase ${label}`}><Plus className="h-4 w-4" /></button>
    </div>
  );
}
