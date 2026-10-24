import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { integrations } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { removeIntegrationAction, saveIntegrationAction, testSendAction } from "./actions";
import { mask, PROVIDERS } from "./providers";

export default async function IntegrationsPage() {
  const ctx = await requireCtx("settings.manage");
  const rows = await tx(ctx, (t) => t.select().from(integrations));
  const byProvider = Object.fromEntries(rows.map((r) => [r.provider, { active: r.active, config: JSON.parse(r.config) as Record<string, string> }]));
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Connect your own accounts. Credentials are encrypted at rest and never shown in full again. Without your own, ClinicFlow&apos;s shared senders are used.</p>
      {Object.entries(PROVIDERS).map(([key, p]) => {
        const cur = byProvider[key];
        return (
          <Card key={key} title={<>{p.name} {cur && <Badge tone={cur.active ? "green" : "gray"}>{cur.active ? "Connected" : "Paused"}</Badge>}</>}
            actions={cur && <ActionButton action={removeIntegrationAction} fields={{ provider: key }} confirm={`Remove ${p.name} credentials?`}>Remove</ActionButton>}>
            <p className="mb-3 text-xs text-slate-500">{p.help}</p>
            <ActionForm action={saveIntegrationAction} className="grid items-end gap-2 sm:grid-cols-4">
              <input type="hidden" name="provider" value={key} />
              {p.fields.map((f) => (
                <Field key={f.key} label={f.label + (f.optional ? " (optional)" : "")}>
                  {f.secret
                    ? <Input name={f.key} type="password" autoComplete="off" placeholder={cur ? mask(cur.config[f.key]) : ""} />
                    : <Input name={f.key} defaultValue={cur?.config[f.key] ?? ""} />}
                </Field>
              ))}
              <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={cur?.active ?? true} /> Active</label>
              <Submit variant="secondary">Save</Submit>
            </ActionForm>
          </Card>
        );
      })}
      <Card title="Send a test message">
        <ActionForm action={testSendAction} className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Field label="Channel"><Select name="channel"><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></Select></Field>
          <Field label="Phone number"><Input name="to" type="tel" defaultValue={ctx.user.phone ?? ""} required /></Field>
          <Submit>Send test</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
