import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, Input, LinkButton, PageHeader, Table, Td } from "@/components/ui";
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
  return (
    <>
      <PageHeader title={d.i.name} subtitle={`Pays ${d.i.coveragePercent}% of covered items`} actions={<LinkButton variant="secondary" href={`/insurance/claims?insurer=${d.i.id}`}>Claims</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tariff" className="lg:col-span-2">
          <p className="mb-3 text-sm text-slate-500">Insurer price per service. Services without a row are covered at the clinic price.</p>
          <ActionForm action={saveTariffAction}>
            <input type="hidden" name="insurerId" value={d.i.id} />
            <Table head={["Service", "Clinic price", "Insurer price", "Covered"]} empty="Add services in Settings first.">
              {d.rows.map(({ s, tariff }) => (
                <tr key={s.id}>
                  <Td>{s.name} <span className="text-xs capitalize text-slate-400">{s.category}</span><input type="hidden" name={`row_${s.id}`} value="1" /></Td>
                  <Td>{money(s.priceMinor, cur)}</Td>
                  <Td><Input name={`price_${s.id}`} inputMode="decimal" defaultValue={tariff ? toMajor(tariff.priceMinor) : ""} placeholder={toMajor(s.priceMinor)} className="w-28" aria-label={`${s.name} insurer price`} /></Td>
                  <Td><input type="checkbox" name={`covered_${s.id}`} defaultChecked={tariff ? tariff.covered : true} className="h-4 w-4" aria-label={`${s.name} covered`} /></Td>
                </tr>
              ))}
            </Table>
            {write && <Submit>Save tariff</Submit>}
          </ActionForm>
        </Card>
        <Card title="Details"><InsurerForm insurer={d.i} /></Card>
      </div>
    </>
  );
}
