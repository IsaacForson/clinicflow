import { desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { adminDb } from "@/db";
import { sessions } from "@/db/schema";
import { requireCtx } from "@/lib/auth";
import { totpUri } from "@/lib/crypto";
import { dateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { changePasswordAction, confirmTotpAction, disableTotpAction, signOutOthersAction, startTotpAction, updateMyProfileAction } from "./actions";

export const metadata = { title: "My account · ClinicFlow" };

const device = (ua: string | null) => !ua ? "Unknown device" : `${/Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Other"} · ${/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"}`;

export default async function AccountPage() {
  const ctx = await requireCtx();
  const u = ctx.user, tz = ctx.tenant.timezone;
  const mySessions = await adminDb().select().from(sessions).where(eq(sessions.userId, u.id)).orderBy(desc(sessions.lastSeenAt));
  const pendingSecret = !u.totpEnabled && u.totpSecret ? u.totpSecret : null;
  const qr = pendingSecret ? `data:image/svg+xml;base64,${Buffer.from(await QRCode.toString(totpUri(pendingSecret, u.email ?? u.phone ?? u.name), { type: "svg", margin: 1 })).toString("base64")}` : null;
  return (
    <>
      <PageHeader title="My account" subtitle={`${ROLE_LABELS[u.role]} · ${ctx.tenant.name}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <ActionForm action={updateMyProfileAction}>
            <Field label="Name"><Input name="name" defaultValue={u.name} required /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={u.email ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" type="tel" defaultValue={u.phone ?? ""} /></Field>
            <Submit>Save</Submit>
          </ActionForm>
        </Card>
        <Card title="Change password">
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <Field label="Current password"><Input name="current" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" hint="At least 8 characters"><Input name="next" type="password" autoComplete="new-password" minLength={8} required /></Field>
            <Field label="Confirm new password"><Input name="confirm" type="password" autoComplete="new-password" required /></Field>
            <Submit>Change password</Submit>
          </ActionForm>
        </Card>
        <Card title={<>Two-factor authentication {u.totpEnabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</>}>
          {u.totpEnabled ? (
            <ActionForm action={disableTotpAction} className="max-w-xs">
              <p className="text-sm text-slate-600">You enter a code from your authenticator app when signing in.</p>
              <Field label="Current 6-digit code to turn off"><Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></Field>
              <Submit variant="danger">Turn off</Submit>
            </ActionForm>
          ) : pendingSecret ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Scan this with Google Authenticator, Microsoft Authenticator or Authy, then enter the code it shows.</p>
              {qr && <img src={qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded ring-1 ring-slate-200" />}
              <p className="text-xs text-slate-500">Can&apos;t scan? Enter this key: <code className="select-all break-all rounded bg-slate-100 px-1 font-mono">{pendingSecret}</code></p>
              <ActionForm action={confirmTotpAction} className="max-w-xs">
                <Field label="6-digit code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus /></Field>
                <Submit>Turn on</Submit>
              </ActionForm>
            </div>
          ) : (
            <ActionForm action={startTotpAction}>
              <p className="text-sm text-slate-600">Protect patient records with a code from your phone in addition to your password.</p>
              <Submit>Set up two-factor</Submit>
            </ActionForm>
          )}
        </Card>
        <Card title="Signed-in devices" actions={mySessions.length > 1 && <ActionForm action={signOutOthersAction}><Submit variant="secondary" className="px-2 py-1 text-xs">Sign out other devices</Submit></ActionForm>}>
          <Table head={["Device", "IP", "Last active"]}>
            {mySessions.map((s) => (
              <tr key={s.id}>
                <Td>{device(s.userAgent)} {s.id === ctx.sessionId && <Badge tone="teal">This device</Badge>}</Td>
                <Td>{s.ip}</Td>
                <Td>{dateTime(s.lastSeenAt, tz)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
