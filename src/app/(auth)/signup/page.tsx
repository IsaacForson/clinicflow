import { Check } from "lucide-react";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input, Select } from "@/components/ui";
import { COUNTRIES } from "@/lib/provision";
import { signupAction } from "../actions";

export const metadata = { title: "Start your trial" };

const PERKS = ["No card needed", "Reminders & backups included", "Export your data any time"];

export default function SignupPage() {
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-2">14-day free trial</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">Set up your clinic</h1>
      <ul className="mb-7 mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {PERKS.map((p) => <li key={p} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-ok" aria-hidden />{p}</li>)}
      </ul>
      <ActionForm action={signupAction} className="space-y-4">
        <Field label="Clinic name"><Input name="clinicName" placeholder="e.g. Grace Family Clinic" required autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name"><Input name="ownerName" autoComplete="name" placeholder="Dr. Ama Mensah" required /></Field>
          <Field label="Country">
            <Select name="country" defaultValue="GH">{Object.entries(COUNTRIES).map(([code, c]) => <option key={code} value={code}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Work email"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Phone"><Input name="phone" type="tel" autoComplete="tel" required /></Field>
        </div>
        <Field label="Password" hint="At least 10 characters"><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted">
          <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" required />
          <span>I agree to the <Link href="/terms" className="text-accent hover:underline">terms</Link> and <Link href="/privacy" className="text-accent hover:underline">privacy policy</Link>, including the data processing agreement.</span>
        </label>
        <Submit size="lg" className="w-full">Create my clinic</Submit>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-medium text-accent hover:underline underline-offset-4">Sign in</Link></p>
    </>
  );
}
