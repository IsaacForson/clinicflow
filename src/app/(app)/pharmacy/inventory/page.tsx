import { and, eq, gt, ilike, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, Input, LinkButton, PageHeader, Stat, Table, Td } from "@/components/ui";
import { items, stockBatches } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { addDays, dateOnly, localDay, money } from "@/lib/format";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/pharmacy/inventory">) {
  const ctx = await requireCtx("inventory.manage");
  const q = String((await searchParams).q ?? "").trim();
  const today = localDay(ctx.tenant.timezone);
  const branch = ctx.branches.find((b) => b.id === ctx.branchId)?.name;
  const { list, stock, expiring } = await tx(ctx, async (t) => ({
    list: await t.select().from(items)
      .where(q ? or(ilike(items.name, `%${q}%`), ilike(items.genericName, `%${q}%`), ilike(items.sku, `%${q}%`)) : undefined)
      .orderBy(sql`${items.favorite} desc`, items.name).limit(500),
    stock: await t.select({
      itemId: stockBatches.itemId,
      qty: sql<number>`coalesce(sum(${stockBatches.qtyOnHand}), 0)::int`,
      value: sql<number>`coalesce(sum(${stockBatches.qtyOnHand} * ${stockBatches.costMinor}), 0)::bigint`.mapWith(Number),
    }).from(stockBatches).where(eq(stockBatches.branchId, ctx.branchId)).groupBy(stockBatches.itemId),
    expiring: await t.select({ b: stockBatches, name: items.name }).from(stockBatches).innerJoin(items, eq(items.id, stockBatches.itemId))
      .where(and(eq(stockBatches.branchId, ctx.branchId), gt(stockBatches.qtyOnHand, 0), lte(stockBatches.expiry, addDays(today, 90))))
      .orderBy(stockBatches.expiry),
  }));
  const byItem = new Map(stock.map((s) => [s.itemId, s]));
  const low = list.filter((i) => i.active && i.reorderLevel > 0 && (byItem.get(i.id)?.qty ?? 0) <= i.reorderLevel);
  const cur = ctx.tenant.currency;
  return (
    <>
      <PageHeader title="Inventory" subtitle={`Stock on hand at ${branch ?? "this branch"}.`}
        actions={<><LinkButton href="/pharmacy/inventory/new">Add item</LinkButton><LinkButton variant="secondary" href="/pharmacy">Dispense queue</LinkButton></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Stock value (at cost)" value={money(stock.reduce((s, x) => s + x.value, 0), cur)} />
        <Stat label="Low stock" value={low.length} sub="At or below reorder level" />
        <Stat label="Expiring ≤ 90 days" value={expiring.length} sub={`${expiring.filter((e) => e.b.expiry! < today).length} already expired`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="mb-3"><Input name="q" defaultValue={q} placeholder="Search name, generic or SKU…" /></form>
          <Table head={["Item", "Form / strength", "On hand", "Reorder at", "Sell price", "Value"]} empty={q ? "No items match." : "No items yet."}>
            {list.map((i) => {
              const s = byItem.get(i.id);
              return (
                <tr key={i.id} className={i.active ? "hover:bg-slate-50" : "text-slate-400"}>
                  <Td>
                    <Link href={`/pharmacy/inventory/${i.id}`} className="font-medium text-teal-800 hover:underline">{i.favorite && "★ "}{i.name}</Link>
                    {i.genericName && <span className="ml-1 text-xs text-slate-500">{i.genericName}</span>} {!i.active && <Badge>inactive</Badge>}
                  </Td>
                  <Td>{[i.form, i.strength].filter(Boolean).join(" · ")}</Td>
                  <Td className={low.includes(i) ? "font-semibold text-red-700" : ""}>{s?.qty ?? 0} {i.unit}</Td>
                  <Td>{i.reorderLevel || "—"}</Td>
                  <Td>{money(i.sellPriceMinor, cur)}</Td>
                  <Td>{money(s?.value ?? 0, cur)}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="Low stock">
            <ul className="space-y-1 text-sm">
              {low.map((i) => <li key={i.id} className="flex justify-between"><Link href={`/pharmacy/inventory/${i.id}`} className="text-teal-800 hover:underline">{i.name}</Link><span className="text-red-700">{byItem.get(i.id)?.qty ?? 0} / {i.reorderLevel}</span></li>)}
              {low.length === 0 && <li className="text-slate-500">Nothing below reorder level.</li>}
            </ul>
          </Card>
          <Card title="Expiring within 90 days">
            <ul className="space-y-1 text-sm">
              {expiring.map(({ b, name }) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <Link href={`/pharmacy/inventory/${b.itemId}`} className="truncate text-teal-800 hover:underline">{name} <span className="text-xs text-slate-500">{b.batchNo}</span></Link>
                  <span className={b.expiry! < today ? "shrink-0 text-red-700" : "shrink-0 text-amber-700"}>{b.qtyOnHand} · {dateOnly(b.expiry, "UTC")}</span>
                </li>
              ))}
              {expiring.length === 0 && <li className="text-slate-500">No batches expiring soon.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
