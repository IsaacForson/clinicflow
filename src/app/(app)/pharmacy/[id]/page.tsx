import { and, eq, gt, gte, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { AlertTriangle, ArrowLeft, Boxes, CheckCircle2, ClipboardCheck, Pill, Printer, StickyNote } from "lucide-react";
import { Avatar, Badge, Callout, cx, EmptyState, LinkButton, PageHeader, Panel, Select } from "@/components/ui";
import { allergies, items, patients, prescriptionItems, prescriptions, stockBatches, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateOnly, dateTime, fullName, localDay, money } from "@/lib/format";
import { allocateFefo } from "@/lib/inventory";
import { dispenseAction } from "../actions";
import { QtyStepper } from "../qty-stepper";

export default async function DispensePage({ params }: PageProps<"/pharmacy/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("dispense");
  const today = localDay(ctx.tenant.timezone);
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ rx: prescriptions, p: patients, prescriber: users.name }).from(prescriptions)
      .innerJoin(patients, eq(patients.id, prescriptions.patientId)).leftJoin(users, eq(users.id, prescriptions.prescriberId)).where(eq(prescriptions.id, id));
    if (!row) return null;
    await audit(t, ctx, "view", "prescription", id, { patientId: row.p.id });
    return {
      ...row,
      lines: await t.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, id)).orderBy(prescriptionItems.drugName),
      allergies: await t.select().from(allergies).where(eq(allergies.patientId, row.p.id)),
      items: await t.select().from(items).where(eq(items.active, true)).orderBy(items.name),
      batches: await t.select().from(stockBatches).where(and(eq(stockBatches.branchId, ctx.branchId), gt(stockBatches.qtyOnHand, 0),
        or(isNull(stockBatches.expiry), gte(stockBatches.expiry, today)))).orderBy(stockBatches.expiry),
    };
  });
  if (!data) notFound();
  const { rx, p } = data;
  const tz = ctx.tenant.timezone;
  const onHand = (itemId: string) => data.batches.filter((b) => b.itemId === itemId).reduce((s, b) => s + b.qtyOnHand, 0);
  const guess = (drug: string) => data.items.find((i) => drug.toLowerCase().includes(i.name.toLowerCase()))?.id;
  const open = (rx.status === "issued" || rx.status === "partially_dispensed") && ctx.access === "full";
  const cur = ctx.tenant.currency;
  const plans = data.lines.map((li) => {
    const remaining = Math.max(0, li.quantity - li.dispensedQty);
    const itemId = li.itemId ?? guess(li.drugName);
    const it = data.items.find((i) => i.id === itemId);
    const avail = itemId ? onHand(itemId) : 0;
    const plan = itemId ? allocateFefo(data.batches.filter((b) => b.itemId === itemId), remaining, today) : null;
    return { li, remaining, itemId, it, avail, plan };
  });
  const todo = plans.filter((x) => x.remaining > 0);
  const short = todo.filter((x) => !x.plan || x.plan.short > 0).length;
  const estimate = todo.reduce((s, x) => s + (x.it ? Math.min(x.remaining, x.avail) * x.it.sellPriceMinor : 0), 0);
  return (
    <>
      <PageHeader icon={<Pill />} eyebrow="Dispense"
        title={<span className="flex flex-wrap items-center gap-3">{fullName(p)} <Badge tone={rx.status === "dispensed" ? "green" : "yellow"}>{rx.status.replace("_", " ")}</Badge></span>}
        subtitle={[p.patientNo, p.sex, age(p.dob), `prescribed ${dateTime(rx.createdAt, tz)}`, data.prescriber && `by ${data.prescriber}`].filter(Boolean).join(" · ")}
        actions={<><LinkButton variant="ghost" href="/pharmacy"><ArrowLeft className="h-4 w-4" />Queue</LinkButton><LinkButton variant="secondary" href={`/pharmacy/${id}/labels`}><Printer className="h-4 w-4" />Print labels</LinkButton></>}
      />
      <div className="mb-4 space-y-3">
        {data.allergies.length > 0 ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-bad/40 bg-bad/12 px-4 py-3 animate-rise">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bad/20 text-bad"><AlertTriangle className="h-[18px] w-[18px] animate-pulse-ring" /></span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bad">Allergies — check before dispensing</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.allergies.map((a) => <span key={a.id} className="rounded-lg border border-bad/30 bg-bad/10 px-2 py-0.5 text-sm font-medium text-fg">{a.substance}{a.reaction && <span className="text-muted"> · {a.reaction}</span>}</span>)}
              </div>
            </div>
          </div>
        ) : <Callout tone="green" icon={<CheckCircle2 />}>No known allergies recorded.</Callout>}
        {rx.notes && <Callout tone="blue" icon={<StickyNote />}>{rx.notes}</Callout>}
      </div>
      <ActionForm action={dispenseAction} className="grid gap-4 space-y-0 lg:grid-cols-[minmax(0,1fr)_320px] lg:[&>[role=alert]]:col-span-2 lg:[&>[role=status]]:col-span-2">
        <input type="hidden" name="prescriptionId" value={id} />
        <div className="space-y-3">
          <p className="flex items-center gap-2 px-1 text-xs text-muted"><Boxes className="h-3.5 w-3.5" />Stock is taken earliest-expiry first from this branch; expired batches are skipped.</p>
          {plans.length === 0 && <EmptyState icon={<Pill />} title="No items on this prescription" />}
          {plans.map(({ li, remaining, itemId, it, avail, plan }) => (
            <section key={li.id} className={cx("glass animate-rise p-5", remaining === 0 && "opacity-70")}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold tracking-tight text-fg">{li.drugName}</h3>
                  <p className="mt-0.5 text-xs text-muted">{[li.dose, li.route, li.frequency, li.duration].filter(Boolean).join(" · ")}</p>
                  {li.instructions && <p className="mt-1 text-xs italic text-subtle">{li.instructions}</p>}
                </div>
                <div className="flex items-center gap-4 text-center">
                  <div><div className="text-lg font-semibold tabular-nums text-fg">{li.quantity}</div><div className="text-[10px] uppercase tracking-[0.14em] text-subtle">Prescribed</div></div>
                  <div><div className="text-lg font-semibold tabular-nums text-fg">{li.dispensedQty}</div><div className="text-[10px] uppercase tracking-[0.14em] text-subtle">Given</div></div>
                  <div>
                    {open && remaining > 0
                      ? <QtyStepper name={`qty_${li.id}`} max={remaining} defaultValue={Math.min(remaining, avail)} label={`quantity of ${li.drugName}`} />
                      : <Badge tone="green">done</Badge>}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Stock item</div>
                  {li.itemId || !open ? <span className="text-sm text-fg">{it ? `${it.name} ${it.strength ?? ""}` : "—"}</span> : (
                    <Select name={`item_${li.id}`} defaultValue={itemId ?? ""} aria-label={`Stock item for ${li.drugName}`}>
                      <option value="">Choose item…</option>
                      {data.items.map((i) => <option key={i.id} value={i.id}>{i.name} {i.strength ?? ""} ({onHand(i.id)})</option>)}
                    </Select>
                  )}
                  {it && <div className="mt-1 text-xs text-muted"><span className="tabular-nums">{avail}</span> {it.unit} on hand · {money(it.sellPriceMinor, cur)}</div>}
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Batches (FEFO)</div>
                  {plan && plan.allocations.length > 0 ? (
                    <>
                      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        {plan.allocations.map((a, k) => <span key={a.batchId} className={k === 0 ? "bg-accent-2" : "bg-accent/70"} style={{ width: `${(a.qty / Math.max(remaining, 1)) * 100}%` }} />)}
                      </div>
                      <ul className="mt-2 space-y-1">
                        {plan.allocations.map((a, k) => {
                          const b = data.batches.find((x) => x.id === a.batchId)!;
                          return (
                            <li key={a.batchId} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">
                              <span className="flex items-center gap-2"><span className={cx("h-2 w-2 rounded-full", k === 0 ? "bg-accent-2" : "bg-accent/70")} /><span className="font-mono text-fg">{b.batchNo ?? "no batch"}</span></span>
                              <span className="text-muted">exp {b.expiry ? dateOnly(b.expiry, "UTC") : "—"}</span>
                              <span className="font-semibold tabular-nums text-fg">×{a.qty}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : remaining > 0 ? <span className="text-xs text-subtle">{itemId ? "No usable batches" : "Choose a stock item"}</span> : <span className="text-xs text-subtle">—</span>}
                  {plan && plan.short > 0 && remaining > 0 && <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-bad"><AlertTriangle className="h-3.5 w-3.5" />Short by {plan.short}</div>}
                </div>
              </div>
            </section>
          ))}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel glow={open} eyebrow="Summary" title="Ready to hand over" icon={<ClipboardCheck />}>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={fullName(p)} />
              <div className="min-w-0"><div className="truncate text-sm font-medium text-fg">{fullName(p)}</div><div className="font-mono text-xs text-muted">{p.patientNo}</div></div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Lines to dispense</dt><dd className="font-semibold tabular-nums text-fg">{todo.length} / {plans.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Short on stock</dt><dd className={cx("font-semibold tabular-nums", short ? "text-bad" : "text-ok")}>{short}</dd></div>
              <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Estimated charge</dt><dd className="text-lg font-semibold tabular-nums text-fg">{money(estimate, cur)}</dd></div>
            </dl>
            <p className="mt-1 text-[11px] text-subtle">At default quantities; final amount is added to the bill.</p>
            {open ? <Submit size="lg" className="mt-4 w-full">Dispense &amp; add to bill</Submit> : <p className="mt-4 text-sm text-muted">This prescription is closed.</p>}
          </Panel>
        </aside>
      </ActionForm>
    </>
  );
}
