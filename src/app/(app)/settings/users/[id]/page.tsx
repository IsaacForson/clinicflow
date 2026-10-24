import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Card, LinkButton } from "@/components/ui";
import { users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { resetStaffPasswordAction, setStaffActiveAction, updateStaffAction } from "../actions";
import { StaffFields } from "../staff-fields";

export default async function EditStaffPage({ params }: PageProps<"/settings/users/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx("users.manage");
  const [u] = await tx(ctx, (t) => t.select().from(users).where(eq(users.id, id)));
  if (!u) notFound();
  const self = u.id === ctx.user.id;
  return (
    <div className="space-y-4">
      <Card title={`Edit ${u.name}`} actions={<LinkButton href="/settings/users" variant="ghost">Back to staff</LinkButton>}>
        <ActionForm action={updateStaffAction}>
          <input type="hidden" name="id" value={u.id} />
          <StaffFields u={u} branches={ctx.branches} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="scribeEnabled" defaultChecked={u.scribeEnabled} /> AI scribe enabled ({ctx.tenant.scribeSeats} seat{ctx.tenant.scribeSeats === 1 ? "" : "s"} on your subscription)
          </label>
          <Submit>Save changes</Submit>
        </ActionForm>
      </Card>
      <Card title="Access">
        <div className="space-y-3">
          <ActionForm action={resetStaffPasswordAction}>
            <input type="hidden" name="id" value={u.id} />
            <Submit variant="secondary">Reset password</Submit>
          </ActionForm>
          {!self && (u.active
            ? <ActionButton action={setStaffActiveAction} fields={{ id: u.id, active: "0" }} variant="danger" confirm={`Deactivate ${u.name}? They will be signed out everywhere. Their records stay.`}>Deactivate</ActionButton>
            : <ActionButton action={setStaffActiveAction} fields={{ id: u.id, active: "1" }}>Reactivate</ActionButton>)}
        </div>
      </Card>
    </div>
  );
}
