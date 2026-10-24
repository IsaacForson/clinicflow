"use client";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import { verify2faAction } from "../../actions";

export default function TwoFactorPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Two-factor authentication</h1>
      <p className="mb-4 text-sm text-slate-600">Enter the 6-digit code from your authenticator app.</p>
      <ActionForm action={verify2faAction}>
        <Field label="Code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required /></Field>
        <Submit className="w-full">Verify</Submit>
      </ActionForm>
    </>
  );
}
