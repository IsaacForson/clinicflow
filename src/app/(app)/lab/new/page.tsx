import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, FlaskConical, Microscope, ScanLine, Search, UserPlus } from "lucide-react";
import { ActionForm, Submit } from "@/components/form";
import { A, Avatar, EmptyState, Field, Input, LinkButton, PageHeader, Panel, Textarea } from "@/components/ui";
import { labTests, patients, services } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { age, e164, fullName, money } from "@/lib/format";
import { createLabOrderAction } from "../actions";

export default async function NewLabOrderPage({ searchParams }: PageProps<"/lab/new">) {
  const ctx = await requireCtx("lab.result");
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const patientId = typeof sp.patient === "string" && /^[0-9a-f-]{36}$/.test(sp.patient) ? sp.patient : null;
  const data = await tx(ctx, async (t) => {
    const [patient] = patientId ? await t.select().from(patients).where(eq(patients.id, patientId)) : [];
    const like = `%${q}%`;
    const phone = /\d{6,}/.test(q.replace(/\D/g, "")) ? e164(q, ctx.tenant.country) : null;
    const found = q && !patient ? await t.select().from(patients).where(and(isNull(patients.deletedAt), isNull(patients.mergedIntoId), or(
      ilike(patients.patientNo, like), ilike(sql`${patients.firstName} || ' ' || ${patients.lastName}`, like), ilike(patients.lastName, like),
      phone ? eq(patients.phone, phone) : undefined,
    ))).limit(20) : [];
    const tests = patient ? await t.select({ test: labTests, price: services.priceMinor }).from(labTests).leftJoin(services, eq(services.id, labTests.serviceId))
      .where(eq(labTests.active, true)).orderBy(labTests.kind, labTests.name) : [];
    return { patient, found, tests };
  });
  const { patient } = data;
  const step = (n: number, label: string, active: boolean) => (
    <li className={active ? "flex items-center gap-2 text-fg" : "flex items-center gap-2 text-subtle"}>
      <span className={active ? "grid h-6 w-6 place-items-center rounded-full bg-aurora text-xs font-semibold text-on-accent" : "grid h-6 w-6 place-items-center rounded-full border border-line text-xs"}>{n}</span>
      <span className="text-sm font-medium">{label}</span>
    </li>
  );
  return (
    <>
      <PageHeader icon={<FlaskConical />} eyebrow="Lab · walk-in" title="New lab order"
        subtitle="For walk-in, lab-only patients. Tests linked to a service are billed on a new invoice."
        actions={<LinkButton variant="ghost" href="/lab"><ArrowLeft className="h-4 w-4" />Worklist</LinkButton>} />
      <ol className="mb-6 flex flex-wrap items-center gap-4">
        {step(1, "Find the patient", !patient)}
        <span className="h-px w-8 bg-line" aria-hidden />
        {step(2, "Choose tests", !!patient)}
      </ol>
      {!patient ? (
        <Panel icon={<Search />} eyebrow="Step 1" title="Find the patient" className="mx-auto max-w-3xl">
          <form className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Name, phone or patient number…" autoFocus className="h-12 pl-10 text-base" aria-label="Search patients" />
          </form>
          {!q ? (
            <p className="py-6 text-center text-sm text-muted">Type a name, phone number or patient number and press Enter.</p>
          ) : data.found.length === 0 ? (
            <EmptyState icon={<UserPlus />} title="No match">
              <A href="/patients/new">Register the patient</A> first, then come back here.
            </EmptyState>
          ) : (
            <ul className="space-y-1">
              {data.found.map((p) => (
                <li key={p.id}>
                  <Link href={`/lab/new?patient=${p.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-surface-2">
                    <Avatar name={fullName(p)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{fullName(p)}</div>
                      <div className="truncate text-xs text-muted"><span className="font-mono">{p.patientNo}</span>{p.dob && ` · ${age(p.dob)}`}{p.phone && ` · ${p.phone}`}</div>
                    </div>
                    <span className="text-xs font-medium text-accent">Select →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel icon={<Microscope />} eyebrow="Step 2" title="Choose tests">
            {data.tests.length === 0 ? (
              <EmptyState icon={<FlaskConical />} title="No tests in the catalogue yet"><A href="/lab/tests">Add tests</A> to start ordering.</EmptyState>
            ) : (
              <ActionForm action={createLabOrderAction} onSuccessHref="/lab/{id}" className="space-y-5">
                <input type="hidden" name="patientId" value={patient.id} />
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {data.tests.map(({ test, price }) => (
                    <label key={test.id} className="group flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong hover:bg-surface-2 has-[:checked]:border-accent/60 has-[:checked]:bg-accent/10">
                      <input type="checkbox" name="testId" value={test.id} className="h-4 w-4 accent-[var(--accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-fg">{test.kind === "imaging" && <ScanLine className="h-3.5 w-3.5 text-accent-2" aria-label="Imaging" />}<span className="truncate">{test.name}</span></span>
                        <span className="text-xs tabular-nums text-muted">{price != null ? money(price, ctx.tenant.currency) : "not billed"}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="External lab (if sent out)"><Input name="externalLab" placeholder="Leave blank for in-house" /></Field>
                  <Field label="Notes"><Textarea name="notes" rows={1} /></Field>
                </div>
                <div className="flex justify-end"><Submit size="lg">Create order</Submit></div>
              </ActionForm>
            )}
          </Panel>
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Panel eyebrow="Patient">
              <div className="flex flex-col items-center gap-3 text-center">
                <Avatar name={fullName(patient)} size="lg" />
                <div>
                  <div className="text-base font-semibold text-fg">{fullName(patient)}</div>
                  <div className="font-mono text-xs text-muted">{patient.patientNo}</div>
                  <div className="mt-1 text-xs capitalize text-muted">{[patient.sex, patient.dob && age(patient.dob)].filter(Boolean).join(" · ")}</div>
                </div>
                <LinkButton variant="secondary" size="sm" href="/lab/new">Change patient</LinkButton>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
