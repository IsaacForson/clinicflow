import { Banknote, FilePenLine, Receipt, Settings2, Trophy, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { A, Avatar, Badge, EmptyState, IconTile, LinkButton, Panel, Table, Td, type Tone } from "@/components/ui";
import type { Role } from "@/db/schema";
import { audit, requireCtx, tx } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { pickBranch, resolvePeriod } from "../lib";
import { team, type StaffRow } from "../queries";
import { ConsoleHeader } from "../ui";

export const metadata = { title: "Team · Admin console" };

export default async function TeamPage({ searchParams }: PageProps<"/clinic-admin/team">) {
  const ctx = await requireCtx("admin.console");
  const sp = await searchParams;
  const tz = ctx.tenant.timezone, cur = ctx.tenant.currency;
  const period = resolvePeriod(sp.period, tz);
  const branch = pickBranch(sp.branch, ctx.branches.map((b) => b.id));
  const branchIds = branch ? [branch] : ctx.branches.map((b) => b.id);

  const staff = await tx(ctx, async (t) => {
    await audit(t, ctx, "view", "clinic_admin", null, { details: { page: "team", period: period.key, branch } });
    return team(t, ctx, { branchIds, period });
  });
  const active = staff.filter((s) => s.active);
  const leaders: { key: keyof StaffRow; label: string; icon: ReactNode; tone: Tone; show: (s: StaffRow) => string }[] = [
    { key: "signed", label: "Notes signed", icon: <FilePenLine />, tone: "purple", show: (s) => `${s.signed} consultations` },
    { key: "collected", label: "Payments taken", icon: <Banknote />, tone: "green", show: (s) => `${money(s.collected, cur)} · ${s.payments}` },
    { key: "invoices", label: "Invoices created", icon: <Receipt />, tone: "blue", show: (s) => `${s.invoices} invoices` },
    { key: "patients", label: "Patients registered", icon: <UserPlus />, tone: "teal", show: (s) => `${s.patients} patients` },
  ];
  const manage = can(ctx.user.role, "users.manage");

  return (
    <>
      <ConsoleHeader ctx={ctx} current="team" period={period.key} branch={branch}
        subtitle={`${active.length} active staff · activity for ${period.label.toLowerCase()}`} />

      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Leaderboard">
          {leaders.map((l) => {
            const ranked = staff.filter((s) => Number(s[l.key]) > 0).sort((a, b) => Number(b[l.key]) - Number(a[l.key])).slice(0, 3);
            return (
              <Panel key={l.key} title={l.label} eyebrow="Top this period" icon={l.icon}>
                {ranked.length ? (
                  <ol className="space-y-3">
                    {ranked.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-3">
                        <span className="w-4 text-xs font-semibold tabular-nums text-subtle">{i + 1}</span>
                        <Avatar name={s.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-fg">{s.name}</div>
                          <div className="truncate text-xs tabular-nums text-muted">{l.show(s)}</div>
                        </div>
                        {i === 0 && <IconTile tone={l.tone} className="h-7 w-7 [&>svg]:h-3.5 [&>svg]:w-3.5"><Trophy /></IconTile>}
                      </li>
                    ))}
                  </ol>
                ) : <EmptyState title="No activity yet" compact />}
              </Panel>
            );
          })}
        </section>

        <Panel title="Staff" eyebrow={`${staff.length} accounts`} icon={<Users />}
          actions={manage && <LinkButton href="/settings/users" variant="secondary" size="sm"><Settings2 className="h-4 w-4" aria-hidden /> Manage staff</LinkButton>}>
          <Table head={["Name", "Role", "Status", "Last sign-in", "Notes signed", "Invoices", "Payments", "Patients"]} empty="No staff yet.">
            {staff.map((s) => (
              <tr key={s.id}>
                <Td>
                  <span className="inline-flex items-center gap-3">
                    <Avatar name={s.name} size="sm" />
                    {manage ? <A href={`/settings/users/${s.id}`}>{s.name}</A> : <span className="font-medium">{s.name}</span>}
                    {s.isPractitioner && <Badge tone="purple">Practitioner</Badge>}
                  </span>
                </Td>
                <Td className="text-muted">{ROLE_LABELS[s.role as Role] ?? s.role}</Td>
                <Td><Badge tone={s.active ? "green" : "gray"}>{s.active ? "Active" : "Deactivated"}</Badge></Td>
                <Td className="text-muted tabular-nums">{s.lastLoginAt ? dateTime(s.lastLoginAt, tz) : "Never"}</Td>
                <Td className="tabular-nums">{s.signed || <span className="text-subtle">0</span>}</Td>
                <Td className="tabular-nums">{s.invoices || <span className="text-subtle">0</span>}</Td>
                <Td className="tabular-nums">{s.payments ? <>{money(s.collected, cur)} <span className="text-xs text-muted">· {s.payments}</span></> : <span className="text-subtle">0</span>}</Td>
                <Td className="tabular-nums">{s.patients || <span className="text-subtle">0</span>}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-4 text-xs text-subtle">Counts come from the audit log for the whole clinic; payments are money received at {branch ? "this branch" : "your branches"}, refunds excluded.</p>
        </Panel>
      </div>
    </>
  );
}
