import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, Dl, PageHeader } from "@/components/ui";
import { patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { activeInsurer, outstandingForPatient, patientCredit } from "@/lib/billing";
import { fullName, money } from "@/lib/format";
import { createInvoiceAction } from "../actions";
import { PatientPicker } from "../patient-picker";

export default async function NewInvoicePage({ searchParams }: PageProps<"/billing/new">) {
  const ctx = await requireCtx("billing.write");
  const sp = await searchParams;
  const patientId = typeof sp.patient === "string" ? sp.patient : null;
  if (!patientId || !/^[0-9a-f-]{36}$/.test(patientId)) {
    return <><PageHeader title="New invoice" /><PatientPicker ctx={ctx} q={String(sp.q ?? "").trim()} href="/billing/new" /></>;
  }
  const data = await tx(ctx, async (t) => {
    const [p] = await t.select().from(patients).where(eq(patients.id, patientId));
    if (!p) return null;
    return { p, insurer: await activeInsurer(t, p.id), owed: await outstandingForPatient(t, p.id), credit: await patientCredit(t, p.id) };
  });
  if (!data) notFound();
  const cur = ctx.tenant.currency;
  return (
    <>
      <PageHeader title="New invoice" subtitle={`${fullName(data.p)} · ${data.p.patientNo}`} />
      <Card className="max-w-xl">
        <Dl items={[["Insurance", data.insurer ? `${data.insurer.name} (${data.insurer.coveragePercent}%) · ${data.p.memberNo ?? ""}` : "None active"], ["Already owes", money(data.owed, cur)], ["Account credit", money(data.credit, cur)]]} />
        <ActionForm action={createInvoiceAction} onSuccessHref="/billing/{id}" className="mt-4">
          <input type="hidden" name="patientId" value={data.p.id} />
          {data.insurer && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="billInsurer" defaultChecked className="h-4 w-4" /> Bill to {data.insurer.name}</label>
          )}
          <Submit>Create invoice</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
