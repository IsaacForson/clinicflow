import { asc, desc } from "drizzle-orm";
import { FlaskConical, Package, Pill, Plus, ScanLine, Scissors, Stethoscope, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { ActionForm, Submit } from "@/components/form";
import { Check, cx, EmptyState, Field, Input, Panel, Select } from "@/components/ui";
import { services } from "@/db/schema";
import { money, toMajor } from "@/lib/format";
import { requireCtx, tx } from "@/lib/auth";
import { saveServiceAction } from "../actions";


export const metadata = { title: "Services" };
const CATEGORIES = ["consultation", "lab", "imaging", "procedure", "drug", "other"] as const;
const CAT_ICON: Record<string, ReactNode> = { consultation: <Stethoscope />, lab: <FlaskConical />, imaging: <ScanLine />, procedure: <Scissors />, drug: <Pill />, other: <Package /> };

const Lbl = ({ bare, label, children }: { bare?: boolean; label: string; children: ReactNode }) => (bare ? children : <Field label={label}>{children}</Field>);

/** Fields for one service; `bare` drops visible labels for dense list rows (aria-labels stay). */
function ServiceFields({ s, currency, bare }: { s?: typeof services.$inferSelect; currency: string; bare?: boolean }) {
  return (
    <>
      <Lbl bare={bare} label="Name"><Input name="name" defaultValue={s?.name} required aria-label="Name" /></Lbl>
      <Lbl bare={bare} label="Code"><Input name="code" defaultValue={s?.code ?? ""} aria-label="Code" className="font-mono text-xs" /></Lbl>
      <Lbl bare={bare} label="Category">
        <Select name="category" defaultValue={s?.category ?? "consultation"} aria-label="Category" className="capitalize">{CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</Select>
      </Lbl>
      <Lbl bare={bare} label={`Price (${currency})`}><Input name="price" inputMode="decimal" defaultValue={s ? toMajor(s.priceMinor) : ""} required aria-label={`Price (${currency})`} className="text-right tabular-nums" /></Lbl>
      <Lbl bare={bare} label="Minutes"><Input name="durationMin" type="number" min={0} defaultValue={s?.durationMin ?? 15} aria-label="Minutes" className="tabular-nums" /></Lbl>
    </>
  );
}

export default async function ServicesPage() {
  const ctx = await requireCtx("settings.manage");
  const rows = await tx(ctx, (t) => t.select().from(services).orderBy(desc(services.active), asc(services.category), asc(services.name)));
  const grid = "grid items-center gap-2 lg:grid-cols-[minmax(0,3fr)_1fr_1.4fr_1.2fr_0.8fr_auto_auto]";
  const cur = ctx.tenant.currency;
  const byCat = CATEGORIES.map((c) => [c, rows.filter((s) => s.category === c)] as const).filter(([, l]) => l.length);
  return (
    <>
      <Panel title="Add a service" eyebrow="Price list" icon={<Plus />} glow>
        <ActionForm action={saveServiceAction} resetOnSuccess className="grid items-end gap-3 [&>*]:mb-0! sm:grid-cols-2 lg:grid-cols-[minmax(0,3fr)_1fr_1.4fr_1.2fr_0.8fr_auto]">
          <input type="hidden" name="active" value="on" />
          <ServiceFields currency={cur} />
          <Submit>Add service</Submit>
        </ActionForm>
      </Panel>

      {rows.length === 0 ? (
        <EmptyState icon={<Tag />} title="No services yet">Add consultations, lab tests and procedures above — they appear on invoices and in the patient portal booking.</EmptyState>
      ) : byCat.map(([cat, list]) => (
        <Panel key={cat} icon={CAT_ICON[cat]} eyebrow={`${list.length} service${list.length === 1 ? "" : "s"}`} title={<span className="capitalize">{cat}</span>}
          actions={<span className="text-xs text-muted tabular-nums">from {money(Math.min(...list.map((s) => s.priceMinor)), cur)}</span>}>
          <div className={cx(grid, "-mx-1 hidden px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle lg:grid")} aria-hidden>
            <span>Name</span><span>Code</span><span>Category</span><span className="text-right">Price ({cur})</span><span>Min</span><span /><span />
          </div>
          <div className="space-y-2 lg:space-y-1">
            {list.map((s) => (
              <ActionForm key={s.id} action={saveServiceAction} className={cx(grid, "[&>*]:mb-0! rounded-xl border border-line p-3 transition hover:bg-surface-2 lg:border-0 lg:p-1", !s.active && "opacity-60")}>
                <input type="hidden" name="id" value={s.id} />
                <ServiceFields s={s} currency={cur} bare />
                <Check name="active" defaultChecked={s.active} label={<span className="text-xs text-muted">Active</span>} />
                <Submit variant="secondary" size="sm">Save</Submit>
              </ActionForm>
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}
