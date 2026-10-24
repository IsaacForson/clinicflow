import { Building2, Globe2, Phone, Printer } from "lucide-react";
import { ActionForm, Submit } from "@/components/form";
import { Field, Input, Panel, Select, Textarea } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { COUNTRIES } from "@/lib/provision";
import { updateProfileAction } from "./actions";
import { LogoPicker } from "./logo-picker";


export const metadata = { title: "Settings" };
export default async function ClinicProfilePage() {
  const ctx = await requireCtx("settings.manage");
  const t = ctx.tenant;
  const zones = Intl.supportedValuesOf("timeZone").filter((z) => z.startsWith("Africa/") || z.startsWith("Europe/") || z.startsWith("America/") || z === t.timezone);
  return (
    <ActionForm action={updateProfileAction} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Identity" eyebrow="How patients see you" icon={<Building2 />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Clinic name" className="sm:col-span-2"><Input name="name" defaultValue={t.name} required /></Field>
              <div className="sm:col-span-2"><LogoPicker current={t.logoUrl} initial={t.name[0] ?? "C"} /></div>
              <Field label="Letterhead lines" hint="Printed under the clinic name on prescriptions, receipts and letters" className="sm:col-span-2">
                <Textarea name="letterhead" defaultValue={t.letterhead ?? ""} placeholder={"Opening hours: Mon–Sat 8am–8pm\nP.O. Box 123"} />
              </Field>
            </div>
          </Panel>
          <Panel title="Contact & registration" eyebrow="Printed on documents" icon={<Phone />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone"><Input name="phone" type="tel" defaultValue={t.phone ?? ""} /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={t.email ?? ""} /></Field>
              <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={t.address ?? ""} /></Field>
              <Field label="Registration number" hint="e.g. HeFRA / MDCN / KMPDC facility number"><Input name="registrationNo" defaultValue={t.registrationNo ?? ""} /></Field>
              <Field label="Tax ID (TIN)"><Input name="taxId" defaultValue={t.taxId ?? ""} /></Field>
            </div>
          </Panel>
          <Panel title="Region & money" eyebrow="Locale" icon={<Globe2 />}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Country">
                <Select name="country" defaultValue={t.country}>{Object.entries(COUNTRIES).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</Select>
              </Field>
              <Field label="Currency" hint="Changing this does not convert existing amounts"><Input name="currency" defaultValue={t.currency} maxLength={3} required className="font-mono uppercase" /></Field>
              <Field label="Timezone">
                <Select name="timezone" defaultValue={t.timezone}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Panel title="Letterhead preview" eyebrow="Saved version" icon={<Printer />}>
            {/* A paper-like sheet so the clinic sees roughly what prints. */}
            <div className="rounded-xl border border-line bg-surface-2 p-4 shadow-panel">
              <div className="flex items-start gap-3 border-b border-line pb-3">
                {t.logoUrl
                  ? <img src={t.logoUrl} alt="" className="h-11 w-11 rounded-lg object-contain" />
                  : <span className="grid h-11 w-11 place-items-center rounded-lg bg-aurora text-lg font-semibold text-on-accent">{t.name[0]}</span>}
                <div className="min-w-0">
                  <div className="truncate font-semibold tracking-tight text-fg">{t.name}</div>
                  {t.letterhead && <div className="whitespace-pre-line text-[11px] leading-snug text-muted">{t.letterhead}</div>}
                </div>
              </div>
              <div className="space-y-0.5 pt-3 text-[11px] text-muted">
                {[t.address, [t.phone, t.email].filter(Boolean).join(" · "), t.registrationNo && `Reg. ${t.registrationNo}`, t.taxId && `TIN ${t.taxId}`].filter(Boolean).map((l, i) => <div key={i} className="truncate">{l}</div>)}
              </div>
              <div className="mt-4 space-y-1.5" aria-hidden>
                <div className="h-1.5 w-3/4 rounded-full bg-surface-3" />
                <div className="h-1.5 w-full rounded-full bg-surface-3" />
                <div className="h-1.5 w-2/3 rounded-full bg-surface-3" />
              </div>
            </div>
            <p className="mt-3 text-xs text-subtle">Updates after you save. Used on prescriptions, receipts, invoices and letters.</p>
          </Panel>
          <div className="flex justify-end"><Submit size="lg" className="w-full xl:w-auto">Save profile</Submit></div>
        </aside>
      </div>
    </ActionForm>
  );
}
