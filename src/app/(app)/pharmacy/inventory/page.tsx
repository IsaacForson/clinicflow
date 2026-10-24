import { and, eq, gt, ilike, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Coins, Package, PackageOpen, Pill, Plus, Search, Star } from "lucide-react";
import { Badge, cx, EmptyState, Input, Kpi, LinkButton, PageHeader, Panel, Progress, Table, Td, Toolbar } from "@/components/ui";
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
  const expired = expiring.filter((e) => e.b.expiry! < today).length;
  return (
    <>
      <PageHeader icon={<Package />} eyebrow="Pharmacy · stock" title="Inventory" subtitle={`Stock on hand at ${branch ?? "this branch"}.`}
        actions={<><LinkButton variant="secondary" href="/pharmacy"><Pill className="h-4 w-4" />Dispense queue</LinkButton><LinkButton href="/pharmacy/inventory/new"><Plus className="h-4 w-4" />Add item</LinkButton></>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Stock value" icon={<Coins />} tone="teal" value={money(stock.reduce((s, x) => s + x.value, 0), cur)} sub="At cost price" />
        <Kpi label="Low stock" icon={<AlertTriangle />} tone={low.length ? "yellow" : "green"} value={low.length} sub="At or below reorder level" />
        <Kpi label="Expiring ≤ 90 days" icon={<CalendarClock />} tone={expired ? "red" : expiring.length ? "yellow" : "green"} value={expiring.length} sub={`${expired} already expired`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel eyebrow="Catalogue" title={`${list.length} item${list.length === 1 ? "" : "s"}`} icon={<PackageOpen />}>
          <Toolbar>
            <form className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input name="q" defaultValue={q} placeholder="Search name, generic or SKU…" className="pl-10" aria-label="Search items" />
            </form>
          </Toolbar>
          {list.length === 0 ? (
            <EmptyState icon={<Package />} title={q ? "No items match" : "No items yet"}>
              {q ? "Try a generic name or SKU." : <>Add your first item, then receive stock on its page.</>}
            </EmptyState>
          ) : (
            <Table head={["Item", "Stock level", "Reorder at", "Sell price", "Value"]}>
              {list.map((i) => {
                const s = byItem.get(i.id);
                const qty = s?.qty ?? 0;
                const isLow = low.includes(i);
                return (
                  <tr key={i.id} className={cx(!i.active && "opacity-50")}>
                    <Td>
                      <Link href={`/pharmacy/inventory/${i.id}`} className="flex items-center gap-1.5 font-medium text-fg hover:text-accent">
                        {i.favorite && <Star className="h-3.5 w-3.5 fill-current text-warn" aria-label="Favorite" />}{i.name} {!i.active && <Badge>inactive</Badge>}
                      </Link>
                      <div className="text-xs text-muted">{[i.genericName, i.form, i.strength].filter(Boolean).join(" · ")}</div>
                    </Td>
                    <Td className="min-w-40">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className={cx("font-semibold tabular-nums", isLow ? "text-bad" : "text-fg")}>{qty} <span className="font-normal text-muted">{i.unit}</span></span>
                        {isLow && <Badge tone="red">low</Badge>}
                      </div>
                      <Progress className="mt-1.5" tone={isLow ? "red" : qty > 0 ? "green" : "gray"} value={(qty / Math.max(i.reorderLevel * 3, qty, 1)) * 100} />
                    </Td>
                    <Td className="tabular-nums text-muted">{i.reorderLevel || "—"}</Td>
                    <Td className="tabular-nums">{money(i.sellPriceMinor, cur)}</Td>
                    <Td className="tabular-nums text-muted">{money(s?.value ?? 0, cur)}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel eyebrow="Reorder" title="Low stock" icon={<AlertTriangle />} bodyClassName="p-3">
            {low.length === 0 ? <EmptyState compact icon={<Package />} title="Nothing below reorder level" /> : (
              <ul className="space-y-1">
                {low.map((i) => (
                  <li key={i.id}>
                    <Link href={`/pharmacy/inventory/${i.id}`} className="block rounded-xl px-3 py-2 transition hover:bg-surface-2">
                      <div className="flex justify-between text-sm"><span className="truncate font-medium text-fg">{i.name}</span><span className="tabular-nums text-bad">{byItem.get(i.id)?.qty ?? 0} / {i.reorderLevel}</span></div>
                      <Progress className="mt-1.5" tone="red" value={((byItem.get(i.id)?.qty ?? 0) / Math.max(i.reorderLevel, 1)) * 100} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel eyebrow="Expiry" title="Expiring within 90 days" icon={<CalendarClock />} bodyClassName="p-3">
            {expiring.length === 0 ? <EmptyState compact icon={<CalendarClock />} title="No batches expiring soon" /> : (
              <ul className="space-y-1">
                {expiring.map(({ b, name }) => (
                  <li key={b.id}>
                    <Link href={`/pharmacy/inventory/${b.itemId}`} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-surface-2">
                      <span className="min-w-0 truncate"><span className="font-medium text-fg">{name}</span> <span className="font-mono text-xs text-muted">{b.batchNo}</span></span>
                      <Badge tone={b.expiry! < today ? "red" : "yellow"}>{b.qtyOnHand} · {dateOnly(b.expiry, "UTC")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
