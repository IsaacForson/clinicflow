import { and, eq } from "drizzle-orm";
import { CircleCheck, Clock, Link as LinkIcon, Lock, Send } from "lucide-react";
import { Suspense } from "react";
import { LogoMark } from "@/app/(app)/nav";
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
    <main className="backdrop-os min-h-screen px-4 pb-16 pt-6 text-fg sm:pt-10">
      <div className="mx-auto max-w-2xl">
        <Suspense fallback={<div className="space-y-4" aria-busy="true"><div className="skeleton h-24" /><div className="skeleton h-96 rounded-[1.25rem]" /></div>}>
          <IntakeBody params={params} />
        </Suspense>
        <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-subtle"><Lock className="h-3 w-3" aria-hidden /> Secure form · powered by ClinicFlow</p>
      </div>
    </main>
  );
}

function Notice({ title, children, tone = "info" }: { title: string; children: React.ReactNode; tone?: "ok" | "info" | "warn" }) {
  const Icon = tone === "ok" ? CircleCheck : tone === "warn" ? Clock : LinkIcon;
  return (
    <div className="glass mt-10 flex flex-col items-center p-10 text-center animate-rise">
      <span className={tone === "ok" ? "grid h-16 w-16 place-items-center rounded-full bg-ok/15 text-ok shadow-glow" : tone === "warn" ? "grid h-16 w-16 place-items-center rounded-full bg-warn/15 text-warn" : "grid h-16 w-16 place-items-center rounded-full bg-accent/15 text-accent"}>
        <Icon className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{children}</p>
    </div>
  );
}

