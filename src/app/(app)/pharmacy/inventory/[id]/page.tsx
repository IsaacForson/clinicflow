import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { ArrowLeft, ArrowLeftRight, Boxes, Building2, Filter, History, Package, PackagePlus, Pencil, SlidersHorizontal } from "lucide-react";
import { Badge, Button, cx, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select, Table, Td } from "@/components/ui";
import { ComposerTabs } from "../../composer-tabs";
import { branches, items, stockBatches, stockMovements, stockMoveEnum, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, dateTime, dayRange, localDay, money } from "@/lib/format";
import { adjustStockAction, expireBatchAction, receiveStockAction, transferStockAction } from "../../actions";
import { ItemForm } from "../item-form";


export const metadata = { title: "Stock item" };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ItemPage({ params, searchParams }: PageProps<"/pharmacy/inventory/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireCtx("inventory.manage");
  const tz = ctx.tenant.timezone;
  const today = localDay(tz);
  const type = stockMoveEnum.enumValues.find((v) => v === sp.type);
  const branchFilter = ctx.branches.find((b) => b.id === sp.branch)?.id;
  const from = isDay(sp.from) ? sp.from : addDays(today, -90);
  const to = isDay(sp.to) ? sp.to : today;
  const data = await tx(ctx, async (t) => {
    const [item] = await t.select().from(items).where(eq(items.id, id));
    if (!item) return null;
    return {
      item,
      perBranch: await t.select({ branch: branches.name, qty: sql<number>`coalesce(sum(${stockBatches.qtyOnHand}), 0)::int` })
        .from(stockBatches).innerJoin(branches, eq(branches.id, stockBatches.branchId)).where(eq(stockBatches.itemId, id)).groupBy(branches.name),
      batches: await t.select().from(stockBatches)
        .where(and(eq(stockBatches.itemId, id), eq(stockBatches.branchId, ctx.branchId), gt(stockBatches.qtyOnHand, 0)))
        .orderBy(sql`${stockBatches.expiry} asc nulls last`),
      moves: await t.select({ m: stockMovements, batchNo: stockBatches.batchNo, branch: branches.name, user: users.name }).from(stockMovements)
        .leftJoin(stockBatches, eq(stockBatches.id, stockMovements.batchId)).innerJoin(branches, eq(branches.id, stockMovements.branchId))
        .leftJoin(users, eq(users.id, stockMovements.userId))
        .where(and(eq(stockMovements.itemId, id), type ? eq(stockMovements.type, type) : undefined,
          branchFilter ? eq(stockMovements.branchId, branchFilter) : undefined,
          gte(stockMovements.createdAt, dayRange(from, tz).start), lt(stockMovements.createdAt, dayRange(to, tz).end)))
        .orderBy(desc(stockMovements.createdAt)).limit(500),
    };
  });
  if (!data) notFound();
  const { item } = data;
  const cur = ctx.tenant.currency;
  const write = ctx.access === "full";
  const others = ctx.branches.filter((b) => b.id !== ctx.branchId);
  const batchLabel = (b: typeof data.batches[number]) => `${b.batchNo ?? "no batch"} · exp ${b.expiry ?? "—"} · ${b.qtyOnHand} left`;
  const total = data.batches.reduce((s, b) => s + b.qtyOnHand, 0);
  const low = item.reorderLevel > 0 && total <= item.reorderLevel;
  const MOVE_TONE: Record<string, "green" | "red" | "blue" | "yellow" | "gray"> = { receive: "green", dispense: "blue", adjust: "yellow", expire: "red", transfer_in: "green", transfer_out: "yellow", return: "green" };
  return (
    <>
      <PageHeader icon={<Package />} eyebrow="Inventory item"
        title={<span className="flex flex-wrap items-center gap-3">{item.name} {item.strength && <span className="text-muted">{item.strength}</span>} {!item.active && <Badge>inactive</Badge>}</span>}
        subtitle={[item.genericName, item.form, `sold per ${item.unit} at ${money(item.sellPriceMinor, cur)}`, item.reorderLevel && `reorder at ${item.reorderLevel}`].filter(Boolean).join(" · ")}
        actions={<LinkButton variant="ghost" href="/pharmacy/inventory"><ArrowLeft className="h-4 w-4" />All items</LinkButton>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass animate-rise p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">On hand here</div>
          <div className={cx("mt-3 text-[30px] font-semibold leading-none tabular-nums tracking-[-0.03em]", low ? "text-bad" : "text-fg")}>{total} <span className="text-sm font-normal text-muted">{item.unit}</span></div>
          <div className="mt-2 text-xs text-muted">{low ? "At or below reorder level" : `${data.batches.length} batch${data.batches.length === 1 ? "" : "es"}`}</div>
        </div>
        <div className="glass animate-rise p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Value at cost</div>
          <div className="mt-3 text-[30px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-fg">{money(data.batches.reduce((s, b) => s + b.qtyOnHand * b.costMinor, 0), cur)}</div>
          <div className="mt-2 text-xs text-muted">Sell {money(item.sellPriceMinor, cur)} / {item.unit}</div>
        </div>
        <div className="glass animate-rise p-5 sm:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle"><Building2 className="h-3.5 w-3.5" />By branch</div>
          {data.perBranch.length === 0 ? <p className="text-sm text-muted">No stock in any branch.</p> : (
            <div className="flex flex-wrap gap-2">
              {data.perBranch.map((b) => <span key={b.branch} className="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm"><span className="text-muted">{b.branch}</span> <span className="font-semibold tabular-nums text-fg">{b.qty}</span></span>)}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel eyebrow="This branch" title="Batches by expiry" icon={<Boxes />}>
            {data.batches.length === 0 ? (
              <EmptyState icon={<PackagePlus />} title="No stock here">Receive stock to start — it will appear as a batch with its expiry.</EmptyState>
            ) : (
              <ol className="relative space-y-3 before:absolute before:inset-y-2 before:left-[7px] before:w-px before:bg-line">
                {data.batches.map((b) => {
                  const expired = !!b.expiry && b.expiry < today;
                  const soon = !expired && !!b.expiry && b.expiry <= addDays(today, 90);
                  return (
                    <li key={b.id} className="relative pl-7">
                      <span className={cx("absolute left-0 top-4 h-[15px] w-[15px] rounded-full border-2 border-canvas", expired ? "bg-bad" : soon ? "bg-warn" : "bg-ok")} aria-hidden />
                      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm text-fg">{b.batchNo ?? "no batch no."}</span>
                            <Badge tone={expired ? "red" : soon ? "yellow" : "green"}>{expired ? "expired" : b.expiry ? `exp ${dateOnly(b.expiry, "UTC")}` : "no expiry"}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted">{[b.supplier, `${money(b.costMinor, cur)} each`, `value ${money(b.qtyOnHand * b.costMinor, cur)}`].filter(Boolean).join(" · ")}</div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={cx("h-full rounded-full", expired ? "bg-bad" : soon ? "bg-warn" : "bg-aurora")} style={{ width: `${(b.qtyOnHand / Math.max(total, 1)) * 100}%` }} /></div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right"><div className="text-xl font-semibold tabular-nums text-fg">{b.qtyOnHand}</div><div className="text-[10px] uppercase tracking-[0.14em] text-subtle">{item.unit}</div></div>
                          {expired && write && <ActionButton action={expireBatchAction} fields={{ batchId: b.id }} variant="danger" confirm={`Write off ${b.qtyOnHand} expired ${item.unit}?`}>Write off</ActionButton>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          <Panel eyebrow="Audit trail" title="Movement ledger" icon={<History />}>
            <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Select name="type" defaultValue={type ?? ""} aria-label="Movement type"><option value="">All types</option>{stockMoveEnum.enumValues.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}</Select>
              <Select name="branch" defaultValue={branchFilter ?? ""} aria-label="Branch"><option value="">All branches</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              <Input type="date" name="from" defaultValue={from} aria-label="From" />
              <Input type="date" name="to" defaultValue={to} aria-label="To" />
              <Button variant="secondary"><Filter className="h-4 w-4" />Filter</Button>
            </form>
            <Table head={["When", "Type", "Qty", "Batch", "Branch", "Ref / reason", "By"]} empty="No movements in this period.">
              {data.moves.map(({ m, batchNo, branch, user }) => (
                <tr key={m.id}>
                  <Td className="text-muted">{dateTime(m.createdAt, tz)}</Td><Td><Badge tone={MOVE_TONE[m.type] ?? "gray"}>{m.type.replace("_", " ")}</Badge></Td>
                  <Td className={cx("font-semibold tabular-nums", m.qty < 0 ? "text-bad" : "text-ok")}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Td>
                  <Td className="font-mono text-xs">{batchNo}</Td><Td>{branch}</Td>
                  <Td className="max-w-xs truncate text-xs text-muted">{m.reason ?? (m.ref ? `ref ${m.ref.slice(0, 8)}` : "")}</Td><Td>{user}</Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>

        {write && (
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Panel eyebrow="Stock actions" title="Update stock" icon={<SlidersHorizontal />} glow>
              <ComposerTabs tabs={[
                { key: "receive", label: <><PackagePlus />Receive</>, content: (
                  <ActionForm action={receiveStockAction} resetOnSuccess className="space-y-4">
                    <input type="hidden" name="itemId" value={id} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Batch no."><Input name="batchNo" className="font-mono" /></Field>
                      <Field label="Expiry"><Input name="expiry" type="date" min={today} /></Field>
                      <Field label={`Quantity (${item.unit})`}><Input name="qty" type="number" min={1} required /></Field>
                      <Field label="Unit cost"><Input name="unitCost" inputMode="decimal" placeholder="0.00" /></Field>
                    </div>
                    <Field label="Supplier"><Input name="supplier" /></Field>
                    <Submit className="w-full">Receive stock</Submit>
                  </ActionForm>
                ) },
                ...(data.batches.length > 0 ? [{ key: "adjust", label: <><SlidersHorizontal />Adjust</>, content: (
                  <ActionForm action={adjustStockAction} resetOnSuccess className="space-y-4">
                    <Field label="Batch"><Select name="batchId">{data.batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}</Select></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Change" hint="-2 removes, 5 adds"><Input name="delta" type="number" required /></Field>
                      <Field label="Reason"><Select name="reason"><option value="damage">Damage</option><option value="count_correction">Count correction</option><option value="return">Patient return</option><option value="other">Other</option></Select></Field>
                    </div>
                    <Field label="Note"><Input name="note" /></Field>
                    <Submit variant="secondary" className="w-full">Adjust stock</Submit>
                  </ActionForm>
                ) }] : []),
                ...(data.batches.length > 0 && others.length > 0 ? [{ key: "transfer", label: <><ArrowLeftRight />Transfer</>, content: (
                  <ActionForm action={transferStockAction} resetOnSuccess className="space-y-4">
                    <Field label="Batch"><Select name="batchId">{data.batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}</Select></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="To"><Select name="toBranchId">{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
                      <Field label="Quantity"><Input name="qty" type="number" min={1} required /></Field>
                    </div>
                    <Submit variant="secondary" className="w-full">Transfer stock</Submit>
                  </ActionForm>
                ) }] : []),
                { key: "edit", label: <><Pencil />Edit</>, content: <ItemForm item={item} /> },
              ]} />
              <p className="mt-4 text-[11px] text-subtle">Expired batches are written off from the batch list.</p>
            </Panel>
          </aside>
        )}
      </div>
    </>
  );
}
