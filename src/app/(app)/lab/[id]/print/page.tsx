import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/form";
import { labOrderItems, labOrders, patients, users } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { age, dateOnly, dateTime, fullName } from "@/lib/format";

export default async function LabReportPrint({ params }: PageProps<"/lab/[id]/print">) {
  const { id } = await params;
  const ctx = await requireCtx("lab.result");
  const data = await tx(ctx, async (t) => {
    const [row] = await t.select({ o: labOrders, p: patients, doctor: users.name }).from(labOrders)
      .innerJoin(patients, eq(patients.id, labOrders.patientId)).leftJoin(users, eq(users.id, labOrders.orderedBy)).where(eq(labOrders.id, id));
    if (!row) return null;
    const items = await t.select().from(labOrderItems).where(eq(labOrderItems.orderId, id)).orderBy(labOrderItems.name);
    const ids = [...new Set(items.map((i) => i.resultedBy).filter((x): x is string => !!x))];
    const staff = ids.length ? await t.select({ id: users.id, name: users.name, title: users.title }).from(users).where(inArray(users.id, ids)) : [];
    await audit(t, ctx, "print", "lab_order", id, { patientId: row.p.id });
    return { ...row, items, staff };
  });
  if (!data) notFound();
  const { o, p } = data;
  const tn = ctx.tenant;
  const tz = tn.timezone;
  const resultedAt = data.items.reduce<Date | null>((m, i) => (i.resultedAt && (!m || i.resultedAt > m) ? i.resultedAt : m), null);
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-900 print:p-0">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton /></div>
      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold">{tn.name}</h1>
          {tn.letterhead && <p className="whitespace-pre-line text-xs">{tn.letterhead}</p>}
          <p className="text-xs">{[tn.address, tn.phone, tn.email].filter(Boolean).join(" · ")}</p>
          {tn.registrationNo && <p className="text-xs">Reg. no. {tn.registrationNo}</p>}
        </div>
        {tn.logoUrl && <img src={tn.logoUrl} alt="" className="h-16 w-auto" />}
      </header>
      <h2 className="mt-4 text-center text-base font-semibold uppercase tracking-wide">Laboratory report</h2>
      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
        <div><span className="text-slate-500">Patient:</span> <strong>{fullName(p)}</strong></div>
        <div><span className="text-slate-500">Patient no.:</span> {p.patientNo}</div>
        <div><span className="text-slate-500">Sex / age:</span> <span className="capitalize">{p.sex}</span>{p.dob && ` · ${age(p.dob)} (DOB ${dateOnly(p.dob, "UTC")})`}</div>
        <div><span className="text-slate-500">Requested by:</span> {data.doctor ?? "Walk-in"}</div>
        <div><span className="text-slate-500">Ordered:</span> {dateTime(o.createdAt, tz)}</div>
        <div><span className="text-slate-500">Reported:</span> {resultedAt ? dateTime(resultedAt, tz) : "Pending"}</div>
        {o.externalLab && <div className="col-span-2"><span className="text-slate-500">Performed by:</span> {o.externalLab}</div>}
      </section>
      <table className="mt-5 w-full border-collapse text-left">
        <thead><tr className="border-b border-slate-400 text-xs uppercase"><th className="py-1">Test</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Flag</th></tr></thead>
        <tbody>
          {data.items.map((i) => (
            <tr key={i.id} className="border-b border-slate-200 align-top">
              <td className="py-1.5 font-medium">{i.name}</td>
              <td className={i.flag && i.flag !== "normal" ? "font-bold" : ""}>
                {i.resultValue ?? (i.resultedAt ? "" : "Pending")}
                {i.resultText && <div className="whitespace-pre-wrap font-normal text-slate-700">{i.resultText}</div>}
              </td>
              <td>{i.unit}</td><td>{i.refRange}</td>
              <td className="uppercase">{i.flag && i.flag !== "normal" ? i.flag : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="mt-10 grid grid-cols-2 gap-6 text-xs">
        <div>Results entered by: {data.staff.map((s) => [s.title, s.name].filter(Boolean).join(" ")).join(", ") || "—"}</div>
        <div className="border-t border-slate-500 pt-1 text-center">Signature</div>
      </footer>
    </div>
  );
}