function FormSection({ id, n, title, hint, children }: { id: string; n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="glass scroll-mt-24 p-5 animate-rise sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-aurora font-mono text-sm font-semibold text-on-accent shadow-glow">{n}</span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

const STEPS = [["about", "About you"], ["health", "Health"], ["emergency", "Contact"], ["consent", "Consent"]] as const;

async function IntakeBody({ params }: { params: PageProps<"/intake/[token]">["params"] }) {
  const { token } = await params;
  const db = adminDb();
  const [f] = token.length >= 16 && token.length <= 100 ? await db.select().from(intakeForms).where(eq(intakeForms.tokenHash, sha256(token))).limit(1) : [];
  if (!f) return <Notice title="Link not found">Please check the link or ask the clinic to send a new one.</Notice>;
  const [tenant] = await db.select({ name: tenants.name, phone: tenants.phone }).from(tenants).where(eq(tenants.id, f.tenantId));
  if (f.status !== "sent") return <Notice tone="ok" title="Thank you!">Your form has been sent to {tenant?.name ?? "the clinic"}. You can close this page.</Notice>;
  if (f.expiresAt < new Date()) return <Notice tone="warn" title="This link has expired">Please ask {tenant?.name ?? "the clinic"}{tenant?.phone ? ` (${tenant.phone})` : ""} to send a new one.</Notice>;
  const [p] = f.patientId ? await db.select().from(patients).where(and(eq(patients.id, f.patientId), eq(patients.tenantId, f.tenantId))) : [];
  const consent = "flex cursor-pointer gap-3 rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed transition hover:border-line-strong has-[:checked]:border-accent/40 has-[:checked]:bg-accent/10";

  return (
    <>
      <header className="mb-6 flex items-center gap-4 animate-rise">
        <LogoMark className="h-12 w-12" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Registration form</div>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{tenant?.name}</h1>
        </div>
      </header>
      <p className="mb-5 text-sm text-muted">{p ? `Hi ${p.firstName}! ` : ""}This takes about 3 minutes. Your answers go straight to the clinic and are kept confidential.</p>

      {/* Step rail: jump links, sticky on scroll */}
      <nav aria-label="Form sections" className="sticky top-3 z-10 mb-6 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-solid/80 p-1 shadow-panel backdrop-blur-2xl">
        {STEPS.map(([id, label], i) => (
          <a key={id} href={`#${id}`} className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium text-muted transition hover:bg-surface-3 hover:text-fg sm:flex-row sm:justify-center sm:gap-2 sm:text-xs">
            <span className="grid h-5 w-5 place-items-center rounded-full border border-accent/40 bg-accent/12 font-mono text-[10px] text-accent">{i + 1}</span>{label}
          </a>
        ))}
      </nav>

      <ActionForm action={submitIntakeAction} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <FormSection id="about" n={1} title="About you" hint="As it appears on your ID.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><Input name="firstName" defaultValue={p?.firstName} required autoComplete="given-name" className="h-12 text-base" /></Field>
            <Field label="Last name"><Input name="lastName" defaultValue={p?.lastName} required autoComplete="family-name" className="h-12 text-base" /></Field>
            <Field label="Other names"><Input name="otherNames" defaultValue={p?.otherNames ?? ""} className="h-12 text-base" /></Field>
            <Field label="Sex">
              <Select name="sex" defaultValue={p?.sex ?? "unknown"} className="h-12 text-base">
                <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Prefer not to say</option>
              </Select>
            </Field>
            <Field label="Date of birth"><Input type="date" name="dob" defaultValue={p?.dob ?? ""} autoComplete="bday" className="h-12 text-base" /></Field>
            <Field label="Phone"><Input type="tel" name="phone" defaultValue={p?.phone ?? ""} autoComplete="tel" inputMode="tel" className="h-12 text-base" /></Field>
            <Field label="Email (optional)"><Input type="email" name="email" defaultValue={p?.email ?? ""} autoComplete="email" className="h-12 text-base" /></Field>
            <Field label="Occupation"><Input name="occupation" defaultValue={p?.occupation ?? ""} className="h-12 text-base" /></Field>
            <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={p?.address ?? ""} autoComplete="street-address" className="h-12 text-base" /></Field>
          </div>
        </FormSection>
        <FormSection id="health" n={2} title="Your health" hint="Helps your clinician keep you safe.">
          <div className="grid gap-4">
            <Field label="Allergies" hint="One per line, e.g. “Penicillin - rash”. Write “None” if you have none."><Textarea name="allergies" rows={3} maxLength={1000} className="text-base" /></Field>
            <Field label="Medicines you take now" hint="Include dose if you know it."><Textarea name="medications" rows={3} maxLength={2000} className="text-base" /></Field>
            <Field label="Medical history" hint="Conditions (e.g. diabetes, hypertension, asthma), operations, pregnancies."><Textarea name="history" rows={4} maxLength={3000} className="text-base" /></Field>
          </div>
        </FormSection>
        <FormSection id="emergency" n={3} title="Emergency contact" hint="Someone we can call if needed.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input name="emergencyName" defaultValue={p?.emergencyName ?? ""} className="h-12 text-base" /></Field>
            <Field label="Phone"><Input type="tel" name="emergencyPhone" defaultValue={p?.emergencyPhone ?? ""} inputMode="tel" className="h-12 text-base" /></Field>
          </div>
        </FormSection>
        <FormSection id="consent" n={4} title="Consent & signature">
          <div className="space-y-2.5">
            <label className={consent}><input type="checkbox" name="consentDataProcessing" defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" /> I agree that {tenant?.name} may store and use my health information to provide my care.</label>
            <label className={consent}><input type="checkbox" name="consentTreatment" defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" /> I consent to examination and treatment by the clinic&apos;s staff.</label>
            <label className={consent}><input type="checkbox" name="consentMessaging" defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" /> I agree to receive appointment reminders and results messages by WhatsApp/SMS. (Reply STOP anytime.)</label>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted">Signature</div>
            <SignaturePad name="signature" />
          </div>
        </FormSection>
        <Submit size="lg" className="h-14 w-full text-base"><Send className="h-4 w-4" aria-hidden /> Send to clinic</Submit>
      </ActionForm>
    </>
  );
}
