import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Dl, Field, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { labOrderItems, labOrders, patients, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateTime, fullName } from "@/lib/format";
import { notifyPatientAction, saveResultAction, setExternalLabAction, setLabStatusAction } from "../actions";
import { FLAG_TONE, FLAGS, LAB_TONE, suggestFlag } from "../flag";

export default async function LabOrderPage({ params }: PageProps<"/lab/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("lab.result");
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ o: labOrders, p: patients, doctor: users.name }).from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId)).leftJoin(users, eq(users.id, labOrders.orderedBy)).where(eq(labOrders.id, id));
    if (!row) return null;
    await audit(t, ctx, "view", "lab_order", id, { patientId: row.p.id });
    return { ...row, items: await t.select().from(labOrderItems).where(eq(labOrderItems.orderId, id)).orderBy(labOrderItems.name) };
  });
  if (!data) notFound();
  const { o, p } = data;
  const tz = ctx.tenant.timezone;
  const open = o.status !== "cancelled" && ctx.access === "full";
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">Lab order · {fullName(p)} <Badge tone={LAB_TONE[o.status]}>{o.status}</Badge></span>}
        subtitle={[p.patientNo, p.sex, age(p.dob), `ordered ${dateTime(o.createdAt, tz)}`, data.doctor && `by ${data.doctor}`].filter(Boolean).join(" · ")}
        actions={<>
          {o.status === "ordered" && open && <ActionButton action={setLabStatusAction} fields={{ id, status: "collected" }} variant="primary" className="px-3 py-2 text-sm">Sample collected</ActionButton>}
          {(o.status === "resulted" || o.status === "notified") && open && (
            <ActionForm action={notifyPatientAction} className="inline-flex items-center gap-2 space-y-0">
              <input type="hidden" name="id" value={id} />
              <Submit variant={o.status === "notified" ? "secondary" : "primary"}>{o.status === "notified" ? "Notify again" : "Notify patient"}</Submit>
            </ActionForm>
          )}
          <LinkButton variant="secondary" href={`/lab/${id}/print`}>Print report</LinkButton>
          <LinkButton variant="ghost" href={`/patients/${p.id}`}>Patient</LinkButton>
          {(o.status === "ordered" || o.status === "collected") && open && <ActionButton action={setLabStatusAction} fields={{ id, status: "cancelled" }} variant="ghost" confirm="Cancel this lab order?">Cancel order</ActionButton>}
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {data.items.map((i) => (
            <Card key={i.id} title={<span className="flex items-center gap-2">{i.name} {i.flag && <Badge tone={FLAG_TONE[i.flag as keyof typeof FLAG_TONE] ?? "gray"}>{i.flag}</Badge>}</span>}
              actions={i.resultedAt && <span className="text-xs text-slate-500">Resulted {dateTime(i.resultedAt, tz)}</span>}>
              {open ? (
                <ActionForm action={saveResultAction}>
                  <input type="hidden" name="itemId" value={i.id} />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Value"><Input name="resultValue" defaultValue={i.resultValue ?? ""} inputMode="decimal" /></Field>
                    <Field label="Unit"><Input name="unit" defaultValue={i.unit ?? ""} /></Field>
                    <Field label="Reference range" hint='e.g. "3.5-5.0"'><Input name="refRange" defaultValue={i.refRange ?? ""} /></Field>
                    <Field label="Flag" hint={i.resultValue && suggestFlag(i.resultValue, i.refRange) ? `Suggested: ${suggestFlag(i.resultValue, i.refRange)}` : "Auto = from value and range"}>
                      <Select name="flag" defaultValue={i.flag ?? "auto"}>
                        <option value="auto">Auto</option>{FLAGS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Result / comment" hint="Stored encrypted"><Textarea name="resultText" defaultValue={i.resultText ?? ""} /></Field>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={i.documentId ? "Replace attached result" : "Attach result (PDF or image)"} className="flex-1">
                      <input type="file" name="file" accept="image/*,application/pdf" className="block w-full text-sm" />
                    </Field>
                    {i.documentId && <a href={`/api/files/${i.documentId}`} target="_blank" className="pb-2 text-sm text-teal-800 hover:underline">View attachment</a>}
                    <Submit>Save result</Submit>
                  </div>
                </ActionForm>
              ) : (
                <Dl items={[["Value", [i.resultValue, i.unit].filter(Boolean).join(" ")], ["Reference range", i.refRange], ["Result", i.resultText],
                  ["Attachment", i.documentId && <a href={`/api/files/${i.documentId}`} target="_blank" className="text-teal-800 hover:underline">View</a>]]} />
              )}
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="Order">
            <Dl items={[["Status", o.status], ["Notified", o.notifiedAt ? dateTime(o.notifiedAt, tz) : null], ["Notes", o.notes],
              ["Consultation", o.visitId && <Link className="text-teal-800 hover:underline" href={`/visits/${o.visitId}`}>Open</Link>]]} />
            {open && (
              <ActionForm action={setExternalLabAction} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <input type="hidden" name="id" value={id} />
                <Field label="External lab"><Input name="externalLab" defaultValue={o.externalLab ?? ""} placeholder="Done in-house" /></Field>
                <Submit variant="secondary">Save</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
