import { Download, FileSpreadsheet, Lock } from "lucide-react";
import { Button, EmptyState, Field, Input, PageHeader, Panel, Select } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { localDay } from "@/lib/format";
import { hasFeature } from "@/lib/plans";

export const metadata = { title: "Accounting export" };

export default async function ExportPage() {
  const ctx = await requireCtx("billing.read");
  const allowed = hasFeature(ctx.tenant, "accounting") || ctx.user.role === "owner";
  const to = localDay(ctx.tenant.timezone);
  return (
    <>
      <PageHeader title="Accounting export" eyebrow="Billing" icon={<FileSpreadsheet />} subtitle="CSV files ready to import into QuickBooks or Zoho Books. Covers all branches." />
      {!allowed ? (
        <Panel className="mx-auto max-w-2xl"><EmptyState icon={<Lock />} title="Part of the Group plan">Accounting export is part of the Group plan. Ask the clinic owner to download it.</EmptyState></Panel>
      ) : (
        <Panel className="mx-auto max-w-2xl" title="Build your export" eyebrow="CSV" icon={<Download />} glow>
          <form action="/billing/export/csv" method="get" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From"><Input type="date" name="from" defaultValue={to.slice(0, 8) + "01"} required /></Field>
              <Field label="To"><Input type="date" name="to" defaultValue={to} required /></Field>
              <Field label="Data">
                <Select name="kind">
                  <option value="invoices">Invoices (one row per line)</option><option value="payments">Payments received</option><option value="expenses">Expenses</option>
                </Select>
              </Field>
              <Field label="Format">
                <Select name="layout">
                  <option value="quickbooks">QuickBooks</option><option value="zoho">Zoho Books</option>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <p className="text-xs text-subtle">Amounts are exported in {ctx.tenant.currency}. Dates use the clinic time zone.</p>
              <Button type="submit" size="lg"><Download className="h-4 w-4" aria-hidden />Download CSV</Button>
            </div>
          </form>
        </Panel>
      )}
    </>
  );
}
