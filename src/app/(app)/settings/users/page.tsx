import { asc, desc } from "drizzle-orm";
import { ShieldCheck, Sparkles, Stethoscope, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { Submit } from "@/components/form";
import { Avatar, Badge, cx, Panel, Progress, Table, Td } from "@/components/ui";
import { users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { PLANS } from "@/lib/plans";
import { SecretActionForm } from "../secret-form";
import { addStaffAction } from "./actions";
import { ROLE_TONE } from "./roles";
import { StaffFields } from "./staff-fields";

function Seat({ icon, label, used, of }: { icon: React.ReactNode; label: string; used: number; of: number }) {
  const full = used >= of;
  return (
    <div className="glass p-4 animate-rise">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">
        <span className="inline-flex items-center gap-2 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}{label}</span>
        {full && <Badge tone="yellow">Full</Badge>}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-fg">{used}<span className="text-sm font-normal text-muted"> / {of}</span></div>
      <Progress value={of ? (used / of) * 100 : 100} tone={full ? "yellow" : "purple"} className="mt-3" />
    </div>
  );
}

export default async function StaffPage() {
  const ctx = await requireCtx("users.manage");
  const rows = await tx(ctx, (t) => t.select().from(users).orderBy(desc(users.active), asc(users.name)));
  const plan = PLANS[ctx.tenant.plan];
  const active = rows.filter((u) => u.active);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Seat icon={<UsersRound />} label="Accounts" used={active.length} of={plan.users} />
        <Seat icon={<Stethoscope />} label="Practitioners" used={active.filter((u) => u.isPractitioner).length} of={plan.practitioners} />
        <Seat icon={<Sparkles />} label="AI scribe" used={active.filter((u) => u.scribeEnabled).length} of={ctx.tenant.scribeSeats} />
      </div>

      <Panel title="Team" eyebrow={`${active.length} active · ${rows.length - active.length} deactivated`} icon={<UsersRound />}>
        <Table head={["Person", "Role", "Login", "Last sign-in", "Security"]} empty="No staff yet.">
          {rows.map((u) => (
            <tr key={u.id} className={cx(!u.active && "opacity-50")}>
              <Td>
                <Link href={`/settings/users/${u.id}`} className="group flex items-center gap-3">
                  <Avatar name={u.name} />
                  <span className="min-w-0">
                    <span className="block font-medium text-fg group-hover:text-accent">{[u.title, u.name].filter(Boolean).join(" ")}</span>
                    {u.licenseNo && <span className="block font-mono text-xs text-muted">{u.licenseNo}</span>}
                  </span>
                </Link>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  {u.isPractitioner && <Badge tone="blue">Practitioner</Badge>}
                  {u.scribeEnabled && <Badge tone="purple">Scribe</Badge>}
                </div>
              </Td>
              <Td className="text-muted">{u.email ?? u.phone}</Td>
              <Td className="text-muted tabular-nums">{dateTime(u.lastLoginAt, ctx.tenant.timezone) || "Never"}</Td>
              <Td>
                <div className="flex gap-1.5">
                  {!u.active && <Badge>Deactivated</Badge>}
                  {u.totpEnabled ? <Badge tone="green">2FA</Badge> : u.active && <span className="text-xs text-subtle">No 2FA</span>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Invite a team member" eyebrow="New account" icon={<UserPlus />} glow>
        <SecretActionForm action={addStaffAction} resetOnSuccess>
          <StaffFields branches={ctx.branches} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="inline-flex items-center gap-2 text-xs text-subtle"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />A temporary password is generated and shown once after saving.</p>
            <Submit>Add team member</Submit>
          </div>
        </SecretActionForm>
      </Panel>
    </>
  );
}
