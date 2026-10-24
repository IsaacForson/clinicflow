import { desc, eq } from "drizzle-orm";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, Table, Td } from "@/components/ui";
import { webhookDeliveries, webhooks } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { WEBHOOK_EVENTS } from "@/lib/events";
import { dateTime } from "@/lib/format";
import { createWebhookAction, deleteWebhookAction, testWebhookAction, updateWebhookAction } from "./actions";

function EventBoxes({ selected }: { selected?: string[] }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Events</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {WEBHOOK_EVENTS.map((e) => <label key={e} className="flex items-center gap-1"><input type="checkbox" name="events" value={e} defaultChecked={selected?.includes(e)} /> <code>{e}</code></label>)}
      </div>
    </fieldset>
  );
}

export default async function WebhooksPage() {
  const ctx = await requireCtx("api.manage");
  const [hooks, deliveries] = await tx(ctx, async (t) => [
    await t.select({ id: webhooks.id, url: webhooks.url, events: webhooks.events, active: webhooks.active }).from(webhooks).orderBy(desc(webhooks.createdAt)),
    await t.select({ d: webhookDeliveries, url: webhooks.url }).from(webhookDeliveries).innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .orderBy(desc(webhookDeliveries.createdAt)).limit(30),
  ] as const);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">ClinicFlow POSTs JSON to your URL when these events happen. Verify the <code className="rounded bg-slate-100 px-1">X-ClinicFlow-Signature</code> header (HMAC-SHA256 of the body with your signing secret).</p>
      {hooks.map((h) => (
        <Card key={h.id} title={<>{h.url} {!h.active && <Badge>Paused</Badge>}</>} actions={<>
          <ActionButton action={testWebhookAction} fields={{ id: h.id }}>Send test</ActionButton>
          <ActionButton action={deleteWebhookAction} fields={{ id: h.id }} variant="danger" confirm="Delete this webhook?">Delete</ActionButton>
        </>}>
          <ActionForm action={updateWebhookAction}>
            <input type="hidden" name="id" value={h.id} />
            <Field label="URL"><Input name="url" type="url" defaultValue={h.url} required /></Field>
            <EventBoxes selected={h.events} />
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={h.active} /> Active</label>
            <Submit variant="secondary">Save</Submit>
          </ActionForm>
        </Card>
      ))}
      <Card title="Add webhook">
        <ActionForm action={createWebhookAction} resetOnSuccess>
          <Field label="URL"><Input name="url" type="url" required placeholder="https://example.com/clinicflow" /></Field>
          <EventBoxes />
          <Submit>Add webhook</Submit>
        </ActionForm>
      </Card>
      <Card title="Recent deliveries">
        <Table head={["Time", "Event", "URL", "Status", "Response", "Attempts"]} empty="No deliveries yet.">
          {deliveries.map(({ d, url }) => (
            <tr key={d.id}>
              <Td>{dateTime(d.createdAt, ctx.tenant.timezone)}</Td>
              <Td><code>{d.event}</code></Td>
              <Td className="max-w-xs truncate">{url}</Td>
              <Td><Badge tone={d.status === "delivered" || d.status === "done" ? "green" : d.status === "failed" ? "red" : "gray"}>{d.status}</Badge></Td>
              <Td>{d.responseCode}</Td>
              <Td>{d.attempts}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
