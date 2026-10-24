import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
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
      <PageHeader title="Accounting export" subtitle="CSV files ready to import into QuickBooks or Zoho Books. Covers all branches." />
      {!allowed ? (
        <Card><p className="text-sm text-slate-600">Accounting export is part of the Group plan. Ask the clinic owner to download it.</p></Card>
      ) : (
        <Card className="max-w-2xl">
          <form action="/billing/export/csv" method="get" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
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
            <Button type="submit">Download CSV</Button>
          </form>
        </Card>
      )}
    </>
  );
}
