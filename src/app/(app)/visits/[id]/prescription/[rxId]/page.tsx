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
      <div className="mt-4"><Dl items={[
        ["Patient", `${fullName(p)} (${p.patientNo})`], ["Age / sex", [age(p.dob), p.sex].filter(Boolean).join(" · ")],
        ["Address", p.address], ["Date", dateOnly(rx.createdAt, tz)],
      ]} /></div>
      <div className="mt-5 text-2xl font-serif font-bold">℞</div>
      <ol className="mt-2 list-decimal space-y-3 pl-6">
        {data.lines.map((l) => (
          <li key={l.id}>
            <div className="font-semibold">{l.drugName}</div>
            <div>{[l.dose, l.route, l.frequency, l.duration && `for ${l.duration}`].filter(Boolean).join(" · ")} <span className="text-slate-600">— Qty: {l.quantity}</span></div>
            {l.instructions && <div className="text-slate-600">{l.instructions}</div>}
          </li>
        ))}
      </ol>
      {rx.notes && <p className="mt-4 text-slate-700">Note: {rx.notes}</p>}
      <footer className="mt-16 flex justify-end">
        <div className="w-64 border-t border-slate-400 pt-1 text-center">
          <div className="font-medium">{doc ? [doc.title, doc.name].filter(Boolean).join(" ") : "Prescriber"}</div>
          {doc?.licenseNo && <div className="text-xs text-slate-600">Licence no. {doc.licenseNo}</div>}
        </div>
      </footer>
    </PrintDoc>
  );
}
