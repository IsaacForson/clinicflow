import { Field, Input, Select } from "@/components/ui";
import type { User } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/permissions";

export function StaffFields({ u, branches }: { u?: User; branches: { id: string; name: string }[] }) {
  const all = !u?.branchIds?.length;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Full name"><Input name="name" defaultValue={u?.name} required /></Field>
      <Field label="Email" hint="Email or phone is their login"><Input name="email" type="email" defaultValue={u?.email ?? ""} /></Field>
      <Field label="Phone"><Input name="phone" type="tel" defaultValue={u?.phone ?? ""} /></Field>
      <Field label="Role">
        <Select name="role" defaultValue={u?.role ?? "front_desk"}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      <Field label="Title" hint="e.g. Dr., Nurse, Physio"><Input name="title" defaultValue={u?.title ?? ""} /></Field>
      <Field label="License number"><Input name="licenseNo" defaultValue={u?.licenseNo ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPractitioner" defaultChecked={u?.isPractitioner} /> Sees patients (practitioner)</label>
      {branches.length > 1 && (
        <fieldset className="text-sm sm:col-span-2">
          <legend className="font-medium text-slate-700">Branch access</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="allBranches" defaultChecked={all} /> All branches</label>
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-1.5"><input type="checkbox" name="branchIds" value={b.id} defaultChecked={!all && u?.branchIds?.includes(b.id)} /> {b.name}</label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
