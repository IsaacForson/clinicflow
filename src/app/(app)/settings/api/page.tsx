import { desc } from "drizzle-orm";
import Link from "next/link";
import { ActionButton, ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, Table, Td } from "@/components/ui";
import { apiKeys } from "@/db/schema";
import { API_RESOURCES, RATE_LIMIT, WRITABLE } from "@/lib/api-auth";
import { requireCtx, tx } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { hasFeature } from "@/lib/plans";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export default async function ApiKeysPage() {
  const ctx = await requireCtx("api.manage");
  const keys = await tx(ctx, (t) => t.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)));
  const enabled = hasFeature(ctx.tenant, "api");
  const tz = ctx.tenant.timezone;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Connect other software to ClinicFlow with the REST API at <code className="rounded bg-slate-100 px-1">/api/v1</code> (<Link href="/api/v1/openapi.json" className="text-teal-800 underline">OpenAPI spec</Link>).
        Send <code className="rounded bg-slate-100 px-1">Authorization: Bearer cf_live_…</code>. Limit {RATE_LIMIT} requests per minute per key.
      </p>
      {!enabled && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">API access is part of the <Link href="/settings/subscription" className="font-medium underline">Group plan</Link>. Existing keys stop working on other plans.</p>}
      <Card title="API keys">
        <Table head={["Name", "Key", "Permissions", "Last used", "Created", ""]} empty="No API keys yet.">
          {keys.map((k) => (
            <tr key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
              <Td className="font-medium">{k.name}</Td>
              <Td className="font-mono text-xs">{k.prefix}…</Td>
              <Td className="whitespace-normal text-xs">{k.scopes.join(", ")}</Td>
              <Td>{dateTime(k.lastUsedAt, tz) || "Never"}</Td>
              <Td>{dateTime(k.createdAt, tz)}</Td>
              <Td>{k.revokedAt ? <Badge>Revoked</Badge> : <ActionButton action={revokeApiKeyAction} fields={{ id: k.id }} variant="danger" confirm={`Revoke "${k.name}"? Apps using it will stop working immediately.`}>Revoke</ActionButton>}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {enabled && (
        <Card title="Create API key">
          <ActionForm action={createApiKeyAction} resetOnSuccess>
            <Field label="Name" hint="Where it's used, e.g. 'Lab system' or 'Website booking'"><Input name="name" required className="max-w-sm" /></Field>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Permissions</legend>
              <div className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
                {API_RESOURCES.map((r) => (
                  <div key={r} className="flex gap-4">
                    <span className="w-28 capitalize text-slate-600">{r}</span>
                    <label className="flex items-center gap-1"><input type="checkbox" name="scopes" value={`${r}:read`} defaultChecked /> Read</label>
                    {WRITABLE.includes(r) && <label className="flex items-center gap-1"><input type="checkbox" name="scopes" value={`${r}:write`} /> Write</label>}
                  </div>
                ))}
              </div>
            </fieldset>
            <Submit>Create key</Submit>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
