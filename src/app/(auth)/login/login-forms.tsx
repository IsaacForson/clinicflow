"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { loginAction, requestOtpAction, verifyOtpAction } from "../actions";

export function LoginForms() {
  const [mode, setMode] = useState<"password" | "otp">("password");
  return (
    <>
      <div className="mb-4 grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm">
        {(["password", "otp"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`rounded px-3 py-1.5 font-medium ${mode === m ? "bg-white shadow-sm" : "text-slate-600"}`}>
            {m === "password" ? "Password" : "Phone code"}
          </button>
        ))}
      </div>
      {mode === "password" ? (
        <ActionForm action={loginAction}>
          <Field label="Email or phone"><Input name="login" autoComplete="username" required /></Field>
          <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
          <Submit className="w-full">Sign in</Submit>
        </ActionForm>
      ) : <OtpForm />}
      <p className="mt-4 text-center text-sm text-slate-600">New clinic? <Link href="/signup" className="font-medium text-brand-700">Start a free 14-day trial</Link></p>
    </>
  );
}

function OtpForm() {
  const [sent, request] = useActionState(requestOtpAction, undefined);
  const [phone, setPhone] = useState("");
  return (
    <div className="space-y-3">
      <form action={request} className="space-y-3">
        <Field label="Phone number"><Input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" required /></Field>
        <Submit variant="secondary" className="w-full">Send code</Submit>
        {sent?.error && <p className="text-sm text-red-600">{sent.error}</p>}
        {sent?.message && <p className="text-sm text-emerald-700">{sent.message}</p>}
      </form>
      {sent?.ok && (
        <ActionForm action={verifyOtpAction}>
          <input type="hidden" name="phone" value={phone} />
          <Field label="6-digit code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></Field>
          <Submit className="w-full">Verify and sign in</Submit>
        </ActionForm>
      )}
    </div>
  );
}
