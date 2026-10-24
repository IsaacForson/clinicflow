import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { ArrowLeft, Building2, FileStack, Settings2, Table2 } from "lucide-react";
import { Badge, EmptyState, Input, LinkButton, PageHeader, Panel, Table, Td } from "@/components/ui";
import { insurers, insurerTariffs, services } from "@/db/schema";
import { tx } from "@/lib/auth";
import { money, toMajor } from "@/lib/format";
import { saveTariffAction } from "../../actions";
import { requireInsurance } from "../../guard";
import { InsurerForm } from "../../insurer-form";

export default async function InsurerPage({ params }: PageProps<"/insurance/insurers/[id]">) {
  const { id } = await params;
  const ctx = await requireInsurance();
  const d = await tx(ctx, async (t) => {
    const [i] = await t.select().from(insurers).where(eq(insurers.id, id));
    if (!i) return null;
    const rows = await t.select({ s: services, tariff: insurerTariffs }).from(services)
      .leftJoin(insurerTariffs, and(eq(insurerTariffs.serviceId, services.id), eq(insurerTariffs.insurerId, id)))
      .where(eq(services.active, true)).orderBy(services.category, services.name);
    return { i, rows };
  });
  if (!d) notFound();
  const cur = ctx.tenant.currency;
  const write = ctx.access === "full";
  const custom = d.rows.filter((r) => r.tariff).length;
  return (
    <>
      <PageHeader title={d.i.name} eyebrow={d.i.code ? `Insurer · ${d.i.code}` : "Insurer"} icon={<Building2 />}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">Pays {d.i.coveragePercent}% of covered items {!d.i.active && <Badge>inactive</Badge>}</span>}
        actions={<>
          <LinkButton variant="ghost" href="/insurance"><ArrowLeft className="h-4 w-4" aria-hidden />Insurance</LinkButton>
          <LinkButton variant="secondary" href={`/insurance/claims?insurer=${d.i.id}`}><FileStack className="h-4 w-4" aria-hidden />Claims</LinkButton>
        </>} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Tariff" eyebrow={`${custom} custom of ${d.rows.length} services`} icon={<Table2 />} bodyClassName="px-5 pb-5 pt-3">
          <p className="mb-4 text-sm text-muted">Insurer price per service. Leave a price empty to use the clinic price.</p>
          {d.rows.length === 0 ? (
            <EmptyState icon={<Table2 />} title="No services yet">Add services in Settings first.</EmptyState>
          ) : (
            <ActionForm action={saveTariffAction}>
              <input type="hidden" name="insurerId" value={d.i.id} />
              <Table head={["Service", "Clinic price", "Insurer price", "Covered"]}>
                {d.rows.map(({ s, tariff }) => (
                  <tr key={s.id}>
                    <Td className="whitespace-normal"><div className="font-medium">{s.name}</div><div className="text-[11px] capitalize text-subtle">{s.category}</div><input type="hidden" name={`row_${s.id}`} value="1" /></Td>
                    <Td className="tabular-nums text-muted">{money(s.priceMinor, cur)}</Td>
                    <Td><Input name={`price_${s.id}`} inputMode="decimal" defaultValue={tariff ? toMajor(tariff.priceMinor) : ""} placeholder={toMajor(s.priceMinor)} className="h-9 w-32 tabular-nums" aria-label={`${s.name} insurer price`} disabled={!write} /></Td>
                    <Td><input type="checkbox" name={`covered_${s.id}`} defaultChecked={tariff ? tariff.covered : true} className="h-4 w-4 accent-[var(--accent)]" aria-label={`${s.name} covered`} disabled={!write} /></Td>
                  </tr>
                ))}
              </Table>
              {write && (
                <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-solid/90 px-4 py-3 shadow-panel backdrop-blur-xl">
                  <span className="text-xs text-muted">Changes apply to new invoices.</span>
                  <Submit>Save tariff</Submit>
                </div>
              )}
            </ActionForm>
          )}
        </Panel>
        <aside className="lg:sticky lg:top-24 lg:self-start"><Panel title="Details" icon={<Settings2 />}><InsurerForm insurer={d.i} /></Panel></aside>
      </div>
    </>
  );
}
