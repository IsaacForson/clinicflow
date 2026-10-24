import { Check, Field, Input, Select } from "@/components/ui";
import type { User } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/permissions";

export function StaffFields({ u, branches }: { u?: User; branches: { id: string; name: string }[] }) {
  const all = !u?.branchIds?.length;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Full name"><Input name="name" defaultValue={u?.name} required /></Field>
        <Field label="Email" hint="Email or phone is their login"><Input name="email" type="email" defaultValue={u?.email ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" type="tel" defaultValue={u?.phone ?? ""} /></Field>
        <Field label="Role">
          <Select name="role" defaultValue={u?.role ?? "front_desk"}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Title" hint="e.g. Dr., Nurse, Physio"><Input name="title" defaultValue={u?.title ?? ""} /></Field>
        <Field label="License number"><Input name="licenseNo" defaultValue={u?.licenseNo ?? ""} className="font-mono" /></Field>
      </div>
      <div className="rounded-xl border border-line bg-surface px-4 py-3">
        <Check name="isPractitioner" defaultChecked={u?.isPractitioner} label={<span>Sees patients <span className="text-muted">(practitioner — counts toward practitioner seats)</span></span>} />
      </div>
      {branches.length > 1 && (
        <fieldset className="rounded-xl border border-line bg-surface px-4 py-3">
          <legend className="px-1 text-xs font-medium tracking-wide text-muted">Branch access</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Check name="allBranches" defaultChecked={all} label="All branches" />
            {branches.map((b) => (
              <Check key={b.id} name="branchIds" value={b.id} defaultChecked={!all && u?.branchIds?.includes(b.id)} label={b.name} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
