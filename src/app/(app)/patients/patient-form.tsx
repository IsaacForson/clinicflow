import { BellRing, ContactRound, IdCard, NotebookPen, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input, Panel, Select, Textarea } from "@/components/ui";
import type { Patient } from "@/db/schema";
import type { ActionState } from "@/lib/action";

const STEPS = [
  { id: "identity", label: "Identity", icon: <IdCard /> },
  { id: "contact", label: "Contact", icon: <ContactRound /> },
  { id: "insurance", label: "Insurance", icon: <ShieldCheck /> },
  { id: "preferences", label: "Preferences", icon: <BellRing /> },
  { id: "notes", label: "Notes", icon: <NotebookPen /> },
];

function Step({ n, children, hint }: { n: number; children: ReactNode; hint: string }) {
  const s = STEPS[n];
  return (
    <div id={s.id} className="scroll-mt-24">
      <Panel eyebrow={`Step ${n + 1} of ${STEPS.length}`} title={s.label} icon={s.icon}
        actions={<span className="hidden text-xs text-subtle sm:block">{hint}</span>}>
        {children}
      </Panel>
    </div>
  );
}

export function PatientForm({ action, patient, insurers, redirectTo }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  patient?: Patient; insurers: { id: string; name: string }[]; redirectTo: string;
}) {
  const p = patient;
  return (
    <ActionForm action={action} onSuccessHref={redirectTo}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Step n={0} hint="Name is all you need to start">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name"><Input name="firstName" defaultValue={p?.firstName} required autoFocus={!p} /></Field>
              <Field label="Other names"><Input name="otherNames" defaultValue={p?.otherNames ?? ""} /></Field>
              <Field label="Last name"><Input name="lastName" defaultValue={p?.lastName} required /></Field>
              <Field label="Sex">
                <Select name="sex" defaultValue={p?.sex ?? "unknown"}>
                  <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="unknown">Unknown</option>
                </Select>
              </Field>
              <Field label="Date of birth"><Input name="dob" type="date" defaultValue={p?.dob ?? ""} /></Field>
              <Field label="Blood group">
                <Select name="bloodGroup" defaultValue={p?.bloodGroup ?? ""}>
                  <option value="">—</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}
                </Select>
              </Field>
              <Field label="National ID / Ghana Card / NIN" hint="Stored encrypted" className="sm:col-span-2"><Input name="nationalId" defaultValue={p?.nationalId ?? ""} /></Field>
              <Field label="Occupation"><Input name="occupation" defaultValue={p?.occupation ?? ""} /></Field>
            </div>
          </Step>

          <Step n={1} hint="Used for reminders and results">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Phone"><Input name="phone" type="tel" defaultValue={p?.phone ?? ""} /></Field>
              <Field label="Alternative phone"><Input name="altPhone" type="tel" defaultValue={p?.altPhone ?? ""} /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={p?.email ?? ""} /></Field>
              <Field label="Address" className="sm:col-span-3"><Input name="address" defaultValue={p?.address ?? ""} /></Field>
              <Field label="Emergency contact name"><Input name="emergencyName" defaultValue={p?.emergencyName ?? ""} /></Field>
              <Field label="Emergency contact phone"><Input name="emergencyPhone" type="tel" defaultValue={p?.emergencyPhone ?? ""} /></Field>
            </div>
          </Step>

          <Step n={2} hint="Leave empty for self-pay">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Insurer">
                <Select name="insurerId" defaultValue={p?.insurerId ?? ""}>
                  <option value="">None (self-pay)</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              </Field>
              <Field label="Member number"><Input name="memberNo" defaultValue={p?.memberNo ?? ""} /></Field>
              <Field label="Cover expires"><Input name="insuranceExpiry" type="date" defaultValue={p?.insuranceExpiry ?? ""} /></Field>
            </div>
          </Step>

          <Step n={3} hint="How we reach them">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Preferred messages">
                <Select name="preferredChannel" defaultValue={p?.preferredChannel ?? "whatsapp"}>
                  <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option>
                </Select>
              </Field>
              <Field label="Language">
                <Select name="language" defaultValue={p?.language ?? "en"}>
                  <option value="en">English</option><option value="fr">French</option><option value="tw">Twi</option><option value="ha">Hausa</option><option value="yo">Yoruba</option><option value="sw">Swahili</option>
                </Select>
              </Field>
              <Field label="How did they hear about us?"><Input name="referralSource" defaultValue={p?.referralSource ?? ""} placeholder="Referral, Google, sign…" /></Field>
            </div>
            {!p && (
              <fieldset className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
                <legend className="px-1 text-xs font-medium text-muted">Agrees to appointment reminders &amp; results messages?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[["yes", "Yes, they agree", true], ["no", "No messages", false]].map(([v, l, d]) => (
                    <label key={String(v)} className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-fg transition hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                      <input type="radio" name="consentMessaging" value={String(v)} defaultChecked={Boolean(d)} className="accent-[var(--accent)]" /> {l}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </Step>

          <Step n={4} hint="Stored encrypted">
            <Field label="Notes" hint="Visible to staff with patient access"><Textarea name="notes" rows={4} defaultValue={p?.notes ?? ""} /></Field>
          </Step>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="glass ring-aurora space-y-5 p-5 animate-rise">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{p ? "Editing" : "New record"}</div>
              <div className="mt-1 text-[15px] font-semibold text-fg">{p ? `${p.firstName} ${p.lastName}` : "Patient registration"}</div>
              {p && <div className="font-mono text-xs text-muted">{p.patientNo}</div>}
            </div>
            <nav aria-label="Form sections" className="hidden lg:block">
              <ol className="relative space-y-1 before:absolute before:inset-y-3 before:left-[17px] before:w-px before:bg-line">
                {STEPS.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="relative flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
                      <span className="grid h-5 w-5 place-items-center rounded-full border border-line-strong bg-solid text-[10px] font-semibold tabular-nums text-accent">{i + 1}</span>
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            {!p && (
              <label className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
                <input type="checkbox" name="force" value="1" className="mt-0.5 accent-[var(--accent)]" />
                <span>Create anyway — I checked, this is not a duplicate.</span>
              </label>
            )}
            <Submit size="lg" className="w-full">{p ? "Save changes" : "Register patient"}</Submit>
            <p className="text-[11px] text-subtle">Only first and last name are required. Everything else can be added later.</p>
          </div>
        </aside>
      </div>
    </ActionForm>
  );
}
