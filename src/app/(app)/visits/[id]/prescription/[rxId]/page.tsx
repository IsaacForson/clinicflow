import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Dl } from "@/components/ui";
import { patients, prescriptionItems, prescriptions, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateOnly, fullName } from "@/lib/format";
import { PrintDoc } from "../../../letterhead";

export const metadata = { title: "Prescription" };

export default async function PrescriptionPage({ params }: PageProps<"/visits/[id]/prescription/[rxId]">) {
  const { id, rxId } = await params;
  const ctx = await requireCtx("clinical.read");
  const data = await tx(ctx, async (t) => {
    const [rx] = await t.select().from(prescriptions).where(and(eq(prescriptions.id, rxId), eq(prescriptions.visitId, id)));
    if (!rx) return null;
    await audit(t, ctx, "print", "prescription", rx.id, { patientId: rx.patientId });
    const [p] = await t.select().from(patients).where(eq(patients.id, rx.patientId));
    const [doc] = rx.prescriberId ? await t.select().from(users).where(eq(users.id, rx.prescriberId)) : [];
    return { rx, p, doc, lines: await t.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, rx.id)) };
  }).catch(() => null);
  if (!data) notFound();
  const { rx, p, doc } = data;
  const tz = ctx.tenant.timezone;
  return (
    <PrintDoc tenant={ctx.tenant} title="Prescription" backHref={`/visits/${id}`}>
      <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-4 print:rounded-none print:border-x-0 print:bg-transparent">
        <Dl items={[
          ["Patient", `${fullName(p)} (${p.patientNo})`], ["Age / sex", [age(p.dob), p.sex].filter(Boolean).join(" · ")],
          ["Address", p.address], ["Date", dateOnly(rx.createdAt, tz)],
        ]} />
      </div>
      <div className="mt-8 font-serif text-4xl font-bold leading-none text-accent print:text-fg" aria-hidden>℞</div>
      <ol className="mt-4 divide-y divide-line">
        {data.lines.map((l, i) => (
          <li key={l.id} className="flex gap-4 py-4">
            <span className="w-6 shrink-0 text-right font-mono text-xs text-subtle">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-base font-semibold text-fg">{l.drugName}</span>
                <span className="text-xs tabular-nums text-muted">Qty {l.quantity}</span>
              </div>
              <div className="text-fg">{[l.dose, l.route, l.frequency, l.duration && `for ${l.duration}`].filter(Boolean).join(" · ")}</div>
              {l.instructions && <div className="text-muted">{l.instructions}</div>}
            </div>
          </li>
        ))}
      </ol>
      {rx.notes && <p className="mt-4 rounded-xl border border-line px-4 py-3 text-muted"><span className="font-medium text-fg">Note:</span> {rx.notes}</p>}
      <footer className="mt-16 flex justify-end">
        <div className="w-64 border-t border-line-strong pt-2 text-center">
          <div className="font-medium text-fg">{doc ? [doc.title, doc.name].filter(Boolean).join(" ") : "Prescriber"}</div>
          {doc?.licenseNo && <div className="text-xs text-muted">Licence no. {doc.licenseNo}</div>}
        </div>
      </footer>
    </PrintDoc>
  );
}
