"use client";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

/** Repeating drug lines for the prescription form; names drugName_0, dose_0, … */
export function RxLines({ drugs }: { drugs: { label: string; favorite: boolean }[] }) {
  const [n, setN] = useState(1);
  return (
    <div className="space-y-2">
      <datalist id="rx-drugs">{drugs.map((d) => <option key={d.label} value={d.label}>{d.favorite ? "★" : ""}</option>)}</datalist>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-6">
          <Input name={`drugName_${i}`} list="rx-drugs" placeholder="Drug" required={i === 0} className="col-span-2" autoComplete="off" />
          <Input name={`dose_${i}`} placeholder="Dose (500mg)" />
          <Input name={`route_${i}`} placeholder="Route (PO)" />
          <Input name={`frequency_${i}`} placeholder="Freq (tds)" />
          <Input name={`duration_${i}`} placeholder="Duration (5/7)" />
          <Input name={`quantity_${i}`} type="number" min={1} defaultValue={1} placeholder="Qty" aria-label="Quantity" />
          <Input name={`instructions_${i}`} placeholder="Instructions (after meals)" className="col-span-2 sm:col-span-5" />
        </div>
      ))}
      {n < 30 && <Button type="button" variant="ghost" className="text-xs" onClick={() => setN(n + 1)}>+ Add drug</Button>}
    </div>
  );
}
