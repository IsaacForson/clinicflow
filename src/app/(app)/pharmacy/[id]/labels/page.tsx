import { and, eq, gt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Tags } from "lucide-react";
import { PrintButton } from "@/components/form";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { patients, prescriptionItems, prescriptions } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, fullName } from "@/lib/format";


export const metadata = { title: "Labels" };
/** One label per dispensed line, sized to cut from A4 or print on a label printer. */
export default async function DrugLabels({ params }: PageProps<"/pharmacy/[id]/labels">) {
  const { id } = await params;
  const ctx = await requireCtx("dispense");
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ rx: prescriptions, p: patients }).from(prescriptions).innerJoin(patients, eq(patients.id, prescriptions.patientId)).where(eq(prescriptions.id, id));
    if (!row) return null;
    await audit(t, ctx, "print", "drug_labels", id, { patientId: row.p.id });
    return { ...row, lines: await t.select().from(prescriptionItems).where(and(eq(prescriptionItems.prescriptionId, id), gt(prescriptionItems.dispensedQty, 0))) };
  });
  if (!data) notFound();
  const tn = ctx.tenant;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="print:hidden">
        <PageHeader icon={<Tags />} eyebrow="Dispense · print" title="Drug labels"
          subtitle={data.lines.length ? `${data.lines.length} label${data.lines.length > 1 ? "s" : ""} for ${fullName(data.p)}` : "Nothing dispensed yet."}
          actions={<><LinkButton variant="ghost" href={`/pharmacy/${id}`}>Back</LinkButton><PrintButton /></>} />
      </div>
      {data.lines.length === 0 ? (
        <EmptyState icon={<Tags />} title="No labels yet">Labels appear once items on this prescription are dispensed.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
          {data.lines.map((l) => (
            <div key={l.id} className="glass break-inside-avoid rounded-xl p-4 text-xs text-fg print:rounded print:border print:border-fg print:bg-transparent print:p-3 print:shadow-none">
              <div className="flex justify-between border-b border-line-strong pb-1.5 font-semibold"><span>{tn.name}</span><span className="text-muted">{tn.phone}</span></div>
              <div className="mt-2 text-sm font-bold">{l.drugName} <span className="font-normal tabular-nums text-muted">× {l.dispensedQty}</span></div>
              <div className="mt-1 text-sm">{[l.dose, l.route, l.frequency, l.duration && `for ${l.duration}`].filter(Boolean).join(" · ")}</div>
              {l.instructions && <div className="mt-0.5 italic">{l.instructions}</div>}
              <div className="mt-3 flex justify-between border-t border-line-strong pt-1.5">
                <span>{fullName(data.p)} <span className="font-mono text-muted">({data.p.patientNo})</span></span><span className="tabular-nums">{dateOnly(new Date(), tn.timezone)}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-subtle">Keep out of reach of children.</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
