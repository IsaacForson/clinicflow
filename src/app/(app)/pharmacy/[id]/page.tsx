import { and, eq, gt, gte, isNull, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Input, LinkButton, PageHeader, Select, Table, Td } from "@/components/ui";
import { allergies, items, patients, prescriptionItems, prescriptions, stockBatches, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateOnly, dateTime, fullName, localDay, money } from "@/lib/format";
import { allocateFefo } from "@/lib/inventory";
import { dispenseAction } from "../actions";

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
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Dispense · {fullName(p)} <Badge tone={rx.status === "dispensed" ? "green" : "yellow"}>{rx.status.replace("_", " ")}</Badge></span>}
        subtitle={[p.patientNo, p.sex, age(p.dob), `prescribed ${dateTime(rx.createdAt, tz)}`, data.prescriber && `by ${data.prescriber}`].filter(Boolean).join(" · ")}
        actions={<><LinkButton variant="secondary" href={`/pharmacy/${id}/labels`}>Print labels</LinkButton><LinkButton variant="ghost" href="/pharmacy">Back to queue</LinkButton></>}
      />
      {data.allergies.length > 0 && (
        <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">
          <strong>Allergies:</strong> {data.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ")}
        </div>
      )}
      {rx.notes && <p className="mb-4 rounded-md bg-slate-100 px-4 py-2 text-sm">{rx.notes}</p>}
      <Card title="Items" actions={<span className="text-xs text-slate-500">Stock is taken earliest-expiry first from this branch; expired batches are skipped.</span>}>
        <ActionForm action={dispenseAction}>
          <input type="hidden" name="prescriptionId" value={id} />
          <Table head={["Drug", "Directions", "Prescribed", "Dispensed", "Stock item", "Batches (FEFO)", "Dispense now"]}>
            {data.lines.map((li) => {
              const remaining = Math.max(0, li.quantity - li.dispensedQty);
              const itemId = li.itemId ?? guess(li.drugName);
              const it = data.items.find((i) => i.id === itemId);
              const avail = itemId ? onHand(itemId) : 0;
              const plan = itemId ? allocateFefo(data.batches.filter((b) => b.itemId === itemId), remaining, today) : null;
              return (
                <tr key={li.id} className="align-top">
                  <Td className="font-medium">{li.drugName}</Td>
                  <Td className="whitespace-normal text-xs">{[li.dose, li.route, li.frequency, li.duration].filter(Boolean).join(" · ")}{li.instructions && <div className="text-slate-500">{li.instructions}</div>}</Td>
                  <Td>{li.quantity}</Td>
                  <Td>{li.dispensedQty}</Td>
                  <Td>
                    {li.itemId || !open ? <span>{it ? `${it.name} ${it.strength ?? ""}` : "—"}</span> : (
                      <Select name={`item_${li.id}`} defaultValue={itemId ?? ""} className="w-48">
                        <option value="">Choose item…</option>
                        {data.items.map((i) => <option key={i.id} value={i.id}>{i.name} {i.strength ?? ""} ({onHand(i.id)})</option>)}
                      </Select>
                    )}
                    {it && <div className="mt-0.5 text-xs text-slate-500">{avail} {it.unit} on hand · {money(it.sellPriceMinor, ctx.tenant.currency)}</div>}
                  </Td>
                  <Td className="text-xs">
                    {plan?.allocations.map((a) => {
                      const b = data.batches.find((x) => x.id === a.batchId)!;
                      return <div key={a.batchId}>{b.batchNo ?? "no batch"} · exp {b.expiry ? dateOnly(b.expiry, "UTC") : "—"} · ×{a.qty}</div>;
                    })}
                    {plan && plan.short > 0 && remaining > 0 && <div className="text-red-600">Short by {plan.short}</div>}
                  </Td>
                  <Td>
                    {open && remaining > 0
                      ? <Input name={`qty_${li.id}`} type="number" min={0} max={remaining} defaultValue={Math.min(remaining, avail)} className="w-20" />
                      : <Badge tone="green">done</Badge>}
                  </Td>
                </tr>
              );
            })}
          </Table>
          {open && <Submit>Dispense &amp; add to bill</Submit>}
        </ActionForm>
      </Card>
    </>
  );
}
