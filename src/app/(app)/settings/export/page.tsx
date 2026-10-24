import { desc, eq } from "drizzle-orm";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Table, Td } from "@/components/ui";
import { exportJobs, users } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { requestExportAction } from "./actions";

const TONE = { pending: "gray", running: "blue", done: "green", failed: "red" } as const;

export default async function ExportPage() {
  const ctx = await requireCtx("export");
  const jobs = await tx(ctx, (t) => t.select({ j: exportJobs, by: users.name }).from(exportJobs).leftJoin(users, eq(users.id, exportJobs.requestedBy)).orderBy(desc(exportJobs.createdAt)).limit(20));
  return (
    <div className="space-y-4">
      <Card title="Export all your data">
        <p className="mb-3 max-w-2xl text-sm text-slate-600">
          One file with everything: patients, consultations, diagnoses, prescriptions, lab results, invoices, payments, appointments, stock, messages, audit log and uploaded documents —
          as JSON plus spreadsheet-ready CSV files. Free on every plan, and available even if your subscription has lapsed.
        </p>
        <ActionForm action={requestExportAction}><Submit>Request full export</Submit></ActionForm>
        <p className="mt-2 text-xs text-slate-500">The file contains decrypted patient records. Store it securely.</p>
      </Card>
      <Card title="Past exports">
        <Table head={["Requested", "By", "Status", "Ready", ""]} empty="No exports yet.">
          {jobs.map(({ j, by }) => (
            <tr key={j.id}>
              <Td>{dateTime(j.createdAt, ctx.tenant.timezone)}</Td>
              <Td>{by}</Td>
              <Td><Badge tone={TONE[j.status as keyof typeof TONE] ?? "gray"}>{j.status}</Badge> {j.error && <span className="text-xs text-red-600">{j.error}</span>}</Td>
              <Td>{dateTime(j.completedAt, ctx.tenant.timezone)}</Td>
              <Td>{j.status === "done" && j.storageKey && (ctx.user.role === "owner"
                ? <a href={`/api/exports/${j.id}`} className="font-medium text-teal-800 hover:underline">Download .zip</a>
                : <span className="text-xs text-slate-500">Owner can download</span>)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
