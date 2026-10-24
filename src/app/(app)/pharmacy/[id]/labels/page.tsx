import { and, eq, gt } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/form";
import { patients, prescriptionItems, prescriptions } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateOnly, fullName } from "@/lib/format";

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
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">{data.lines.length ? `${data.lines.length} label(s)` : "Nothing dispensed yet."}</p>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-3 print:gap-2">
        {data.lines.map((l) => (
          <div key={l.id} className="break-inside-avoid rounded border border-slate-800 bg-white p-3 text-xs text-slate-900">
            <div className="flex justify-between border-b border-slate-300 pb-1 font-semibold"><span>{tn.name}</span><span>{tn.phone}</span></div>
            <div className="mt-1 text-sm font-bold">{l.drugName} <span className="font-normal">× {l.dispensedQty}</span></div>
            <div className="mt-1 text-sm">{[l.dose, l.route, l.frequency, l.duration && `for ${l.duration}`].filter(Boolean).join(" · ")}</div>
            {l.instructions && <div className="mt-0.5 italic">{l.instructions}</div>}
            <div className="mt-2 flex justify-between border-t border-slate-300 pt-1">
              <span>{fullName(data.p)} ({data.p.patientNo})</span><span>{dateOnly(new Date(), tn.timezone)}</span>
            </div>
            <div className="text-[10px] text-slate-500">Keep out of reach of children.</div>
          </div>
        ))}
      </div>
    </div>
  );
}
