"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx, type BtnVariant } from "./ui";

type State = { ok?: boolean; error?: string; message?: string; id?: string } | undefined;
type Action = (prev: State, fd: FormData) => Promise<State>;

/** Form bound to a server action with inline error/success messages. */
export function ActionForm({
  action, children, className, resetOnSuccess, onSuccessHref, successMessage,
}: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean;
  /** Path to open on success; "{id}" is replaced with the id the action returned. */
  onSuccessHref?: string; successMessage?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    if (onSuccessHref) router.push(onSuccessHref.replace("{id}", state.id ?? ""));
  }, [state, resetOnSuccess, onSuccessHref, router]);
  return (
    <form ref={ref} action={formAction} className={cx("space-y-3", className)}>
      {children}
      {state?.error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-inset ring-rose-500/20">{state.error}</p>}
      {state?.ok && (state.message || successMessage) && <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20">{state.message || successMessage}</p>}
    </form>
  );
}

export function Submit({ children, variant, className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending || p.disabled} className={className} {...p}>{pending ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />Saving…</> : children}</Button>;
}

/** One-click action button (e.g. status changes) with optional confirm. */
export function ActionButton({ action, fields, children, variant = "secondary", confirm, className }: {
  action: Action; fields: Record<string, string>; children: ReactNode; variant?: BtnVariant; confirm?: string; className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline" onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit variant={variant} className={cx("px-2 py-1 text-xs", className)}>{children}</Submit>
      {state?.error && <span role="alert" className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function PrintButton() {
  return <Button variant="secondary" type="button" onClick={() => window.print()} className="print:hidden">Print / Save PDF</Button>;
}
