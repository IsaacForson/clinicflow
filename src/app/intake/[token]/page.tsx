import { and, eq } from "drizzle-orm";
import { Suspense } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { adminDb } from "@/db";
import { intakeForms, patients, tenants } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { submitIntakeAction } from "./actions";
import { SignaturePad } from "./signature-pad";

export const metadata = { title: "Registration form", robots: { index: false } };
export const instant = false;

export default function IntakePage({ params }: PageProps<"/intake/[token]">) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-slate-200" />}>
          <IntakeBody params={params} />
        </Suspense>
      </div>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </div>
  );
}

async function IntakeBody({ params }: { params: PageProps<"/intake/[token]">["params"] }) {
  const { token } = await params;
  const db = adminDb();
  const [f] = token.length >= 16 && token.length <= 100 ? await db.select().from(intakeForms).where(eq(intakeForms.tokenHash, sha256(token))).limit(1) : [];
  if (!f) return <Notice title="Link not found">Please check the link or ask the clinic to send a new one.</Notice>;
  const [tenant] = await db.select({ name: tenants.name, phone: tenants.phone }).from(tenants).where(eq(tenants.id, f.tenantId));
  if (f.status !== "sent") return <Notice title="Thank you!">Your form has been sent to {tenant?.name ?? "the clinic"}. You can close this page.</Notice>;
  if (f.expiresAt < new Date()) return <Notice title="This link has expired">Please ask {tenant?.name ?? "the clinic"}{tenant?.phone ? ` (${tenant.phone})` : ""} to send a new one.</Notice>;
  const [p] = f.patientId ? await db.select().from(patients).where(and(eq(patients.id, f.patientId), eq(patients.tenantId, f.tenantId))) : [];

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <h1 className="text-xl font-semibold text-slate-900">{tenant?.name}</h1>
      <p className="mb-6 text-sm text-slate-600">Registration form{p ? ` for ${p.firstName}` : ""}. It takes about 3 minutes. Your answers are kept confidential.</p>
      <ActionForm action={submitIntakeAction} className="space-y-6">
        <input type="hidden" name="token" value={token} />
        <section className="grid gap-3 sm:grid-cols-2">
          <h2 className="font-medium text-slate-800 sm:col-span-2">About you</h2>
          <Field label="First name"><Input name="firstName" defaultValue={p?.firstName} required autoComplete="given-name" /></Field>
          <Field label="Last name"><Input name="lastName" defaultValue={p?.lastName} required autoComplete="family-name" /></Field>
          <Field label="Other names"><Input name="otherNames" defaultValue={p?.otherNames ?? ""} /></Field>
          <Field label="Sex">
            <Select name="sex" defaultValue={p?.sex ?? "unknown"}>
              <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Prefer not to say</option>
            </Select>
          </Field>
          <Field label="Date of birth"><Input type="date" name="dob" defaultValue={p?.dob ?? ""} autoComplete="bday" /></Field>
          <Field label="Phone"><Input type="tel" name="phone" defaultValue={p?.phone ?? ""} autoComplete="tel" /></Field>
          <Field label="Email (optional)"><Input type="email" name="email" defaultValue={p?.email ?? ""} autoComplete="email" /></Field>
          <Field label="Occupation"><Input name="occupation" defaultValue={p?.occupation ?? ""} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={p?.address ?? ""} autoComplete="street-address" /></Field>
        </section>
        <section className="grid gap-3">
          <h2 className="font-medium text-slate-800">Your health</h2>
          <Field label="Allergies" hint="One per line, e.g. “Penicillin - rash”. Write “None” if you have none."><Textarea name="allergies" rows={3} maxLength={1000} /></Field>
          <Field label="Medicines you take now" hint="Include dose if you know it."><Textarea name="medications" rows={3} maxLength={2000} /></Field>
          <Field label="Medical history" hint="Conditions (e.g. diabetes, hypertension, asthma), operations, pregnancies."><Textarea name="history" rows={4} maxLength={3000} /></Field>
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <h2 className="font-medium text-slate-800 sm:col-span-2">Emergency contact</h2>
          <Field label="Name"><Input name="emergencyName" defaultValue={p?.emergencyName ?? ""} /></Field>
          <Field label="Phone"><Input type="tel" name="emergencyPhone" defaultValue={p?.emergencyPhone ?? ""} /></Field>
        </section>
        <section className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
          <h2 className="font-medium text-slate-800">Consent</h2>
          <label className="flex gap-3"><input type="checkbox" name="consentDataProcessing" defaultChecked className="mt-0.5 h-5 w-5 shrink-0" /> I agree that {tenant?.name} may store and use my health information to provide my care.</label>
          <label className="flex gap-3"><input type="checkbox" name="consentTreatment" defaultChecked className="mt-0.5 h-5 w-5 shrink-0" /> I consent to examination and treatment by the clinic&apos;s staff.</label>
          <label className="flex gap-3"><input type="checkbox" name="consentMessaging" defaultChecked className="mt-0.5 h-5 w-5 shrink-0" /> I agree to receive appointment reminders and results messages by WhatsApp/SMS. (Reply STOP anytime.)</label>
          <div>
            <div className="mb-1 font-medium text-slate-700">Signature</div>
            <SignaturePad name="signature" />
          </div>
        </section>
        <Submit className="w-full py-3 text-base">Send to clinic</Submit>
      </ActionForm>
    </div>
  );
}
