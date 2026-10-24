import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { patientCredit } from "@/lib/billing";
import { fullName, money } from "@/lib/format";
import { depositAction } from "../actions";
import { PatientPicker } from "../patient-picker";
import { PaymentForm } from "../payment-form";

export default async function DepositPage({ searchParams }: PageProps<"/billing/deposit">) {
  const ctx = await requireCtx("payments.receive");
  const sp = await searchParams;
  const patientId = typeof sp.patient === "string" && /^[0-9a-f-]{36}$/.test(sp.patient) ? sp.patient : null;
  if (!patientId) return <><PageHeader title="Deposit / credit on account" /><PatientPicker ctx={ctx} q={String(sp.q ?? "").trim()} href="/billing/deposit" /></>;
  const data = await tx(ctx, async (t) => {
    const [p] = await t.select().from(patients).where(eq(patients.id, patientId));
    return p ? { p, credit: await patientCredit(t, p.id) } : null;
  });
  if (!data) notFound();
  return (
    <>
      <PageHeader title="Deposit / credit on account" subtitle={`${fullName(data.p)} · ${data.p.patientNo} · current credit ${money(data.credit, ctx.tenant.currency)}`} />
      <Card className="max-w-2xl">
        <PaymentForm action={depositAction} patientId={data.p.id} currency={ctx.tenant.currency} clientId={crypto.randomUUID()}
          methods={["cash", "mobile_money", "card", "bank"]} submitLabel="Record deposit" onSuccessHref="/billing/receipt/{id}" />
      </Card>
    </>
  );
}
