import { asc, desc } from "drizzle-orm";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, Select } from "@/components/ui";
import { services } from "@/db/schema";
import { toMajor } from "@/lib/format";
import { requireCtx, tx } from "@/lib/auth";
import { saveServiceAction } from "../actions";

const CATEGORIES = ["consultation", "lab", "imaging", "procedure", "drug", "other"] as const;

function ServiceFields({ s, currency }: { s?: typeof services.$inferSelect; currency: string }) {
  return (
    <>
      <Field label="Name"><Input name="name" defaultValue={s?.name} required /></Field>
      <Field label="Code"><Input name="code" defaultValue={s?.code ?? ""} /></Field>
      <Field label="Category">
        <Select name="category" defaultValue={s?.category ?? "consultation"}>{CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</Select>
      </Field>
      <Field label={`Price (${currency})`}><Input name="price" inputMode="decimal" defaultValue={s ? toMajor(s.priceMinor) : ""} required /></Field>
      <Field label="Minutes"><Input name="durationMin" type="number" min={0} defaultValue={s?.durationMin ?? 15} /></Field>
    </>
  );
}

export default async function ServicesPage() {
  const ctx = await requireCtx("settings.manage");
  const rows = await tx(ctx, (t) => t.select().from(services).orderBy(desc(services.active), asc(services.category), asc(services.name)));
  const grid = "grid items-end gap-2 sm:grid-cols-[3fr_1fr_1.5fr_1.2fr_0.8fr_auto_auto]";
  return (
    <div className="space-y-4">
      <Card title="Add service">
        <ActionForm action={saveServiceAction} resetOnSuccess className={grid}>
          <input type="hidden" name="active" value="on" />
          <ServiceFields currency={ctx.tenant.currency} />
          <span />
          <Submit>Add</Submit>
        </ActionForm>
      </Card>
      <Card title="Price list">
        <div className="divide-y divide-slate-100">
          {rows.map((s) => (
            <ActionForm key={s.id} action={saveServiceAction} className={`${grid} py-2 ${s.active ? "" : "opacity-60"}`}>
              <input type="hidden" name="id" value={s.id} />
              <ServiceFields s={s} currency={ctx.tenant.currency} />
              <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> Active</label>
              <Submit variant="secondary">Save</Submit>
            </ActionForm>
          ))}
          {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No services yet.</p>}
        </div>
      </Card>
    </div>
  );
}
