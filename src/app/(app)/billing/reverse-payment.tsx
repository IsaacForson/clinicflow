"use client";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Button, Check, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action";

/** Collapsed "Reverse" control: asks for a reason, offers a Paystack refund for online payments. */
export function ReversePayment({ action, paymentId, viaPaystack, label = "Reverse" }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; paymentId: string; viaPaystack: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button type="button" variant="ghost" size="sm" className="text-bad hover:text-bad print:hidden" onClick={() => setOpen(true)}><Undo2 className="h-3.5 w-3.5" aria-hidden />{label}</Button>;
  return (
    <ActionForm action={action} className="w-full min-w-64 space-y-2 rounded-xl border border-bad/30 bg-bad/5 p-3 print:hidden">
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input name="reason" placeholder="Reason (e.g. overcharged, duplicate)" required minLength={3} className="h-9 text-xs" autoFocus aria-label="Refund reason" />
      {viaPaystack && <Check name="viaProvider" defaultChecked label={<span className="text-xs text-muted">Refund the patient through Paystack</span>} />}
      <p className="text-xs text-subtle">{viaPaystack ? "Untick if you already refunded outside Paystack." : "Hand the money back to the patient, then record it here."}</p>
      <div className="flex gap-1.5">
        <Submit variant="danger" size="sm">Confirm refund</Submit>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </ActionForm>
  );
}
