import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Bell, CheckCircle2, ClipboardList, FileText, FlaskConical, Paperclip, Printer, Upload, User } from "lucide-react";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { A, Avatar, Badge, cx, Dl, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Select, Textarea } from "@/components/ui";
import { labOrderItems, labOrders, patients, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateTime, fullName } from "@/lib/format";
import { notifyPatientAction, saveResultAction, setExternalLabAction, setLabStatusAction } from "../actions";
import { FLAG_TONE, FLAGS, LAB_TONE, suggestFlag } from "../flag";
import { RangeBar } from "../range-bar";

const FLAG_ICON = { low: <ArrowDown />, high: <ArrowUp />, critical: <AlertTriangle />, normal: <CheckCircle2 /> } as const;
const FLAG_EDGE = { low: "before:bg-warn", high: "before:bg-warn", critical: "before:bg-bad", normal: "before:bg-ok" } as const;

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
  const done = data.items.filter((i) => i.resultedAt).length;
  const abnormal = data.items.filter((i) => i.flag && i.flag !== "normal").length;
  return (
    <>
      <PageHeader icon={<FlaskConical />} eyebrow="Result entry"
        title={<span className="flex flex-wrap items-center gap-3">{fullName(p)} <Badge tone={LAB_TONE[o.status]} pulse={o.status === "ordered" || o.status === "collected"}>{o.status}</Badge></span>}
        subtitle={[p.patientNo, p.sex, age(p.dob), `ordered ${dateTime(o.createdAt, tz)}`, data.doctor && `by ${data.doctor}`].filter(Boolean).join(" · ")}
        actions={<>
          <LinkButton variant="ghost" href={`/patients/${p.id}`}><User className="h-4 w-4" />Patient</LinkButton>
          <LinkButton variant="secondary" href={`/lab/${id}/print`}><Printer className="h-4 w-4" />Print report</LinkButton>
          {o.status === "ordered" && open && <ActionButton action={setLabStatusAction} fields={{ id, status: "collected" }} variant="primary" className="h-10 px-4 text-sm">Sample collected</ActionButton>}
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          {data.items.length === 0 && <EmptyState icon={<FlaskConical />} title="No tests on this order" />}
          {data.items.map((i) => {
            const flag = (i.flag ?? null) as keyof typeof FLAG_TONE | null;
            const suggested = i.resultValue ? suggestFlag(i.resultValue, i.refRange) : null;
            return (
              <section key={i.id} className={cx("glass relative animate-rise overflow-hidden p-5 before:absolute before:inset-y-0 before:left-0 before:w-1", flag ? FLAG_EDGE[flag] ?? "before:bg-line" : "before:bg-line")}>
                <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold tracking-tight text-fg">{i.name}</h2>
                    <p className="text-xs text-muted">{i.resultedAt ? `Resulted ${dateTime(i.resultedAt, tz)}` : "Awaiting result"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.resultValue && (
                      <span className={cx("text-2xl font-semibold tabular-nums tracking-tight", flag === "critical" ? "text-bad" : flag === "high" || flag === "low" ? "text-warn" : "text-fg")}>
                        {i.resultValue}<span className="ml-1 text-xs font-normal text-muted">{i.unit}</span>
                      </span>
                    )}
                    {flag && (
                      <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide [&>svg]:h-3.5 [&>svg]:w-3.5",
                        flag === "critical" ? "bg-bad/15 text-bad animate-pulse-ring" : flag === "normal" ? "bg-ok/12 text-ok" : "bg-warn/12 text-warn")}>
                        {FLAG_ICON[flag]}{flag}
                      </span>
                    )}
                  </div>
                </header>
                {i.resultValue && i.refRange && <div className="mb-7 max-w-md"><RangeBar value={i.resultValue} refRange={i.refRange} flag={flag} /></div>}
                {open ? (
                  <ActionForm action={saveResultAction} className="space-y-4">
                    <input type="hidden" name="itemId" value={i.id} />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="Value"><Input name="resultValue" defaultValue={i.resultValue ?? ""} inputMode="decimal" className="font-semibold tabular-nums" /></Field>
                      <Field label="Unit"><Input name="unit" defaultValue={i.unit ?? ""} /></Field>
                      <Field label="Reference range" hint='e.g. "3.5-5.0"'><Input name="refRange" defaultValue={i.refRange ?? ""} /></Field>
                      <Field label="Flag" hint={suggested ? `Suggested: ${suggested}` : "Auto = from value and range"}>
                        <Select name="flag" defaultValue={i.flag ?? "auto"}>
                          <option value="auto">Auto</option>{FLAGS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Result / comment" hint="Stored encrypted"><Textarea name="resultText" defaultValue={i.resultText ?? ""} /></Field>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3 transition hover:border-accent/60 hover:bg-accent/5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Upload className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-fg">{i.documentId ? "Replace attached result" : "Attach result (PDF or image)"}</span>
                          <input type="file" name="file" accept="image/*,application/pdf" className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-fg" />
                        </span>
                      </label>
                      {i.documentId && <a href={`/api/files/${i.documentId}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"><Paperclip className="h-4 w-4" />View attachment</a>}
                      <Submit variant="secondary">Save result</Submit>
                    </div>
                  </ActionForm>
                ) : (
                  <Dl items={[["Value", [i.resultValue, i.unit].filter(Boolean).join(" ")], ["Reference range", i.refRange], ["Result", i.resultText],
                    ["Attachment", i.documentId && <a href={`/api/files/${i.documentId}`} target="_blank" className="text-accent hover:underline">View</a>]]} />
                )}
              </section>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel glow={o.status === "resulted"} eyebrow="Progress" title={`${done} of ${data.items.length} resulted`} icon={<ClipboardList />}>
            <div className="mb-4 flex gap-1" aria-hidden>
              {data.items.map((i) => <span key={i.id} className={cx("h-1.5 flex-1 rounded-full", i.flag === "critical" ? "bg-bad" : i.flag && i.flag !== "normal" ? "bg-warn" : i.resultedAt ? "bg-ok" : "bg-surface-3")} />)}
            </div>
            {abnormal > 0 && <p className="mb-4 flex items-center gap-2 text-xs text-warn"><AlertTriangle className="h-3.5 w-3.5" />{abnormal} result{abnormal > 1 ? "s" : ""} outside range</p>}
            {(o.status === "resulted" || o.status === "notified") && open && (
              <ActionForm action={notifyPatientAction} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Submit variant={o.status === "notified" ? "secondary" : "primary"} size="lg" className="w-full"><Bell className="h-4 w-4" />{o.status === "notified" ? "Notify again" : "Notify patient"}</Submit>
              </ActionForm>
            )}
            {o.status !== "resulted" && o.status !== "notified" && <p className="text-xs text-muted">Save every result to notify the patient.</p>}
          </Panel>
          <Panel eyebrow="Order" title="Details" icon={<FileText />}>
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={fullName(p)} />
              <div className="min-w-0"><div className="truncate text-sm font-medium text-fg">{fullName(p)}</div><div className="font-mono text-xs text-muted">{p.patientNo}</div></div>
            </div>
            <Dl cols={1} items={[["Status", o.status], ["Notified", o.notifiedAt ? dateTime(o.notifiedAt, tz) : null], ["Notes", o.notes],
              ["Consultation", o.visitId && <A href={`/visits/${o.visitId}`}>Open</A>]]} />
            {open && (
              <ActionForm action={setExternalLabAction} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={id} />
                <Field label="External lab"><Input name="externalLab" defaultValue={o.externalLab ?? ""} placeholder="Done in-house" /></Field>
                <Submit variant="secondary" size="sm">Save</Submit>
              </ActionForm>
            )}
            {(o.status === "ordered" || o.status === "collected") && open && (
              <div className="mt-4 border-t border-line pt-4"><ActionButton action={setLabStatusAction} fields={{ id, status: "cancelled" }} variant="danger" confirm="Cancel this lab order?">Cancel order</ActionButton></div>
            )}
          </Panel>
          <p className="text-center text-xs text-subtle"><Link href="/lab" className="hover:text-fg">← Back to worklist</Link></p>
        </aside>
      </div>
    </>
  );
}
