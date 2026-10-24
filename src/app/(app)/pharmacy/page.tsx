import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Package, Pill, Printer, Stethoscope } from "lucide-react";
import { Avatar, Badge, cx, EmptyState, LinkButton, ListRow, PageHeader, Panel } from "@/components/ui";
import { patients, prescriptionItems, prescriptions, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime, fullName } from "@/lib/format";
import { can } from "@/lib/permissions";

export const metadata = { title: "Pharmacy" };

export default async function PharmacyPage() {
  const ctx = await requireCtx("dispense");
  const { rows, lines } = await tx(ctx, async (t) => {
    const rows = await t.select({ rx: prescriptions, p: patients, prescriber: users.name }).from(prescriptions)
      .innerJoin(patients, eq(patients.id, prescriptions.patientId)).leftJoin(users, eq(users.id, prescriptions.prescriberId))
      .where(inArray(prescriptions.status, ["issued", "partially_dispensed"])).orderBy(prescriptions.createdAt).limit(200);
    const lines = rows.length ? await t.select().from(prescriptionItems).where(inArray(prescriptionItems.prescriptionId, rows.map((r) => r.rx.id))) : [];
    return { rows, lines };
  });
  const recent = await tx(ctx, (t) => t.select({ rx: prescriptions, p: patients }).from(prescriptions).innerJoin(patients, eq(patients.id, prescriptions.patientId))
    .where(eq(prescriptions.status, "dispensed")).orderBy(desc(prescriptions.createdAt)).limit(10));
  const tz = ctx.tenant.timezone;
  const waitMin = (d: Date) => Math.floor((Date.now() - d.getTime()) / 60_000);
  const wait = (d: Date) => { const m = waitMin(d); return m < 60 ? `${m}m` : m < 2880 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
  const partial = rows.filter((r) => r.rx.status === "partially_dispensed").length;
  return (
    <>
      <PageHeader icon={<Pill />} eyebrow="Dispensary" title="Pharmacy"
        subtitle={rows.length ? `${rows.length} prescription${rows.length > 1 ? "s" : ""} waiting${partial ? ` · ${partial} partly dispensed` : ""} · oldest first` : "No prescriptions waiting."}
        actions={can(ctx.user.role, "inventory.manage") && <LinkButton variant="secondary" href="/pharmacy/inventory"><Package className="h-4 w-4" />Inventory</LinkButton>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel eyebrow="Queue" title="Ready to dispense" icon={<Clock />} actions={<Badge tone={rows.length ? "yellow" : "green"} pulse={rows.length > 0}>{rows.length} waiting</Badge>} bodyClassName="p-3 sm:p-4">
          {rows.length === 0 ? (
            <EmptyState icon={<CheckCircle2 />} title="Nothing waiting">New prescriptions from consultations appear here automatically.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {rows.map(({ rx, p, prescriber }, idx) => {
                const rxLines = lines.filter((l) => l.prescriptionId === rx.id);
                const m = waitMin(rx.createdAt);
                return (
                  <li key={rx.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-px hover:border-line-strong hover:bg-surface-2 md:flex-row md:items-center">
                    <div className="flex min-w-0 items-center gap-3 md:w-60">
                      <span className="w-6 text-center font-mono text-xs text-subtle">{String(idx + 1).padStart(2, "0")}</span>
                      <Avatar name={fullName(p)} />
                      <div className="min-w-0">
                        <Link href={`/pharmacy/${rx.id}`} className="block truncate text-sm font-semibold text-fg hover:text-accent">{fullName(p)}</Link>
                        <span className="font-mono text-xs text-muted">{p.patientNo}</span>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {rxLines.map((l) => (
                        <span key={l.id} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs text-fg">
                          {l.drugName}<span className="tabular-nums text-muted">×{l.quantity}</span>
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted md:justify-end">
                      <span className="inline-flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{prescriber ?? "—"}</span>
                      <Badge tone={rx.status === "issued" ? "yellow" : "blue"}>{rx.status.replace("_", " ")}</Badge>
                      <span title={dateTime(rx.createdAt, tz)} className={cx("inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium tabular-nums", m > 60 ? "bg-bad/12 text-bad" : m > 20 ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok")}>
                        <Clock className="h-3.5 w-3.5" />{wait(rx.createdAt)}
                      </span>
                      <LinkButton size="sm" variant={idx === 0 ? "primary" : "secondary"} href={`/pharmacy/${rx.id}`}>Dispense<ArrowRight className="h-3.5 w-3.5" /></LinkButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel eyebrow="Done" title="Recently dispensed" icon={<CheckCircle2 />} bodyClassName="p-2">
          {recent.length === 0 ? <EmptyState compact icon={<Pill />} title="None yet" /> : recent.map(({ rx, p }) => (
            <ListRow key={rx.id} leading={<Avatar name={fullName(p)} size="sm" />} title={<Link href={`/pharmacy/${rx.id}`} className="hover:text-accent">{fullName(p)}</Link>} meta={dateTime(rx.createdAt, tz)}
              trailing={<LinkButton variant="ghost" size="sm" href={`/pharmacy/${rx.id}/labels`} aria-label={`Print labels for ${fullName(p)}`}><Printer className="h-3.5 w-3.5" />Labels</LinkButton>} />
          ))}
        </Panel>
      </div>
    </>
  );
}
