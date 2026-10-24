import { desc, eq, sql } from "drizzle-orm";
import { AlertOctagon, Building2, ChevronRight, FileStack, FileWarning, Hourglass, Plus, ShieldCheck } from "lucide-react";
import { A, Badge, EmptyState, Kpi, LinkButton, PageHeader, Panel, Progress, Table, Td } from "@/components/ui";
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
  const maxReject = Math.max(...d.rejections.map((r) => r.total), 1);
  return (
    <>
      <PageHeader title="Insurance" eyebrow="Receivables" icon={<ShieldCheck />} subtitle="Insurers, tariffs, claims and what they owe you."
        actions={<LinkButton href="/insurance/claims"><FileStack className="h-4 w-4" aria-hidden />Claims</LinkButton>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Insurers owe" value={money(owed, cur)} sub={`${d.insurers.filter((r) => r.outstanding > 0).length} insurers with balances`} icon={<Building2 />} tone="blue" />
        <Kpi label="Not yet claimed" value={money(unclaimed, cur)} sub={unclaimed > 0 ? "Build a claim to get paid" : "Everything is claimed"} icon={<Hourglass />} tone="yellow" href="/insurance/claims" />
        <Kpi label="Rejected (unpaid)" value={money(rejected, cur)} sub={`${d.rejections.reduce((s, r) => s + r.n, 0)} items`} icon={<AlertOctagon />} tone="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">Receivables by insurer</h2>
            {d.insurers.length === 0 ? (
              <EmptyState icon={<Building2 />} title="No insurers yet">Add one to start billing insurance.</EmptyState>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {d.insurers.map(({ i, outstanding, unclaimed }) => (
                  <div key={i.id} className="glass group relative flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-line-strong animate-rise">
                    <div className="flex items-start justify-between gap-3">
                      <A href={`/insurance/insurers/${i.id}`} className="flex min-w-0 items-center gap-3 text-fg hover:no-underline">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-info/25 bg-info/12 text-sm font-semibold text-info">{(i.code || i.name).slice(0, 3).toUpperCase()}</span>
                        <span className="min-w-0"><span className="block truncate font-semibold group-hover:text-accent">{i.name}</span><span className="block text-xs font-normal text-muted">Pays {i.coveragePercent}%</span></span>
                      </A>
                      {!i.active && <Badge>inactive</Badge>}
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Owes</div><div className="mt-1 text-xl font-semibold tabular-nums text-fg">{money(outstanding, cur)}</div></div>
                      <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Unclaimed</div><div className={`mt-1 text-xl font-semibold tabular-nums ${unclaimed > 0 ? "text-warn" : "text-subtle"}`}>{money(unclaimed, cur)}</div></div>
                    </div>
                    <Progress value={outstanding ? ((outstanding - unclaimed) / outstanding) * 100 : 100} tone="blue" className="mt-4" />
                    <div className="mt-1.5 text-[11px] text-subtle">{outstanding ? `${Math.round(((outstanding - unclaimed) / outstanding) * 100)}% claimed` : "Nothing owed"}</div>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                      {unclaimed > 0 ? <A href={`/insurance/claims?insurer=${i.id}`} className="text-xs"><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />Create claim</A> : <span className="text-xs text-subtle">Up to date</span>}
                      <A href={`/insurance/insurers/${i.id}`} className="text-xs text-muted">Tariff <ChevronRight className="inline h-3.5 w-3.5" aria-hidden /></A>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <Panel title="Recent claims" icon={<FileStack />} actions={<A href="/insurance/claims" className="text-xs">View all</A>} bodyClassName="px-5 pb-2 pt-4">
            {d.recent.length === 0 ? (
              <EmptyState icon={<FileStack />} title="No claims yet" compact>Build a claim batch to send to an insurer.</EmptyState>
            ) : (
              <Table head={["Batch", "Insurer", "Period", "Claimed", "Paid", "Status"]}>
                {d.recent.map(({ c, insurer }) => (
                  <tr key={c.id}>
                    <Td><A href={`/insurance/claims/${c.id}`} className="font-mono text-xs">{c.batchNo}</A></Td>
                    <Td>{insurer}</Td><Td className="text-muted">{dateOnly(c.periodStart, "UTC")} – {dateOnly(c.periodEnd, "UTC")}</Td>
                    <Td className="tabular-nums">{money(c.totalClaimedMinor, cur)}</Td><Td className="tabular-nums">{money(c.totalPaidMinor, cur)}</Td><Td><Badge tone={CLAIM_TONE[c.status]}>{c.status.replace("_", " ")}</Badge></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </div>
        <aside className="space-y-6">
          <Panel title="Top rejection reasons" icon={<FileWarning />}>
            {d.rejections.length === 0 ? (
              <EmptyState icon={<ShieldCheck />} title="No rejections" compact>Nice. Every settled item has been paid.</EmptyState>
            ) : (
              <ul className="space-y-3.5">
                {d.rejections.map((r) => (
                  <li key={r.reason}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 text-fg">{r.reason}</span>
                      <span className="shrink-0 tabular-nums text-fg">{money(r.total, cur)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-bad" style={{ width: `${(r.total / maxReject) * 100}%` }} /></div>
                      <span className="text-[11px] tabular-nums text-subtle">{r.n} items</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {ctx.access === "full" && <Panel title="Add insurer" icon={<Plus />}><InsurerForm /></Panel>}
        </aside>
      </div>
    </>
  );
}
