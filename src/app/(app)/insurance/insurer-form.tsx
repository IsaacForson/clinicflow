import { ActionForm, Submit } from "@/components/form";
import { Check, Field, Input } from "@/components/ui";
import type { insurers } from "@/db/schema";
import { saveInsurerAction } from "./actions";

export function InsurerForm({ insurer: i }: { insurer?: typeof insurers.$inferSelect }) {
  return (
    <ActionForm action={saveInsurerAction} resetOnSuccess={!i} onSuccessHref={i ? undefined : "/insurance/insurers/{id}"} className="space-y-4">
      {i && <input type="hidden" name="id" value={i.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input name="name" defaultValue={i?.name} required /></Field>
        <Field label="Code"><Input name="code" defaultValue={i?.code ?? ""} placeholder="e.g. NHIS" /></Field>
        <Field label="Contact person"><Input name="contactName" defaultValue={i?.contactName ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" type="tel" defaultValue={i?.phone ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" defaultValue={i?.email ?? ""} /></Field>
        <Field label="Claims email"><Input name="claimEmail" type="email" defaultValue={i?.claimEmail ?? ""} /></Field>
        <Field label="Coverage %" hint="Share of covered items the insurer pays"><Input name="coveragePercent" type="number" min={0} max={100} defaultValue={i?.coveragePercent ?? 100} /></Field>
        {i && <Check name="active" defaultChecked={i.active} label="Active" className="self-end pb-2.5" />}
      </div>
      <div className="flex justify-end"><Submit>{i ? "Save insurer" : "Add insurer"}</Submit></div>
    </ActionForm>
  );
}
