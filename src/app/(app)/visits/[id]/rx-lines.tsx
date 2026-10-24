"use client";
import { Plus, Star } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

/** Repeating drug lines for the prescription form; names drugName_0, dose_0, … */
export function RxLines({ drugs }: { drugs: { label: string; favorite: boolean }[] }) {
  const [n, setN] = useState(1);
  return (
    <div className="space-y-2">
      <datalist id="rx-drugs">{drugs.map((d) => <option key={d.label} value={d.label}>{d.favorite ? "★" : ""}</option>)}</datalist>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent/15 text-[11px] font-semibold tabular-nums text-accent" aria-hidden>{i + 1}</span>
            <Input name={`drugName_${i}`} list="rx-drugs" placeholder="Drug" required={i === 0} autoComplete="off" aria-label={`Drug ${i + 1}`} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Input name={`dose_${i}`} placeholder="Dose (500mg)" aria-label="Dose" />
            <Input name={`route_${i}`} placeholder="Route (PO)" aria-label="Route" />
            <Input name={`frequency_${i}`} placeholder="Freq (tds)" aria-label="Frequency" />
            <Input name={`duration_${i}`} placeholder="Duration (5/7)" aria-label="Duration" />
            <Input name={`quantity_${i}`} type="number" min={1} defaultValue={1} placeholder="Qty" aria-label="Quantity" />
          </div>
          <Input name={`instructions_${i}`} placeholder="Instructions (after meals)" aria-label="Instructions" />
        </div>
      ))}
      <div className="flex items-center justify-between">
        {n < 30 && <Button type="button" variant="ghost" size="sm" onClick={() => setN(n + 1)}><Plus className="h-3.5 w-3.5" aria-hidden />Add drug</Button>}
        {drugs.some((d) => d.favorite) && <span className="inline-flex items-center gap-1 text-[11px] text-subtle"><Star className="h-3 w-3" aria-hidden />favourites listed first</span>}
      </div>
    </div>
  );
}
