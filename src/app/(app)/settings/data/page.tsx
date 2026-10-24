import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { auditLog } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateOnly } from "@/lib/format";
import { cancelDeletionAction, requestDeletionAction } from "./actions";

export default async function DataOwnershipPage() {
  const ctx = await requireCtx("settings.manage");
  const [last] = await tx(ctx, (t) => t.select().from(auditLog)
    .where(and(eq(auditLog.entity, "tenant"), inArray(auditLog.action, ["deletion_request", "deletion_cancel"]))).orderBy(desc(auditLog.at)).limit(1));
  const pending = last?.action === "deletion_request" ? (last.details as { deleteAfter?: string } | null)?.deleteAfter : null;
  return (
    <div className="space-y-4">
      <Card title="Our promise: your data is yours">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-700">
          <p><strong>You own your clinic&apos;s data.</strong> Patient records, notes, bills and files belong to {ctx.tenant.name}, not to ClinicFlow. We hold them only to run the service for you.</p>
          <p><strong>Export anytime, free.</strong> One click on the <Link href="/settings/export" className="font-medium text-brand-800 underline">Export page</Link> gives you everything in open formats (CSV and JSON, plus your uploaded files). Export is included in every plan and is never a paid extra.</p>
          <p><strong>Never locked out.</strong> If a payment is missed, your account becomes read-only after a grace period. You can still sign in, look up every patient, print records and export — you just can&apos;t add new records until you renew.</p>
          <p><strong>We don&apos;t sell or share it.</strong> We never sell patient data or use it for advertising. Messages go to patients only for the purposes they agreed to.</p>
          <p><strong>Protected.</strong> Clinical notes and ID numbers are encrypted, every access to a patient record is logged in the <Link href="/settings/audit" className="font-medium text-brand-800 underline">audit log</Link>, and each clinic&apos;s data is isolated from every other clinic&apos;s at the database level.</p>
          <p><strong>Deleted when you ask.</strong> You can ask us to delete your account. We wait 30 days (in case of mistakes), then permanently delete your data from our systems; backups roll off within a further 30 days.</p>
        </div>
      </Card>
      {ctx.user.role === "owner" && (
        <Card title="Request account deletion">
          {pending ? (
            <ActionForm action={cancelDeletionAction}>
              <p className="text-sm text-red-700">Deletion has been requested. Your data will be permanently deleted after {dateOnly(pending, ctx.tenant.timezone)}.</p>
              <Submit variant="secondary">Cancel deletion request</Submit>
            </ActionForm>
          ) : (
            <ActionForm action={requestDeletionAction} className="max-w-xl">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li><Link href="/settings/export" className="font-medium text-brand-800 underline">Download a full export first</Link>. Medical records usually must be kept for years by law — keep your copy.</li>
                <li>After you request deletion, you have 30 days to change your mind. The account keeps working in the meantime.</li>
                <li>After 30 days all patient records, files and staff accounts are permanently deleted. This cannot be undone.</li>
              </ol>
              <Field label="Reason (optional)"><Textarea name="reason" rows={2} /></Field>
              <Field label='Type "DELETE" to confirm'><Input name="confirm" autoComplete="off" required /></Field>
              <Submit variant="danger">Request deletion</Submit>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
