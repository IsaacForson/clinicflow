"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { money } from "@/lib/format";
import { METHOD_LABEL } from "./methods";

/** Payment / deposit form. clientId is fresh per server render so a double submit records one payment. */
export function PaymentForm({ action, patientId, invoiceId, balanceMinor, creditMinor = 0, currency, clientId, methods, submitLabel = "Record payment", onSuccessHref }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; patientId: string; invoiceId?: string; balanceMinor?: number;
  creditMinor?: number; currency: string; clientId: string; methods: string[]; submitLabel?: string; onSuccessHref?: string;
}) {
  const [method, setMethod] = useState(methods[0]);
  const [amount, setAmount] = useState(balanceMinor ? (balanceMinor / 100).toFixed(2) : "");
  const [tendered, setTendered] = useState("");
  const change = Math.round(Number(tendered || 0) * 100) - Math.round(Number(amount || 0) * 100);
  return (
    <ActionForm action={action} onSuccessHref={onSuccessHref}>
      <input type="hidden" name="patientId" value={patientId} />
      {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}
      <input type="hidden" name="clientId" value={clientId} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Method">
        {methods.map((m) => (
          <label key={m} className={`cursor-pointer rounded-md px-3 py-2 text-sm ring-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600 ${m === method ? "bg-brand-700 text-white ring-brand-700" : "bg-white text-slate-700 ring-slate-300"}`}>
            <input type="radio" name="method" value={m} checked={m === method} onChange={() => setMethod(m)} className="sr-only" />
            {METHOD_LABEL[m]}
          </label>
        ))}
      </div>
      {method === "deposit" && <p className="text-sm text-slate-600">Available credit: {money(creditMinor, currency)}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount"><Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        {method === "cash" && (
          <Field label="Cash tendered"><Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="optional" /></Field>
        )}
        {["mobile_money", "card", "bank", "insurance"].includes(method) && (
          <Field label={method === "mobile_money" ? "MoMo reference" : "Reference"}><Input name="reference" required={method === "mobile_money"} /></Field>
        )}
      </div>
      {method === "cash" && tendered && (
        <p className={`text-lg font-semibold ${change < 0 ? "text-red-700" : "text-emerald-700"}`}>
          {change < 0 ? `Short by ${money(-change, currency)}` : `Change due: ${money(change, currency)}`}
        </p>
      )}
      <Submit className="px-5 py-2.5 text-base">{submitLabel}</Submit>
    </ActionForm>
  );
}
