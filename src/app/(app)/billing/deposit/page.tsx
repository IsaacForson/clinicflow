import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeft, PiggyBank, Wallet } from "lucide-react";
import { Avatar, LinkButton, PageHeader, Panel } from "@/components/ui";
import { patients } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { patientCredit } from "@/lib/billing";
import { fullName, money } from "@/lib/format";
import { depositAction } from "../actions";
import { PatientPicker } from "../patient-picker";
import { PaymentForm } from "../payment-form";


export const metadata = { title: "Deposit" };
export default async function DepositPage({ searchParams }: PageProps<"/billing/deposit">) {
  const ctx = await requireCtx("payments.receive");
  const sp = await searchParams;
  const patientId = typeof sp.patient === "string" && /^[0-9a-f-]{36}$/.test(sp.patient) ? sp.patient : null;
  if (!patientId) return <><PageHeader title="Deposit / credit on account" eyebrow="Billing" icon={<PiggyBank />} subtitle="Take money up front; it is applied to future invoices." /><PatientPicker ctx={ctx} q={String(sp.q ?? "").trim()} href="/billing/deposit" /></>;
  const data = await tx(ctx, async (t) => {
    const [p] = await t.select().from(patients).where(eq(patients.id, patientId));
    return p ? { p, credit: await patientCredit(t, p.id) } : null;
  });
  if (!data) notFound();
  return (
    <>
      <PageHeader title="Deposit / credit on account" eyebrow="Billing" icon={<PiggyBank />} subtitle="Take money up front; it is applied to future invoices."
        actions={<LinkButton variant="ghost" href="/billing/deposit"><ArrowLeft className="h-4 w-4" aria-hidden />Change patient</LinkButton>} />
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Panel title="Record deposit" eyebrow="Payment" icon={<Wallet />} glow className="order-2 lg:order-1">
          <PaymentForm action={depositAction} patientId={data.p.id} currency={ctx.tenant.currency} clientId={crypto.randomUUID()}
            methods={["cash", "mobile_money", "card", "bank"]} submitLabel="Record deposit" onSuccessHref="/billing/receipt/{id}" />
        </Panel>
        <Panel className="order-1 lg:order-2 lg:self-start" bodyClassName="p-5 text-center">
          <Avatar name={fullName(data.p)} size="lg" className="mx-auto" />
          <div className="mt-3 font-semibold text-fg">{fullName(data.p)}</div>
          <div className="font-mono text-xs text-muted">{data.p.patientNo}</div>
          <div className="mt-5 rounded-2xl border border-line bg-surface-2 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Current credit</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{money(data.credit, ctx.tenant.currency)}</div>
          </div>
        </Panel>
      </div>
    </>
  );
}
