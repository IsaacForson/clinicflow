import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { ArrowLeft, FilePlus2, ShieldCheck, Wallet, AlertCircle } from "lucide-react";
import { Avatar, Check, LinkButton, PageHeader, Panel } from "@/components/ui";
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
    return <><PageHeader title="New invoice" eyebrow="Billing" icon={<FilePlus2 />} subtitle="Pick the patient, then add lines on the invoice." /><PatientPicker ctx={ctx} q={String(sp.q ?? "").trim()} href="/billing/new" /></>;
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
      <PageHeader title="New invoice" eyebrow="Billing · Step 2" icon={<FilePlus2 />} subtitle="Confirm who pays, then start the invoice."
        actions={<LinkButton variant="ghost" href="/billing/new"><ArrowLeft className="h-4 w-4" aria-hidden />Change patient</LinkButton>} />
      <Panel className="mx-auto max-w-2xl" glow bodyClassName="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={fullName(data.p)} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-xl font-semibold tracking-tight text-fg">{fullName(data.p)}</div>
            <div className="font-mono text-xs text-muted">{data.p.patientNo}</div>
          </div>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {([
            [ShieldCheck, "Insurance", data.insurer ? `${data.insurer.name} · ${data.insurer.coveragePercent}%` : "None active", data.insurer ? `Member ${data.p.memberNo ?? "—"}` : "Patient pays all"],
            [AlertCircle, "Already owes", money(data.owed, cur), data.owed > 0 ? "Open balance" : "All settled"],
            [Wallet, "Account credit", money(data.credit, cur), data.credit > 0 ? "Can pay with credit" : "No credit"],
          ] as const).map(([Icon, k, v, sub]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle"><Icon className="h-3.5 w-3.5" aria-hidden />{k}</div>
              <div className="mt-2 truncate text-base font-semibold tabular-nums text-fg">{v}</div>
              <div className="text-xs text-muted">{sub}</div>
            </div>
          ))}
        </div>
        <ActionForm action={createInvoiceAction} onSuccessHref="/billing/{id}" className="space-y-4">
          <input type="hidden" name="patientId" value={data.p.id} />
          {data.insurer && (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <Check name="billInsurer" defaultChecked label={<>Bill to <strong>{data.insurer.name}</strong></>} />
            </div>
          )}
          <div className="flex justify-end"><Submit size="lg">Create invoice</Submit></div>
        </ActionForm>
      </Panel>
    </>
  );
}
