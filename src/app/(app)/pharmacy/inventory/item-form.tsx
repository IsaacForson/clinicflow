import { ActionForm, Submit } from "@/components/form";
import { Field, Input } from "@/components/ui";
import type { items } from "@/db/schema";
import { toMajor } from "@/lib/format";
import { saveItemAction } from "../actions";

export function ItemForm({ item, redirectTo }: { item?: typeof items.$inferSelect; redirectTo?: string }) {
  const i = item;
  return (
    <ActionForm action={saveItemAction} onSuccessHref={redirectTo}>
      {i && <input type="hidden" name="id" value={i.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" className="sm:col-span-2"><Input name="name" defaultValue={i?.name} required autoFocus={!i} placeholder="Amoxicillin" /></Field>
        <Field label="Generic name"><Input name="genericName" defaultValue={i?.genericName ?? ""} /></Field>
        <Field label="Form"><Input name="form" defaultValue={i?.form ?? ""} placeholder="tablet, syrup…" list="item-forms" /></Field>
        <Field label="Strength"><Input name="strength" defaultValue={i?.strength ?? ""} placeholder="500mg" /></Field>
        <Field label="Unit" hint="What you count: tablet, bottle…"><Input name="unit" defaultValue={i?.unit ?? "unit"} /></Field>
        <Field label="SKU / barcode"><Input name="sku" defaultValue={i?.sku ?? ""} /></Field>
        <Field label="Reorder level"><Input name="reorderLevel" type="number" min={0} defaultValue={i?.reorderLevel ?? 0} /></Field>
        <Field label="Sell price (per unit)"><Input name="sellPrice" inputMode="decimal" defaultValue={i ? toMajor(i.sellPriceMinor) : ""} placeholder="0.00" /></Field>
      </div>
      <datalist id="item-forms">{["tablet", "capsule", "syrup", "suspension", "injection", "cream", "ointment", "drops", "inhaler", "sachet"].map((f) => <option key={f} value={f} />)}</datalist>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isDrug" defaultChecked={i?.isDrug ?? true} /> Medicine</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="favorite" defaultChecked={i?.favorite} /> Favorite (top of lists)</label>
        {i && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={i.active} /> Active</label>}
      </div>
      <Submit>{i ? "Save item" : "Add item"}</Submit>
    </ActionForm>
  );
}
