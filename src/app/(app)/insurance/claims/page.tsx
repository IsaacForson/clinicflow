import { desc, eq } from "drizzle-orm";
import { FilePlus2, FileStack } from "lucide-react";
import { ActionForm, Submit } from "@/components/form";
import { A, Badge, EmptyState, Field, Input, PageHeader, Panel, Progress, Select, Table, Tabs, Td } from "@/components/ui";
import { claims, insurers } from "@/db/schema";
import { tx } from "@/lib/auth";
import { addDays, dateOnly, localDay, money } from "@/lib/format";
import { CLAIM_TONE } from "../../billing/methods";
import { createClaimAction } from "../actions";
import { requireInsurance } from "../guard";

export const metadata = { title: "Claims" };

export default async function ClaimsPage({ searchParams }: PageProps<"/insurance/claims">) {
  const ctx = await requireInsurance();
  const sp = await searchParams;
  const insurerId = typeof sp.insurer === "string" ? sp.insurer : "";
  const cur = ctx.tenant.currency;
  const today = localDay(ctx.tenant.timezone);
  const d = await tx(ctx, async (t) => ({
    insurers: await t.select({ id: insurers.id, name: insurers.name }).from(insurers).orderBy(insurers.name),
    claims: await t.select({ c: claims, insurer: insurers.name }).from(claims).innerJoin(insurers, eq(insurers.id, claims.insurerId))
      .where(/^[0-9a-f-]{36}$/.test(insurerId) ? eq(claims.insurerId, insurerId) : undefined).orderBy(desc(claims.createdAt)).limit(100),
  }));
  const filtered = d.insurers.find((i) => i.id === insurerId);
  return (
    <>
      <PageHeader title="Claims" eyebrow="Insurance" icon={<FileStack />} subtitle={filtered ? `Claim batches for ${filtered.name}` : "Claim batches sent to insurers and what came back."} />
      {d.insurers.length > 0 && (
        <Tabs current={filtered ? insurerId : "all"} tabs={[{ key: "all", label: "All insurers", href: "/insurance/claims" }, ...d.insurers.map((i) => ({ key: i.id, label: i.name, href: `/insurance/claims?insurer=${i.id}` }))]} />
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Claim batches" eyebrow={`${d.claims.length} batches`} icon={<FileStack />} bodyClassName="px-5 pb-2 pt-4">
          {d.claims.length === 0 ? (
            <EmptyState icon={<FileStack />} title="No claims yet">Build a claim batch from the issued invoices with an unpaid insurer share.</EmptyState>
          ) : (
            <Table head={["Batch", "Insurer", "Period", "Claimed", "Paid", "Status"]}>
              {d.claims.map(({ c, insurer }) => (
                <tr key={c.id}>
                  <Td><A href={`/insurance/claims/${c.id}`} className="font-mono text-xs">{c.batchNo}</A></Td>
                  <Td>{insurer}</Td><Td className="text-muted">{dateOnly(c.periodStart, "UTC")} – {dateOnly(c.periodEnd, "UTC")}</Td>
                  <Td className="tabular-nums">{money(c.totalClaimedMinor, cur)}</Td>
                  <Td><div className="w-28"><div className="tabular-nums">{money(c.totalPaidMinor, cur)}</div><Progress value={c.totalClaimedMinor ? (c.totalPaidMinor / c.totalClaimedMinor) * 100 : 0} tone="green" className="mt-1.5" /></div></Td>
                  <Td><Badge tone={CLAIM_TONE[c.status]}>{c.status.replace("_", " ")}</Badge></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        {ctx.access === "full" && (
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Panel title="New claim batch" icon={<FilePlus2 />} glow>
              <ActionForm action={createClaimAction} onSuccessHref="/insurance/claims/{id}" className="space-y-4">
                <Field label="Insurer">
                  <Select name="insurerId" defaultValue={insurerId} required>
                    <option value="" disabled>Choose…</option>
                    {d.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From"><Input type="date" name="periodStart" defaultValue={addDays(today.slice(0, 8) + "01", -1).slice(0, 8) + "01"} required /></Field>
                  <Field label="To"><Input type="date" name="periodEnd" defaultValue={today} required /></Field>
                </div>
                <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">Includes every issued invoice in the period with an unpaid insurer share that isn&apos;t already in a claim.</p>
                <Submit size="lg" className="w-full">Build claim</Submit>
              </ActionForm>
            </Panel>
          </aside>
        )}
      </div>
    </>
  );
}
