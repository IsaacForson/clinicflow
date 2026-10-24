import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { claimItems, claims, insurers, invoices } from "@/db/schema";
import { tx } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { CLAIM_TONE } from "../billing/methods";
import { requireInsurance } from "./guard";
import { InsurerForm } from "./insurer-form";

export const metadata = { title: "Insurance" };

export default async function InsurancePage() {
  const ctx = await requireInsurance();
  const cur = ctx.tenant.currency;
  const d = await tx(ctx, async (t) => ({
    insurers: await t.select({
      i: insurers,
      outstanding: sql<number>`coalesce((select sum(${invoices.insurerPortionMinor} - ${invoices.insurerPaidMinor}) from ${invoices} where ${invoices.insurerId} = ${insurers.id} and ${invoices.status} not in ('draft','void')), 0)::int`,
      unclaimed: sql<number>`coalesce((select sum(${invoices.insurerPortionMinor} - ${invoices.insurerPaidMinor}) from ${invoices} where ${invoices.insurerId} = ${insurers.id} and ${invoices.status} not in ('draft','void') and not exists (select 1 from ${claimItems} where ${claimItems.invoiceId} = ${invoices.id})), 0)::int`,
    }).from(insurers).orderBy(insurers.name),
    rejections: await t.select({ reason: claimItems.rejectionReason, n: sql<number>`count(*)::int`, total: sql<number>`sum(${claimItems.amountClaimedMinor} - ${claimItems.amountPaidMinor})::int` })
      .from(claimItems).where(sql`${claimItems.rejectionReason} is not null`).groupBy(claimItems.rejectionReason).orderBy(sql`2 desc`).limit(10),
    recent: await t.select({ c: claims, insurer: insurers.name }).from(claims).innerJoin(insurers, eq(insurers.id, claims.insurerId)).orderBy(desc(claims.createdAt)).limit(10),
  }));
  const owed = d.insurers.reduce((s, r) => s + r.outstanding, 0);
  const unclaimed = d.insurers.reduce((s, r) => s + r.unclaimed, 0);
  const rejected = d.rejections.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <PageHeader title="Insurance" subtitle="Insurers, tariffs, claims and receivables." actions={<LinkButton href="/insurance/claims">Claims</LinkButton>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Insurers owe" value={money(owed, cur)} />
        <Stat label="Not yet claimed" value={money(unclaimed, cur)} />
        <Stat label="Rejected (unpaid)" value={money(rejected, cur)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Receivables by insurer">
            <Table head={["Insurer", "Coverage", "Outstanding", "Unclaimed", ""]} empty="No insurers yet. Add one to start billing insurance.">
              {d.insurers.map(({ i, outstanding, unclaimed }) => (
                <tr key={i.id}>
                  <Td><Link className="font-medium text-teal-800 hover:underline" href={`/insurance/insurers/${i.id}`}>{i.name}</Link> {!i.active && <Badge>inactive</Badge>}</Td>
                  <Td>{i.coveragePercent}%</Td><Td>{money(outstanding, cur)}</Td><Td>{money(unclaimed, cur)}</Td>
                  <Td>{unclaimed > 0 && <Link className="text-xs text-teal-800 hover:underline" href={`/insurance/claims?insurer=${i.id}`}>Create claim</Link>}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Recent claims">
            <Table head={["Batch", "Insurer", "Period", "Claimed", "Paid", "Status"]} empty="No claims yet.">
              {d.recent.map(({ c, insurer }) => (
                <tr key={c.id}>
                  <Td><Link className="font-mono text-xs text-teal-800 hover:underline" href={`/insurance/claims/${c.id}`}>{c.batchNo}</Link></Td>
                  <Td>{insurer}</Td><Td>{dateOnly(c.periodStart, "UTC")} – {dateOnly(c.periodEnd, "UTC")}</Td>
                  <Td>{money(c.totalClaimedMinor, cur)}</Td><Td>{money(c.totalPaidMinor, cur)}</Td><Td><Badge tone={CLAIM_TONE[c.status]}>{c.status.replace("_", " ")}</Badge></Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Top rejection reasons">
            <Table head={["Reason", "Items", "Amount"]} empty="No rejections.">
              {d.rejections.map((r) => <tr key={r.reason}><Td className="whitespace-normal">{r.reason}</Td><Td>{r.n}</Td><Td>{money(r.total, cur)}</Td></tr>)}
            </Table>
          </Card>
          {ctx.access === "full" && <Card title="Add insurer"><InsurerForm /></Card>}
        </div>
      </div>
    </>
  );
}
