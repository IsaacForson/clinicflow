import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { requireCtx } from "@/lib/auth";
import { saveRemindersAction } from "../actions";

export default async function RemindersPage() {
  const ctx = await requireCtx("settings.manage");
  return (
    <Card title="Reminders & notifiable diseases">
      <ActionForm action={saveRemindersAction} className="max-w-xl">
        <Field label="Send appointment reminders (hours before)" hint="Comma-separated, e.g. 24, 2. Reminders are always included in every plan.">
          <Input name="reminderHours" defaultValue={ctx.tenant.reminderHours.join(", ")} placeholder="24, 2" />
        </Field>
        <Field label="Notifiable ICD-10 codes" hint="Diagnoses with these codes are flagged for public-health reporting, e.g. A00 (cholera), A01.0 (typhoid), B50 (malaria).">
          <Textarea name="notifiableIcd" defaultValue={ctx.tenant.notifiableIcd.join(", ")} placeholder="A00, A01.0, A39, B05" />
        </Field>
        <Submit>Save</Submit>
      </ActionForm>
    </Card>
  );
}
