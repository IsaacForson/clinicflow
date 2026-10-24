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
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <a href={`/lab/${id}`} className="text-sm text-muted hover:text-fg">← Back to order</a>
        <PrintButton />
      </div>
      <article className="glass p-8 text-sm text-fg sm:p-10 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-fg pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{tn.name}</h1>
            {tn.letterhead && <p className="whitespace-pre-line text-xs text-muted">{tn.letterhead}</p>}
            <p className="text-xs text-muted">{[tn.address, tn.phone, tn.email].filter(Boolean).join(" · ")}</p>
            {tn.registrationNo && <p className="text-xs text-muted">Reg. no. {tn.registrationNo}</p>}
          </div>
          {tn.logoUrl && <img src={tn.logoUrl} alt="" className="h-16 w-auto" />}
        </header>
        <h2 className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.3em] text-muted">Laboratory report</h2>
        <section className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-line p-4 sm:grid-cols-2 print:grid-cols-2">
          <div><span className="text-subtle">Patient:</span> <strong>{fullName(p)}</strong></div>
          <div><span className="text-subtle">Patient no.:</span> <span className="font-mono">{p.patientNo}</span></div>
          <div><span className="text-subtle">Sex / age:</span> <span className="capitalize">{p.sex}</span>{p.dob && ` · ${age(p.dob)} (DOB ${dateOnly(p.dob, "UTC")})`}</div>
          <div><span className="text-subtle">Requested by:</span> {data.doctor ?? "Walk-in"}</div>
          <div><span className="text-subtle">Ordered:</span> {dateTime(o.createdAt, tz)}</div>
          <div><span className="text-subtle">Reported:</span> {resultedAt ? dateTime(resultedAt, tz) : "Pending"}</div>
          {o.externalLab && <div className="sm:col-span-2"><span className="text-subtle">Performed by:</span> {o.externalLab}</div>}
        </section>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead><tr className="border-b border-line-strong text-[10px] uppercase tracking-[0.14em] text-subtle"><th className="py-2 pr-3">Test</th><th className="pr-3">Result</th><th className="pr-3">Unit</th><th className="pr-3">Reference range</th><th>Flag</th></tr></thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3 font-medium">{i.name}</td>
                  <td className={i.flag && i.flag !== "normal" ? "pr-3 font-bold tabular-nums" : "pr-3 tabular-nums"}>
                    {i.resultValue ?? (i.resultedAt ? "" : "Pending")}
                    {i.resultText && <div className="whitespace-pre-wrap font-normal text-muted">{i.resultText}</div>}
                  </td>
                  <td className="pr-3">{i.unit}</td><td className="pr-3">{i.refRange}</td>
                  <td className={i.flag === "critical" ? "font-semibold uppercase text-bad" : "font-semibold uppercase text-warn"}>{i.flag && i.flag !== "normal" ? i.flag : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="mt-14 grid grid-cols-2 gap-6 text-xs">
          <div className="text-muted">Results entered by: <span className="text-fg">{data.staff.map((s) => [s.title, s.name].filter(Boolean).join(" ")).join(", ") || "—"}</span></div>
          <div className="border-t border-fg pt-1 text-center text-muted">Signature</div>
        </footer>
      </article>
    </div>
  );
}
