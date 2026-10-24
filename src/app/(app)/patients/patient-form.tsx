import { ActionForm, Submit } from "@/components/form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Patient } from "@/db/schema";
import type { ActionState } from "@/lib/action";

export function PatientForm({ action, patient, insurers, redirectTo }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  patient?: Patient; insurers: { id: string; name: string }[]; redirectTo: string;
}) {
  const p = patient;
  return (
    <ActionForm action={action} onSuccessHref={redirectTo}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
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
        <Field label="Phone"><Input name="phone" type="tel" defaultValue={p?.phone ?? ""} /></Field>
        <Field label="Alternative phone"><Input name="altPhone" type="tel" defaultValue={p?.altPhone ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={p?.email ?? ""} /></Field>
        <Field label="National ID / Ghana Card / NIN" hint="Stored encrypted"><Input name="nationalId" defaultValue={p?.nationalId ?? ""} /></Field>
        <Field label="Occupation"><Input name="occupation" defaultValue={p?.occupation ?? ""} /></Field>
        <Field label="How did they hear about us?"><Input name="referralSource" defaultValue={p?.referralSource ?? ""} placeholder="Referral, Google, sign…" /></Field>
        <Field label="Address" className="sm:col-span-3"><Input name="address" defaultValue={p?.address ?? ""} /></Field>
        <Field label="Emergency contact name"><Input name="emergencyName" defaultValue={p?.emergencyName ?? ""} /></Field>
        <Field label="Emergency contact phone"><Input name="emergencyPhone" type="tel" defaultValue={p?.emergencyPhone ?? ""} /></Field>
        <Field label="Preferred messages">
          <Select name="preferredChannel" defaultValue={p?.preferredChannel ?? "whatsapp"}>
            <option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option>
          </Select>
        </Field>
        <Field label="Insurer">
          <Select name="insurerId" defaultValue={p?.insurerId ?? ""}>
            <option value="">None (self-pay)</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field label="Member number"><Input name="memberNo" defaultValue={p?.memberNo ?? ""} /></Field>
        <Field label="Cover expires"><Input name="insuranceExpiry" type="date" defaultValue={p?.insuranceExpiry ?? ""} /></Field>
        <Field label="Language">
          <Select name="language" defaultValue={p?.language ?? "en"}>
            <option value="en">English</option><option value="fr">French</option><option value="tw">Twi</option><option value="ha">Hausa</option><option value="yo">Yoruba</option><option value="sw">Swahili</option>
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-3" hint="Stored encrypted"><Textarea name="notes" defaultValue={p?.notes ?? ""} /></Field>
      </div>
      {!p && (
        <div className="flex flex-wrap gap-4 rounded-md bg-slate-50 p-3 text-sm">
          <span className="font-medium text-slate-700">Agrees to appointment reminders &amp; results messages?</span>
          <label className="flex items-center gap-1"><input type="radio" name="consentMessaging" value="yes" defaultChecked /> Yes</label>
          <label className="flex items-center gap-1"><input type="radio" name="consentMessaging" value="no" /> No</label>
          <label className="ml-auto flex items-center gap-1 text-slate-500"><input type="checkbox" name="force" value="1" /> Create anyway (not a duplicate)</label>
        </div>
      )}
      <Submit>{p ? "Save changes" : "Register patient"}</Submit>
    </ActionForm>
  );
}
