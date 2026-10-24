import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
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
  return (
    <>
      <PageHeader title="Claims" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Claim batches" className="lg:col-span-2">
          <Table head={["Batch", "Insurer", "Period", "Claimed", "Paid", "Status"]} empty="No claims yet.">
            {d.claims.map(({ c, insurer }) => (
              <tr key={c.id}>
                <Td><Link className="font-mono text-xs text-brand-800 hover:underline" href={`/insurance/claims/${c.id}`}>{c.batchNo}</Link></Td>
                <Td>{insurer}</Td><Td>{dateOnly(c.periodStart, "UTC")} – {dateOnly(c.periodEnd, "UTC")}</Td>
                <Td>{money(c.totalClaimedMinor, cur)}</Td><Td>{money(c.totalPaidMinor, cur)}</Td>
                <Td><Badge tone={CLAIM_TONE[c.status]}>{c.status.replace("_", " ")}</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
        {ctx.access === "full" && (
          <Card title="New claim batch">
            <ActionForm action={createClaimAction} onSuccessHref="/insurance/claims/{id}">
              <Field label="Insurer">
                <Select name="insurerId" defaultValue={insurerId} required>
                  <option value="" disabled>Choose…</option>
                  {d.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </Select>
              </Field>
              <Field label="From"><Input type="date" name="periodStart" defaultValue={addDays(today.slice(0, 8) + "01", -1).slice(0, 8) + "01"} required /></Field>
              <Field label="To"><Input type="date" name="periodEnd" defaultValue={today} required /></Field>
              <p className="text-xs text-slate-500">Includes every issued invoice in the period with an unpaid insurer share that isn&apos;t already in a claim.</p>
              <Submit>Build claim</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
