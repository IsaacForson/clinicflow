import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Table, Td } from "@/components/ui";
import { users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { PLANS } from "@/lib/plans";
import { addStaffAction } from "./actions";
import { StaffFields } from "./staff-fields";

export default async function StaffPage() {
  const ctx = await requireCtx("users.manage");
  const rows = await tx(ctx, (t) => t.select().from(users).orderBy(desc(users.active), asc(users.name)));
  const plan = PLANS[ctx.tenant.plan];
  const active = rows.filter((u) => u.active);
  return (
    <div className="space-y-4">
      <Card title="Staff" actions={
        <span className="text-xs text-slate-500">
          {active.length}/{plan.users} accounts · {active.filter((u) => u.isPractitioner).length}/{plan.practitioners} practitioners · {active.filter((u) => u.scribeEnabled).length}/{ctx.tenant.scribeSeats} AI scribe
        </span>
      }>
        <Table head={["Name", "Role", "Login", "Last sign-in", ""]}>
          {rows.map((u) => (
            <tr key={u.id} className={u.active ? "" : "opacity-50"}>
              <Td><Link href={`/settings/users/${u.id}`} className="font-medium text-brand-800 hover:underline">{[u.title, u.name].filter(Boolean).join(" ")}</Link></Td>
              <Td>{ROLE_LABELS[u.role]} {u.isPractitioner && <Badge tone="blue">Practitioner</Badge>} {u.scribeEnabled && <Badge tone="purple">Scribe</Badge>}</Td>
              <Td>{u.email ?? u.phone}</Td>
              <Td>{dateTime(u.lastLoginAt, ctx.tenant.timezone)}</Td>
              <Td>{!u.active && <Badge>Deactivated</Badge>} {u.totpEnabled && <Badge tone="green">2FA</Badge>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Add staff member">
        <ActionForm action={addStaffAction} resetOnSuccess>
          <StaffFields branches={ctx.branches} />
          <p className="text-xs text-slate-500">A temporary password is generated and shown once after saving.</p>
          <Submit>Add staff member</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
