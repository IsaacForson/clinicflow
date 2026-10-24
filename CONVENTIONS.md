# ClinicFlow conventions

Clinic operating system for 1–15 practitioner private clinics (Ghana/Nigeria/Kenya first). Next.js 16 App Router (Cache Components on), TypeScript, Tailwind v4, Drizzle ORM + Postgres, server actions.

## Run
- `scripts/db-local.sh` starts a project-local Postgres on :54329 (`reset` to wipe).
- `npx tsx scripts/migrate.mts` (add `--test` for the test DB) applies drizzle migrations + `src/db/rls.sql`.
- `pnpm dev` — app on :3000. `npx tsc --noEmit` — typecheck. `pnpm test` — vitest.
- Schema change: edit `src/db/schema.ts`, then `npx drizzle-kit generate --name <what>` and migrate.

## Data access (non-negotiable)
- Tenant data ONLY through `tx(ctx, async (t) => …)` from `@/lib/auth` — runs as a non-owner role with Postgres RLS on `app.tenant_id`. Every insert must set `tenantId: ctx.tenant.id`.
- `adminDb()` bypasses RLS: only for auth, signup, background workers, inbound webhooks, and public token-based pages (portal/intake), and then always filter by tenant explicitly.
- Pages: `const ctx = await requireCtx("perm")` (redirects). Server actions: `const ctx = await requireWrite("perm")` (also blocks read-only accounts). Permissions live in `src/lib/permissions.ts`; plan features in `src/lib/plans.ts` (`hasFeature`).
- Log reads of patient data and every clinical/billing change with `audit(t, ctx, action, entity, id, { patientId })`.
- Sensitive free text uses the `encrypted(...)` column type (transparent AES-GCM) — not searchable in SQL.
- Money is integer minor units (`*Minor`). Format with `money(minor, ctx.tenant.currency)`; parse form input with `zMoney`.
- Dates: store timestamptz; show with `dateTime/dateOnly/timeOnly(d, ctx.tenant.timezone)`; "today" is `localDay(tz)`; `dayRange(day, tz)` for queries; `zonedToUtc(day, "HH:MM", tz)` for form input.
- Phone numbers stored E.164 via `e164(input, ctx.tenant.country)`.
- Human numbers (P-000001, INV-…, RCT-…) via `nextNumber(t, tenantId, key)`.

## Server actions
- File `actions.ts` with `"use server"`; export only async functions.
- Signature `(prev: ActionState, fd: FormData) => Promise<ActionState>`, body wrapped in `run(async () => { … })`. Parse with zod over `formObject(fd)`. Throw `UserError("message")` for user-facing errors. Return `{ ok: true, id }` to redirect via `ActionForm onSuccessHref="/x/{id}"`.
- Call `revalidatePath(...)` for pages whose data changed.

## UI
- Server components by default; `@/components/ui` (Button, LinkButton, Input, Select, Textarea, Field, Card, PageHeader, Badge, Table/Td, Stat, Empty, Tabs, Dl) and `@/components/form` (ActionForm, Submit, ActionButton, PrintButton).
- Pages live under `src/app/(app)/<module>/`; the layout already handles auth, nav and Suspense. Use `PageProps<"/route">` / `RouteContext<"/api/...">` global types (run `npx next typegen` after adding routes).
- Printable documents (prescriptions, receipts, letters, invoices) are print-styled pages with clinic letterhead + `PrintButton` (browser "Save as PDF"). Use `print:hidden` for chrome.
- Front-desk users are busy: large click targets, few fields, sensible defaults, keyboard friendly.

## Shared domain libs (reuse, don't duplicate)
- `@/lib/billing`: createInvoice, ensureVisitInvoice, addLine, recalcInvoice, issueInvoice, recordPayment, reversePayment (refunds keep the row as status "refunded"), settleInsurerShortfall (move unpaid insurer share to patient or write off), patientCredit, outstandingForPatient. `@/lib/billing/cashup`: dayMoney (refunds count on the refund day).
- `@/lib/hours`: branch opening hours (hoursOn, withinHours); bookings outside hours or in the past need "Book anyway".
- Stock can never go negative: guarded in `@/lib/inventory` and by the `stock_batches_qty_nonnegative` CHECK.
- `@/lib/messaging`: queuePatientMessage (consent-checked, templated, logged, queued), sendNow, DEFAULT_TEMPLATES, render.
- `@/lib/reminders`: scheduleAppointmentReminders. `@/lib/jobs`: enqueue + job type list. `@/lib/events`: emit (outgoing webhooks).
- `@/lib/storage`: putFile/getFile (tenant-prefixed keys). `@/lib/crypto`: encrypt, blindIndex, tokens, TOTP.

## Product rules
- Reminders, backups and data export are never paid add-ons. Unpaid accounts become read-only, never locked out of their data.
- No clinical decision support (no diagnosis/treatment suggestions) — avoids medical-device classification. AI scribe output is a draft the clinician must review and sign; never auto-file.
- Every patient message records purpose + consent; opt-out wins.

## Two kinds of admin
- **Clinic admin** (role `admin`): runs a clinic like the owner, except plan/payment (`subscription.manage`), account deletion and clinical note writing/signing. Only owners can create, change or deactivate owners. Clinic console: `/clinic-admin` (`admin.console`).
- **ClinicFlow team ("Control")** at `/admin`: separate `platform_admins` table, `cf_admin` cookie, mandatory TOTP, roles `super_admin` / `finance` / `support` (capabilities in `src/lib/platform-auth.ts`). Uses `adminDb()` across clinics; every action is written to append-only `audit.platform_log` via `platformLog`. Create the first admin with `npx tsx scripts/create-admin.mts --email you@x --name "You"`.
- Support view = a 1-hour read-only clinic session (`sessions.impersonatedBy`): `requireWrite` and account/export actions refuse it, and the clinic's own audit log records it. Suspension (`tenants.suspendedAt`) blocks sign-in for abuse cases only; unpaid accounts use read-only status instead.
