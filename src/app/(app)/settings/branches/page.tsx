import { asc } from "drizzle-orm";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input } from "@/components/ui";
import { branches } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { hasFeature, PLANS } from "@/lib/plans";
import { describeHours, WEEKDAYS } from "@/lib/hours";
import { makeMainBranchAction, saveBranchAction, saveOpeningHoursAction } from "../actions";

export default async function BranchesPage() {
  const ctx = await requireCtx("settings.manage");
  const rows = await tx(ctx, (t) => t.select().from(branches).orderBy(asc(branches.name)));
  const limit = PLANS[ctx.tenant.plan].branches;
  const canAdd = hasFeature(ctx.tenant, "multi_branch") && rows.filter((b) => b.active).length < limit;
  return (
    <div className="space-y-4">
      <Card title="Branches" actions={<span className="text-xs text-slate-500">{rows.filter((b) => b.active).length} of {limit} on {PLANS[ctx.tenant.plan].name}</span>}>
        <div className="divide-y divide-slate-100">
          {rows.map((b) => (
            <div key={b.id} className="py-3">
              <ActionForm action={saveBranchAction} className="grid items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_auto_auto]">
                <input type="hidden" name="id" value={b.id} />
                <Field label="Name"><Input name="name" defaultValue={b.name} required /></Field>
                <Field label="Address"><Input name="address" defaultValue={b.address ?? ""} /></Field>
                <Field label="Phone"><Input name="phone" defaultValue={b.phone ?? ""} /></Field>
                <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={b.active} /> Active</label>
                <Submit variant="secondary">Save</Submit>
              </ActionForm>
              <div className="mt-1 flex gap-2">
                {b.isMain ? <Badge tone="teal">Main branch</Badge> : b.active && <ActionButton action={makeMainBranchAction} fields={{ id: b.id }}>Make main</ActionButton>}
              </div>
              <details className="mt-2 rounded-md bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  Opening hours <span className="font-normal text-slate-500">· {WEEKDAYS.map((d, i) => `${d.slice(0, 3)} ${describeHours(b.openingHours[String(i) as keyof typeof b.openingHours])}`).join(", ")}</span>
                </summary>
                <ActionForm action={saveOpeningHoursAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={b.id} />
                  <p className="text-xs text-slate-500">Used to lay out the appointment calendar, warn front desk about bookings outside hours, and offer slots in the patient portal.</p>
                  {WEEKDAYS.map((d, i) => {
                    const h = b.openingHours[String(i) as keyof typeof b.openingHours];
                    return (
                      <div key={d} className="grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2 text-sm">
                        <span>{d}</span>
                        <Input type="time" name={`open_${i}`} defaultValue={h?.[0] ?? "08:00"} aria-label={`${d} opens`} />
                        <Input type="time" name={`close_${i}`} defaultValue={h?.[1] ?? "17:00"} aria-label={`${d} closes`} />
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`closed_${i}`} defaultChecked={!h} /> Closed</label>
                      </div>
                    );
                  })}
                  <Submit variant="secondary">Save opening hours</Submit>
                </ActionForm>
              </details>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Add branch">
        {canAdd ? (
          <ActionForm action={saveBranchAction} resetOnSuccess className="grid items-end gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
            <input type="hidden" name="active" value="on" />
            <Field label="Name"><Input name="name" required placeholder="e.g. East Legon" /></Field>
            <Field label="Address"><Input name="address" /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Submit>Add branch</Submit>
          </ActionForm>
        ) : (
          <p className="text-sm text-slate-600">Your plan includes {limit} branch{limit === 1 ? "" : "es"}. Multiple branches with shared patient records are on the <a href="/settings/subscription" className="font-medium text-teal-800 underline">Group plan</a>.</p>
        )}
      </Card>
    </div>
  );
}
