"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { cx, Field, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action";

const OUTCOMES = [
  { value: "paid", label: "Paid", hint: "final", on: "border-ok/40 bg-ok/12 text-ok" },
  { value: "partially_paid", label: "Part paid", hint: "more to come", on: "border-warn/40 bg-warn/12 text-warn" },
  { value: "rejected", label: "Rejected", hint: "nothing paid", on: "border-bad/40 bg-bad/12 text-bad" },
];

/** Settle one claim item: outcome segmented control, amount, reason and what to do with the unpaid part. */
export function SettleForm({ action, claimId, itemId, clientId, defaultAmount }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; claimId: string; itemId: string; clientId: string; defaultAmount: string;
}) {
  const [outcome, setOutcome] = useState("paid");
  return (
    <ActionForm action={action} className="space-y-3 rounded-2xl border border-line bg-surface p-3">
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Outcome">
        {OUTCOMES.map((o) => (
          <label key={o.value} className={cx("flex cursor-pointer flex-col items-center rounded-lg border px-1 py-1.5 text-xs font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            outcome === o.value ? o.on : "border-transparent text-muted hover:text-fg")}>
            <input type="radio" name="outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} className="sr-only" />
            {o.label}<span className="text-[10px] font-normal opacity-70">{o.hint}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
        <Field label="Amount paid"><Input name="amount" inputMode="decimal" defaultValue={defaultAmount} className="h-9 tabular-nums" /></Field>
        <Field label="Reason"><Input name="reason" placeholder="Rejection / shortfall" className="h-9" /></Field>
      </div>
      <Field label="Unpaid part">
        <Select name="shortfall" defaultValue="later" className="h-9 text-xs" aria-label="Unpaid part">
          <option value="later">Decide later</option>
          <option value="bill_patient">Move to patient&apos;s bill</option>
          <option value="write_off">Write off (clinic absorbs)</option>
        </Select>
      </Field>
      <Submit size="sm" variant={outcome === "rejected" ? "danger" : "secondary"} className="w-full">Record outcome</Submit>
    </ActionForm>
  );
}
