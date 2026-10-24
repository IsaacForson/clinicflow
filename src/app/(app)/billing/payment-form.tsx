"use client";
import { Wallet } from "lucide-react";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { cx, Field, Input } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { money } from "@/lib/format";
import { METHOD_ICON, METHOD_LABEL } from "./methods";


/** Payment / deposit form. clientId is fresh per server render so a double submit records one payment. */
export function PaymentForm({ action, patientId, invoiceId, balanceMinor, creditMinor = 0, currency, clientId, methods, submitLabel = "Record payment", onSuccessHref }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; patientId: string; invoiceId?: string; balanceMinor?: number;
  creditMinor?: number; currency: string; clientId: string; methods: string[]; submitLabel?: string; onSuccessHref?: string;
}) {
  const [method, setMethod] = useState(methods[0]);
  const [amount, setAmount] = useState(balanceMinor ? (balanceMinor / 100).toFixed(2) : "");
  const [tendered, setTendered] = useState("");
  const change = Math.round(Number(tendered || 0) * 100) - Math.round(Number(amount || 0) * 100);
  const amountMinor = Math.round(Number(amount || 0) * 100);
  // Quick tender suggestions: exact, then the next round notes above the amount.
  const quick = [...new Set([amountMinor, ...[1000, 2000, 5000, 10000, 20000].map((n) => Math.ceil(amountMinor / n) * n)])].filter((v) => v > 0).slice(0, 4);
  return (
    <ActionForm action={action} onSuccessHref={onSuccessHref} className="space-y-5">
      <input type="hidden" name="patientId" value={patientId} />
      {invoiceId && <input type="hidden" name="invoiceId" value={invoiceId} />}
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Method">
        {methods.map((m) => {
          const t = METHOD_ICON[m] ?? { icon: Wallet, short: METHOD_LABEL[m] };
          const on = m === method;
          return (
            <label key={m} title={METHOD_LABEL[m]} className={cx(
              "flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
              on ? "ring-aurora border-transparent bg-accent/15 text-fg shadow-glow" : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-fg",
            )}>
              <input type="radio" name="method" value={m} checked={on} onChange={() => setMethod(m)} className="sr-only" />
              <t.icon className={cx("h-5 w-5", on ? "text-accent" : "text-subtle")} aria-hidden />
              {t.short}
            </label>
          );
        })}
      </div>
      {method === "deposit" && (
        <p className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-3.5 py-2.5 text-sm text-fg">
          <Wallet className="h-4 w-4 text-ok" aria-hidden /> Available credit <strong className="tabular-nums">{money(creditMinor, currency)}</strong>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-subtle">{currency}</span>
            <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required className="h-14 pl-14 text-2xl font-semibold tabular-nums" />
          </div>
        </Field>
        {method === "cash" && (
          <Field label="Cash tendered" hint="Optional: works out the change">
            <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="0.00" className="h-14 text-xl tabular-nums" />
          </Field>
        )}
        {["mobile_money", "card", "bank", "insurance"].includes(method) && (
          <Field label={method === "mobile_money" ? "MoMo reference" : "Reference"} hint={method === "mobile_money" ? "Required: transaction ID from the SMS" : undefined}>
            <Input name="reference" required={method === "mobile_money"} className="h-14 font-mono" />
          </Field>
        )}
      </div>
      {method === "cash" && quick.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Tendered</span>
          {quick.map((v) => (
            <button key={v} type="button" onClick={() => setTendered((v / 100).toFixed(2))}
              className="h-9 rounded-xl border border-line bg-surface-2 px-3 text-xs font-medium tabular-nums text-fg transition hover:border-line-strong hover:bg-surface-3">
              {money(v, currency)}
            </button>
          ))}
        </div>
      )}
      {method === "cash" && tendered && (
        <div className={cx("flex items-center justify-between rounded-2xl border px-4 py-3", change < 0 ? "border-bad/30 bg-bad/10" : "border-ok/30 bg-ok/10")} role="status">
          <span className={cx("text-sm font-medium", change < 0 ? "text-bad" : "text-ok")}>{change < 0 ? "Short by" : "Change due"}</span>
          <span className="text-2xl font-semibold tabular-nums text-fg">{money(Math.abs(change), currency)}</span>
        </div>
      )}
      <div className="flex justify-end">
        <Submit size="lg" className="w-full sm:w-auto">{submitLabel}</Submit>
      </div>
    </ActionForm>
  );
}
