import { ArrowLeftRight, Coins, RefreshCw, Tags } from "lucide-react";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Field, Input, PageHeader, Panel, Table, Td } from "@/components/ui";
import { adminDb } from "@/db";
import { fxRates } from "@/db/schema";
import { CURRENCIES, CURRENCY_NAMES } from "@/lib/countries";
import { dateTime, money } from "@/lib/format";
import { DEFAULT_PER_USD, PAYSTACK_CURRENCIES } from "@/lib/money";
import { PLANS, type PlanKey } from "@/lib/plans";
import { requireAdmin } from "@/lib/platform-auth";
import { moneyCtx } from "@/lib/platform-metrics";
import { refreshRatesAction, saveRateAction, savePriceBookAction } from "../actions";

export const metadata = { title: "Pricing & currencies" };

const major = (minor: number) => (minor / 100).toFixed(2).replace(/\.00$/, "");

export default async function PricingPage() {
  await requireAdmin("clinics.billing");
  const [m, rows] = await Promise.all([moneyCtx("USD"), adminDb().select().from(fxRates)]);
  const stored = new Map(rows.map((r) => [r.currency, r]));
  return (
    <>
      <PageHeader eyebrow="Finance" icon={<Coins />} title="Pricing & currencies"
        subtitle="Clinics see and pay their subscription in their own currency. Set local prices here (e.g. by purchasing power); without one, the USD price is converted and rounded." />

      <Panel title="Local subscription prices" eyebrow="Per currency · monthly" icon={<Tags />}>
        <div className="space-y-3">
          {CURRENCIES.map((cur) => {
            const list = m.lists.get(cur)!;
            return (
              <details key={cur} className="group rounded-2xl border border-line bg-surface">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-12 font-mono text-sm font-semibold">{cur}</span>
                  <span className="text-sm text-muted">{CURRENCY_NAMES[cur]}</span>
                  {list.custom ? <Badge tone="purple">custom prices</Badge> : <Badge>converted from USD</Badge>}
                  {!PAYSTACK_CURRENCIES.has(cur) && <Badge tone="yellow">billed in USD</Badge>}
                  <span className="ml-auto text-sm tabular-nums text-muted">
                    {(Object.keys(PLANS) as PlanKey[]).map((p) => money(list.plans[p], cur)).join(" · ")}
                  </span>
                </summary>
                <ActionForm action={savePriceBookAction} className="grid gap-3 border-t border-line p-4 sm:grid-cols-4 [&>*]:mb-0!">
                  <input type="hidden" name="currency" value={cur} />
                  <Field label="Solo / month"><Input name="solo" inputMode="decimal" defaultValue={major(list.plans.solo)} /></Field>
                  <Field label="Clinic / month"><Input name="clinic" inputMode="decimal" defaultValue={major(list.plans.clinic)} /></Field>
                  <Field label="Group / month"><Input name="group" inputMode="decimal" defaultValue={major(list.plans.group)} /></Field>
                  <Field label="AI scribe / seat"><Input name="scribe" inputMode="decimal" defaultValue={major(list.scribe)} /></Field>
                  <Field label="Migration: import"><Input name="migrationBasic" inputMode="decimal" defaultValue={major(list.migration.basic)} /></Field>
                  <Field label="Migration: switch"><Input name="migrationStandard" inputMode="decimal" defaultValue={major(list.migration.standard)} /></Field>
                  <Field label="Migration: full"><Input name="migrationFull" inputMode="decimal" defaultValue={major(list.migration.full)} /></Field>
                  <div className="flex items-end gap-2">
                    <Submit size="md" className="flex-1">Save {cur} prices</Submit>
                    {list.custom && <button name="reset" value="1" className="h-10 rounded-xl border border-line px-3 text-xs text-muted hover:text-fg">Reset</button>}
                  </div>
                </ActionForm>
              </details>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-subtle">Annual billing is 10 × the monthly price (2 months free). Changes apply to new checkouts; existing subscriptions keep their period.</p>
      </Panel>

      <div className="mt-6">
        <Panel title="Exchange rates" eyebrow="Units per 1 USD" icon={<ArrowLeftRight />}
          actions={<ActionForm action={refreshRatesAction} className="space-y-0"><Submit size="sm" variant="secondary"><RefreshCw className="h-3.5 w-3.5" />Refresh now</Submit></ActionForm>}>
          <Table head={["Currency", "Rate", "Source", "Updated", ""]}>
            {CURRENCIES.map((cur) => {
              const r = stored.get(cur);
              return (
                <tr key={cur}>
                  <Td className="font-mono text-sm font-semibold">{cur}</Td>
                  <Td colSpan={1}>
                    <ActionForm action={saveRateAction} className="flex items-center gap-2 space-y-0">
                      <input type="hidden" name="currency" value={cur} />
                      <Input name="perUsd" inputMode="decimal" defaultValue={String(m.rates[cur] ?? DEFAULT_PER_USD[cur])} disabled={cur === "USD"} className="h-8 w-32 text-xs tabular-nums" />
                      {cur !== "USD" && <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="locked" defaultChecked={r?.locked} /> lock</label>}
                      {cur !== "USD" && <Submit size="sm" variant="secondary">Save</Submit>}
                    </ActionForm>
                  </Td>
                  <Td className="text-xs text-muted">{r?.source ?? "built-in default"}</Td>
                  <Td className="text-xs text-muted">{r ? dateTime(r.updatedAt, "UTC") : "—"}</Td>
                  <Td>{r?.locked && <Badge tone="yellow">locked</Badge>}</Td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 text-xs text-subtle">Rates refresh daily from a public feed. Locked rates are never overwritten. Rates are used to convert prices and to total revenue across currencies in Control.</p>
        </Panel>
      </div>
    </>
  );
}
