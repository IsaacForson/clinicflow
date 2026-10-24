import { desc, eq } from "drizzle-orm";
import { Ban, Building2, CalendarPlus, CreditCard, Eye, NotebookPen, ScrollText, ShieldAlert, Trash2, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Avatar, Badge, Callout, Dl, Field, Input, Kpi, PageHeader, Panel, Select, Table, Td, Textarea, Timeline } from "@/components/ui";
import { adminDb } from "@/db";
import { billingEvents, platformAdmins, platformAudit, tenants, users } from "@/db/schema";
import { dateOnly, dateTime, money } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { platformCan, requireAdmin } from "@/lib/platform-auth";
import { clinicMrrUsd, clinicStats, deletionRequests } from "@/lib/platform-metrics";
import { PLANS } from "@/lib/plans";
import {
  deleteClinicAction, extendTrialAction, saveClinicNotesAction, setSuspendedAction, startSupportViewAction, updateClinicBillingAction,
} from "../../actions";

export const metadata = { title: "Clinic" };

const STATUS_TONE = { active: "green", trialing: "purple", past_due: "yellow", read_only: "red", cancelled: "gray", suspended: "red" } as const;

export default async function ClinicDetail({ params }: PageProps<"/admin/clinics/[id]">) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const role = ctx.admin.role;
  const db = adminDb();
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
  if (!t) notFound();
  const [stats, staff, events, log, [deletion]] = await Promise.all([
    clinicStats(id),
    db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, isPractitioner: users.isPractitioner })
      .from(users).where(eq(users.tenantId, id)).orderBy(users.createdAt),
    db.select().from(billingEvents).where(eq(billingEvents.tenantId, id)).orderBy(desc(billingEvents.createdAt)).limit(20),
    db.select({ l: platformAudit, by: platformAdmins.name }).from(platformAudit).leftJoin(platformAdmins, eq(platformAdmins.id, platformAudit.adminId))
      .where(eq(platformAudit.tenantId, id)).orderBy(desc(platformAudit.at)).limit(30),
    deletionRequests(id),
  ]);
  const st = t.suspendedAt ? "suspended" : t.planStatus;
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <>
      <PageHeader eyebrow="Clinic" icon={<Building2 />} title={t.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[st as keyof typeof STATUS_TONE] ?? "gray"}>{st.replace("_", " ")}</Badge>{PLANS[t.plan].name} · {t.billingCycle} · {t.country} · joined {dateOnly(t.createdAt, "UTC")}</span>} />

      {t.suspendedAt && <div className="mb-4"><Callout tone="red" icon={<Ban />}>Suspended {dateTime(t.suspendedAt, "UTC")}: {t.suspendReason}</Callout></div>}
      {deletion && <div className="mb-4"><Callout tone="yellow" icon={<Trash2 />}>Owner requested deletion on {dateOnly(deletion.requestedAt, "UTC")}{deletion.by ? ` (${deletion.by})` : ""}. Earliest deletion: {deletion.deleteAfter?.slice(0, 10)}.</Callout></div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="MRR" value={`$${Math.round(clinicMrrUsd(t))}`} sub={t.scribeSeats ? `incl. ${t.scribeSeats} scribe seats` : "no add-ons"} icon={<CreditCard />} />
        <Kpi label="Consultations" value={stats.visits30} sub="last 30 days" icon={<Users />} tone="teal" />
        <Kpi label="Patient payments" value={money(stats.gmv30, t.currency)} sub={`${stats.payments30} in 30 days`} icon={<CreditCard />} tone="green" />
        <Kpi label="Messages" value={stats.messages30} sub={`this month · ${stats.scribe30} scribe drafts`} icon={<ScrollText />} tone="blue" />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          <Panel title="Clinic details" icon={<Building2 />}>
            <Dl items={[
              ["Clinic ID", <span key="i" className="font-mono text-xs">{t.id}</span>], ["Slug", t.slug], ["Contact", [t.email, t.phone].filter(Boolean).join(" · ")],
              ["Address", t.address], ["Currency / timezone", `${t.currency} · ${t.timezone}`], ["Branches", stats.branches],
              ["Trial ends", t.trialEndsAt ? dateOnly(t.trialEndsAt, "UTC") : null], ["Period ends", t.currentPeriodEnd ? dateOnly(t.currentPeriodEnd, "UTC") : null],
              ["Open invoices", stats.invoicesOpen], ["Last staff login", stats.lastLogin ? dateTime(stats.lastLogin, "UTC") : "never"],
            ]} />
          </Panel>

          <Panel title="Staff accounts" eyebrow={`${staff.filter((s) => s.active).length} active`} icon={<Users />}>
            <Table head={["Name", "Role", "Login", "Last sign-in"]}>
              {staff.map((s) => (
                <tr key={s.id} className={s.active ? undefined : "opacity-50"}>
                  <Td><span className="flex items-center gap-2"><Avatar name={s.name} size="sm" />{s.name}</span></Td>
                  <Td><Badge tone={s.role === "owner" ? "purple" : "gray"}>{ROLE_LABELS[s.role]}</Badge></Td>
                  <Td className="text-xs text-muted">{s.email ?? s.phone}</Td>
                  <Td className="text-muted">{s.lastLoginAt ? dateTime(s.lastLoginAt, "UTC") : "never"}</Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel title="Subscription payments" icon={<CreditCard />}>
            <Table head={["When", "Event", "Amount", "Reference"]} empty="No subscription events yet.">
              {events.map((e) => (
                <tr key={e.id}>
                  <Td className="text-muted">{dateTime(e.createdAt, "UTC")}</Td><Td><Badge tone={e.type === "charge.success" ? "green" : e.type.includes("fail") || e.type.includes("disable") ? "red" : "gray"}>{e.type}</Badge></Td>
                  <Td className="tabular-nums">{e.amountMinor != null ? money(e.amountMinor, e.currency ?? "USD") : "—"}</Td><Td className="font-mono text-xs text-subtle">{e.providerRef}</Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel title="Control activity for this clinic" icon={<ScrollText />}>
            {log.length === 0 ? <p className="text-sm text-muted">No team actions yet.</p> : (
              <Timeline items={log.map(({ l, by }) => ({ id: l.id, title: l.action.replaceAll("_", " "), meta: `${by ?? "system"} · ${dateTime(l.at, "UTC")}`, tone: l.action.includes("delete") || l.action.includes("suspend") ? "red" : l.action.includes("support") ? "yellow" : "purple" }))} />
            )}
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-5">
          {platformCan(role, "clinics.impersonate") && (
            <Panel title="Support view" eyebrow="Read-only · audited" icon={<Eye />}>
              <p className="mb-3 text-sm text-muted">Open the clinic&apos;s app as its owner for one hour to troubleshoot. Nothing can be changed, and the clinic&apos;s own audit trail shows your visit.</p>
              <ActionForm action={startSupportViewAction} className="space-y-3">
                <input type="hidden" name="tenantId" value={t.id} />
                <Input name="reason" placeholder="Reason, e.g. ticket #1234 — reminders not sending" required minLength={5} />
                <Submit variant="secondary" className="w-full"><Eye className="h-4 w-4" />Open support view</Submit>
              </ActionForm>
            </Panel>
          )}

          {platformCan(role, "clinics.billing") && (
            <Panel title="Subscription" icon={<CreditCard />} glow>
              <ActionForm action={updateClinicBillingAction} className="grid gap-3 sm:grid-cols-2 [&>*]:mb-0!">
                <input type="hidden" name="tenantId" value={t.id} />
                <Field label="Plan"><Select name="plan" defaultValue={t.plan}>{Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.name} · ${p.priceUsd}</option>)}</Select></Field>
                <Field label="Status"><Select name="planStatus" defaultValue={t.planStatus}>{["trialing", "active", "past_due", "read_only", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></Field>
                <Field label="Billing cycle"><Select name="billingCycle" defaultValue={t.billingCycle}><option value="monthly">Monthly</option><option value="annual">Annual</option></Select></Field>
                <Field label="AI scribe seats"><Input name="scribeSeats" type="number" min={0} max={100} defaultValue={t.scribeSeats} /></Field>
                <Field label="Current period ends" className="sm:col-span-2"><Input name="currentPeriodEnd" type="date" defaultValue={day(t.currentPeriodEnd)} /></Field>
                <div className="sm:col-span-2"><Submit className="w-full">Save subscription</Submit></div>
              </ActionForm>
              <ActionForm action={extendTrialAction} className="mt-4 flex items-end gap-2 border-t border-line pt-4 [&>*]:mb-0!">
                <input type="hidden" name="tenantId" value={t.id} />
                <Field label="Extend trial by" className="flex-1"><Select name="days" defaultValue="7"><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></Select></Field>
                <Submit variant="secondary"><CalendarPlus className="h-4 w-4" />Extend</Submit>
              </ActionForm>
            </Panel>
          )}

          {platformCan(role, "clinics.notes") && (
            <Panel title="Internal notes" eyebrow="Only the ClinicFlow team sees these" icon={<NotebookPen />}>
              <ActionForm action={saveClinicNotesAction} className="space-y-3">
                <input type="hidden" name="tenantId" value={t.id} />
                <Textarea name="notes" rows={5} defaultValue={t.adminNotes ?? ""} placeholder="Onboarding status, contacts, agreements…" />
                <Submit variant="secondary" size="sm">Save notes</Submit>
              </ActionForm>
            </Panel>
          )}

          {(platformCan(role, "clinics.suspend") || platformCan(role, "clinics.delete")) && (
            <Panel title="Danger zone" icon={<ShieldAlert />} className="border-bad/30">
              {platformCan(role, "clinics.suspend") && (
                <ActionForm action={setSuspendedAction} className="space-y-3">
                  <input type="hidden" name="tenantId" value={t.id} />
                  <input type="hidden" name="suspend" value={t.suspendedAt ? "0" : "1"} />
                  {!t.suspendedAt && <Input name="reason" placeholder="Reason (abuse, fraud, legal request…)" />}
                  <p className="text-xs text-muted">{t.suspendedAt ? "Staff will be able to sign in again." : "Signs every staff member out and blocks sign-in. Data is not touched. For unpaid accounts use read-only status instead."}</p>
                  <Submit variant={t.suspendedAt ? "secondary" : "danger"} size="sm"><Ban className="h-4 w-4" />{t.suspendedAt ? "Reactivate clinic" : "Suspend clinic"}</Submit>
                </ActionForm>
              )}
              {platformCan(role, "clinics.delete") && deletion && (
                <ActionForm action={deleteClinicAction} className="mt-4 space-y-3 border-t border-line pt-4">
                  <input type="hidden" name="tenantId" value={t.id} />
                  <p className="text-xs text-muted">Permanently deletes every record and file of this clinic. Make sure the owner downloaded their export. Type <strong className="text-fg">{t.name}</strong> to confirm.</p>
                  <Input name="confirm" placeholder={t.name} autoComplete="off" />
                  <Submit variant="danger" size="sm"><Trash2 className="h-4 w-4" />Delete clinic permanently</Submit>
                </ActionForm>
              )}
            </Panel>
          )}
        </div>
      </section>
    </>
  );
}
