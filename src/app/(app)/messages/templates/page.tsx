import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageHeader, Textarea, cx } from "@/components/ui";
import { messageTemplates } from "@/db/schema";
import { requireCtx, tx } from "@/lib/auth";
import { DEFAULT_TEMPLATES } from "@/lib/messaging";
import { can } from "@/lib/permissions";
import { saveTemplateAction } from "../actions";
import { MessageTabs } from "../tabs";

export const metadata = { title: "Message templates" };

const placeholders = (body: string) => [...new Set([...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

export default async function TemplatesPage({ searchParams }: PageProps<"/messages/templates">) {
  const ctx = await requireCtx("messaging.send");
  const sp = await searchParams;
  const rows = await tx(ctx, (t) => t.select().from(messageTemplates).orderBy(messageTemplates.key, messageTemplates.language));
  const keys = [...new Set([...Object.keys(DEFAULT_TEMPLATES), ...rows.map((r) => r.key)])].sort();
  const key = typeof sp.key === "string" && keys.includes(sp.key) ? sp.key : keys[0];
  const lang = typeof sp.lang === "string" && /^[a-z]{2,3}$/.test(sp.lang) ? sp.lang : "en";
  const current = rows.find((r) => r.key === key && r.language === lang);
  const body = current?.body ?? DEFAULT_TEMPLATES[key] ?? "";
  const langs = [...new Set(["en", ...rows.filter((r) => r.key === key).map((r) => r.language)])];
  const editable = can(ctx.user.role, "settings.manage") && ctx.access === "full";

  return (
    <>
      <PageHeader title="Messages" />
      <MessageTabs current="templates" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Templates">
          <ul className="space-y-0.5 text-sm">
            {keys.map((k) => (
              <li key={k}><Link href={`/messages/templates?key=${k}`} className={cx("flex justify-between rounded px-2 py-1.5", k === key ? "bg-teal-50 text-teal-800" : "hover:bg-slate-50")}>
                <span>{k.replace(/_/g, " ")}</span>
                {rows.some((r) => r.key === k && r.waTemplateName) && <Badge tone="green">WA</Badge>}
              </Link></li>
            ))}
          </ul>
        </Card>
        <Card title={`${key.replace(/_/g, " ")} · ${lang}`} className="lg:col-span-2"
          actions={<div className="flex gap-1">{langs.map((l) => <Link key={l} href={`/messages/templates?key=${key}&lang=${l}`} className={cx("rounded px-2 py-0.5 text-xs", l === lang ? "bg-teal-700 text-white" : "bg-slate-100")}>{l}</Link>)}</div>}>
          <ActionForm action={saveTemplateAction} key={`${key}-${lang}`}>
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="language" value={lang} />
            <Field label="Message" hint={`Placeholders: ${placeholders(DEFAULT_TEMPLATES[key] ?? body).map((p) => `{{${p}}}`).join(" ") || "none"} — {{name}} and {{clinic}} are always available.`}>
              <Textarea name="body" rows={5} defaultValue={body} required disabled={!editable} />
            </Field>
            <Field label="Approved WhatsApp template name" hint="Needed to message patients outside the 24-hour window. Parameters must follow the same order as the placeholders above.">
              <Input name="waTemplateName" defaultValue={current?.waTemplateName ?? ""} placeholder="appointment_reminder_v1" disabled={!editable} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={current?.active ?? true} disabled={!editable} className="h-4 w-4" /> Active</label>
            {editable && <Submit>Save template</Submit>}
          </ActionForm>
          {editable && (
            <form className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="key" value={key} />
              <Field label="Add a language (code, e.g. tw, ha, sw, fr)"><Input name="lang" pattern="[a-z]{2,3}" required className="w-28" /></Field>
              <button className="rounded-md bg-slate-100 px-3 py-2 text-sm">Open</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
