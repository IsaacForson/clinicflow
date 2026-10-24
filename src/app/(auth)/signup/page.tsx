import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input, Select } from "@/components/ui";
import { COUNTRIES } from "@/lib/provision";
import { signupAction } from "../actions";

export const metadata = { title: "Start your trial" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Start your 14-day free trial</h1>
      <p className="mb-4 text-sm text-slate-600">No card needed. Reminders, backups and data export are always included.</p>
      <ActionForm action={signupAction}>
        <Field label="Clinic name"><Input name="clinicName" required /></Field>
        <Field label="Your name"><Input name="ownerName" autoComplete="name" required /></Field>
        <Field label="Country">
          <Select name="country" defaultValue="GH">{Object.entries(COUNTRIES).map(([code, c]) => <option key={code} value={code}>{c.name}</option>)}</Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
          <Field label="Phone"><Input name="phone" type="tel" autoComplete="tel" required /></Field>
        </div>
        <Field label="Password" hint="At least 10 characters"><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" name="terms" className="mt-1" required />
          <span>I agree to the <Link href="/terms" className="text-teal-700 underline">terms</Link> and <Link href="/privacy" className="text-teal-700 underline">privacy policy</Link>, including the data processing agreement.</span>
        </label>
        <Submit className="w-full">Create clinic account</Submit>
      </ActionForm>
      <p className="mt-4 text-center text-sm text-slate-600">Already have an account? <Link href="/login" className="font-medium text-teal-700">Sign in</Link></p>
    </>
  );
}
