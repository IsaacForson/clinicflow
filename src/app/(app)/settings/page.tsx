import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, Select, Textarea } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { COUNTRIES } from "@/lib/provision";
import { updateProfileAction } from "./actions";

export default async function ClinicProfilePage() {
  const ctx = await requireCtx("settings.manage");
  const t = ctx.tenant;
  const zones = Intl.supportedValuesOf("timeZone").filter((z) => z.startsWith("Africa/") || z.startsWith("Europe/") || z.startsWith("America/") || z === t.timezone);
  return (
    <Card title="Clinic profile">
      <ActionForm action={updateProfileAction}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Clinic name"><Input name="name" defaultValue={t.name} required /></Field>
          <Field label="Phone"><Input name="phone" type="tel" defaultValue={t.phone ?? ""} /></Field>
          <Field label="Email"><Input name="email" type="email" defaultValue={t.email ?? ""} /></Field>
          <Field label="Address"><Input name="address" defaultValue={t.address ?? ""} /></Field>
          <Field label="Registration number" hint="e.g. HeFRA / MDCN / KMPDC facility number"><Input name="registrationNo" defaultValue={t.registrationNo ?? ""} /></Field>
          <Field label="Tax ID (TIN)"><Input name="taxId" defaultValue={t.taxId ?? ""} /></Field>
          <Field label="Letterhead lines" hint="Printed under the clinic name on prescriptions, receipts and letters" className="sm:col-span-2">
            <Textarea name="letterhead" defaultValue={t.letterhead ?? ""} placeholder={"Opening hours: Mon–Sat 8am–8pm\nP.O. Box 123"} />
          </Field>
          <Field label="Country">
            <Select name="country" defaultValue={t.country}>{Object.entries(COUNTRIES).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Currency" hint="Changing this does not convert existing amounts"><Input name="currency" defaultValue={t.currency} maxLength={3} required /></Field>
          <Field label="Timezone">
            <Select name="timezone" defaultValue={t.timezone}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>
          </Field>
          <Field label="Logo" hint="PNG, JPG or WebP up to 2 MB">
            <div className="flex items-center gap-3">
              {t.logoUrl && <img src={t.logoUrl} alt="Current logo" className="h-10 w-10 rounded object-contain ring-1 ring-slate-200" />}
              <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
            </div>
          </Field>
        </div>
        <Submit>Save profile</Submit>
      </ActionForm>
    </Card>
  );
}
