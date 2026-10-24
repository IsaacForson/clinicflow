"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Button, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action";

/** Collapsed "Reverse" control: asks for a reason, offers a Paystack refund for online payments. */
export function ReversePayment({ action, paymentId, viaPaystack, label = "Reverse" }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; paymentId: string; viaPaystack: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-red-700 print:hidden" onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <ActionForm action={action} className="min-w-64 space-y-1.5 print:hidden">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="reason" placeholder="Reason (e.g. overcharged, duplicate)" required minLength={3} className="py-1 text-xs" autoFocus />
      {viaPaystack && <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" name="viaProvider" defaultChecked /> Refund the patient through Paystack</label>}
      <p className="text-xs text-slate-500">{viaPaystack ? "Untick if you already refunded outside Paystack." : "Hand the money back to the patient, then record it here."}</p>
      <div className="flex gap-1.5">
        <Submit variant="danger" className="px-2 py-1 text-xs">Confirm refund</Submit>
        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </ActionForm>
  );
}
