import { BellRing, ShieldAlert } from "lucide-react";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Field, Input, Panel, Textarea } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { saveRemindersAction } from "../actions";

export default async function RemindersPage() {
  const ctx = await requireCtx("settings.manage");
  const hours = [...ctx.tenant.reminderHours].sort((a, b) => b - a);
  return (
    <ActionForm action={saveRemindersAction} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Appointment reminders" eyebrow="Included in every plan" icon={<BellRing />}>
          <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Current reminder schedule">
            {hours.length ? hours.map((h) => (
              <span key={h} className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/12 px-3 py-1 text-xs font-medium text-accent tabular-nums">
                <BellRing className="h-3 w-3" aria-hidden />{h}h before
              </span>
            )) : <span className="text-sm text-subtle">No reminders scheduled.</span>}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs font-medium text-muted">Appointment</span>
          </div>
          <Field label="Send reminders (hours before)" hint="Comma-separated, e.g. 24, 2. Reminders are always included in every plan.">
            <Input name="reminderHours" defaultValue={ctx.tenant.reminderHours.join(", ")} placeholder="24, 2" className="font-mono" />
          </Field>
        </Panel>
        <Panel title="Notifiable diseases" eyebrow="Public-health reporting" icon={<ShieldAlert />}>
          <div className="mb-5 flex flex-wrap gap-1.5">
            {ctx.tenant.notifiableIcd.length ? ctx.tenant.notifiableIcd.map((c) => <Badge key={c} tone="yellow">{c}</Badge>) : <span className="text-sm text-subtle">No codes configured yet.</span>}
          </div>
          <Field label="Notifiable ICD-10 codes" hint="Diagnoses with these codes are flagged for public-health reporting, e.g. A00 (cholera), A01.0 (typhoid), B50 (malaria).">
            <Textarea name="notifiableIcd" defaultValue={ctx.tenant.notifiableIcd.join(", ")} placeholder="A00, A01.0, A39, B05" className="font-mono" />
          </Field>
        </Panel>
      </div>
      <div className="flex justify-end"><Submit>Save reminder settings</Submit></div>
    </ActionForm>
  );
}
