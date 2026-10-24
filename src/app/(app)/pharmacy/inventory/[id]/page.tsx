import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { branches, items, stockBatches, stockMovements, stockMoveEnum, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, dateTime, dayRange, localDay, money } from "@/lib/format";
import { adjustStockAction, expireBatchAction, receiveStockAction, transferStockAction } from "../../actions";
import { ItemForm } from "../item-form";

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
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{item.name} {item.strength} {!item.active && <Badge>inactive</Badge>}</span>}
        subtitle={[item.genericName, item.form, `sold per ${item.unit} at ${money(item.sellPriceMinor, cur)}`, item.reorderLevel && `reorder at ${item.reorderLevel}`].filter(Boolean).join(" · ")}
        actions={<LinkButton variant="secondary" href="/pharmacy/inventory">All items</LinkButton>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Batches at this branch" actions={<span className="text-xs text-slate-500">{data.perBranch.map((b) => `${b.branch}: ${b.qty}`).join(" · ")}</span>}>
            <Table head={["Batch", "Expiry", "On hand", "Unit cost", "Value", "Supplier", ""]} empty="No stock here. Receive stock to start.">
              {data.batches.map((b) => {
                const expired = !!b.expiry && b.expiry < today;
                return (
                  <tr key={b.id}>
                    <Td className="font-mono text-xs">{b.batchNo ?? "—"}</Td>
                    <Td className={expired ? "text-red-700" : b.expiry && b.expiry <= addDays(today, 90) ? "text-amber-700" : ""}>{b.expiry ? dateOnly(b.expiry, "UTC") : "—"} {expired && <Badge tone="red">expired</Badge>}</Td>
                    <Td>{b.qtyOnHand}</Td><Td>{money(b.costMinor, cur)}</Td><Td>{money(b.qtyOnHand * b.costMinor, cur)}</Td><Td>{b.supplier}</Td>
                    <Td>{expired && write && <ActionButton action={expireBatchAction} fields={{ batchId: b.id }} variant="danger" confirm={`Write off ${b.qtyOnHand} expired ${item.unit}?`}>Write off</ActionButton>}</Td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card title="Movement ledger">
            <form className="mb-3 grid gap-2 sm:grid-cols-5">
              <Select name="type" defaultValue={type ?? ""}><option value="">All types</option>{stockMoveEnum.enumValues.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}</Select>
              <Select name="branch" defaultValue={branchFilter ?? ""}><option value="">All branches</option>{ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
              <Input type="date" name="from" defaultValue={from} aria-label="From" />
              <Input type="date" name="to" defaultValue={to} aria-label="To" />
              <button className="rounded-md bg-slate-100 px-3 py-2 text-sm hover:bg-slate-200">Filter</button>
            </form>
            <Table head={["When", "Type", "Qty", "Batch", "Branch", "Ref / reason", "By"]} empty="No movements in this period.">
              {data.moves.map(({ m, batchNo, branch, user }) => (
                <tr key={m.id}>
                  <Td>{dateTime(m.createdAt, tz)}</Td><Td className="capitalize">{m.type.replace("_", " ")}</Td>
                  <Td className={m.qty < 0 ? "text-red-700" : "text-emerald-700"}>{m.qty > 0 ? `+${m.qty}` : m.qty}</Td>
                  <Td className="font-mono text-xs">{batchNo}</Td><Td>{branch}</Td>
                  <Td className="max-w-xs truncate text-xs">{m.reason ?? (m.ref ? `ref ${m.ref.slice(0, 8)}` : "")}</Td><Td>{user}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="space-y-4">
          {write && (
            <Card title="Receive stock">
              <ActionForm action={receiveStockAction} resetOnSuccess>
                <input type="hidden" name="itemId" value={id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Batch no."><Input name="batchNo" /></Field>
                  <Field label="Expiry"><Input name="expiry" type="date" min={today} /></Field>
                  <Field label={`Quantity (${item.unit})`}><Input name="qty" type="number" min={1} required /></Field>
                  <Field label="Unit cost"><Input name="unitCost" inputMode="decimal" placeholder="0.00" /></Field>
                </div>
                <Field label="Supplier"><Input name="supplier" /></Field>
                <Submit>Receive</Submit>
              </ActionForm>
            </Card>
          )}
          {write && data.batches.length > 0 && (
            <Card title="Adjust stock">
              <ActionForm action={adjustStockAction} resetOnSuccess>
                <Field label="Batch"><Select name="batchId">{data.batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Change" hint="-2 removes, 5 adds"><Input name="delta" type="number" required /></Field>
                  <Field label="Reason"><Select name="reason"><option value="damage">Damage</option><option value="count_correction">Count correction</option><option value="return">Patient return</option><option value="other">Other</option></Select></Field>
                </div>
                <Field label="Note"><Input name="note" /></Field>
                <Submit variant="secondary">Adjust</Submit>
              </ActionForm>
            </Card>
          )}
          {write && data.batches.length > 0 && others.length > 0 && (
            <Card title="Transfer to another branch">
              <ActionForm action={transferStockAction} resetOnSuccess>
                <Field label="Batch"><Select name="batchId">{data.batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}</Select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="To"><Select name="toBranchId">{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
                  <Field label="Quantity"><Input name="qty" type="number" min={1} required /></Field>
                </div>
                <Submit variant="secondary">Transfer</Submit>
              </ActionForm>
            </Card>
          )}
          {write && (
            <Card title="Item details">
              <details><summary className="cursor-pointer text-sm text-brand-800">Edit item</summary><div className="mt-3"><ItemForm item={item} /></div></details>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
