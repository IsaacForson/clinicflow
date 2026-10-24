"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CLINICAL_TEMPLATES, getTemplate } from "@/lib/clinical-templates";
import { saveNoteAction, setTemplateAction, signVisitAction } from "../actions";
import { ScribePanel, type Draft } from "./scribe-panel";

const SOAP = [
  { key: "complaint", label: "Presenting complaint", rows: 1 },
  { key: "subjective", label: "Subjective (history)", rows: 4 },
  { key: "objective", label: "Objective (examination)", rows: 4 },
  { key: "assessment", label: "Assessment", rows: 3 },
  { key: "plan", label: "Plan", rows: 4 },
] as const;
type SoapKey = (typeof SOAP)[number]["key"];
type Note = Record<SoapKey, string>;

const AUTOSAVE_MS = 20_000;

export function NoteEditor(props: {
  visitId: string; version: number; note: Note; extra: Record<string, string>; template: string;
  canSign: boolean; followUpDate: string | null; scribe: { allowed: boolean; reason?: string };
}) {
  const router = useRouter();
  const [note, setNote] = useState<Note>(props.note);
  const [extra, setExtra] = useState(props.extra);
  const [template, setTemplate] = useState(props.template);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [followUp, setFollowUp] = useState(props.followUpDate ?? "");
  const [signing, setSigning] = useState(false);
  const latest = useRef({ note, extra, base: props.version, dirty: false, saving: false });

  const edit = (patch: Partial<Note>, extraPatch?: Record<string, string>) => {
    const n = { ...latest.current.note, ...patch };
    const e = { ...latest.current.extra, ...extraPatch };
    Object.assign(latest.current, { note: n, extra: e, dirty: true });
    setNote(n);
    setExtra(e);
  };

  const save = useCallback(async (explicit: boolean) => {
    const cur = latest.current;
    if (cur.saving || (!cur.dirty && !explicit)) return !cur.dirty;
    cur.saving = true;
    cur.dirty = false;
    const fd = new FormData();
    fd.set("visitId", props.visitId);
    fd.set("baseVersion", String(cur.base));
    for (const { key } of SOAP) fd.set(key, cur.note[key]);
    for (const [k, v] of Object.entries(cur.extra)) fd.set(`extra_${k}`, v);
    if (explicit) fd.set("explicit", "1");
    try {
      const r = await saveNoteAction(undefined, fd);
      if (r?.ok) {
        cur.base = Number(r.id);
        setStatus({ text: `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` });
        return true;
      }
      cur.dirty = true;
      setStatus({ text: r?.error ?? "Could not save", error: true });
      return false;
    } catch {
      cur.dirty = true;
      setStatus({ text: "Offline: changes not saved yet", error: true });
      return false;
    } finally {
      cur.saving = false;
    }
  }, [props.visitId]);

  useEffect(() => {
    const id = setInterval(() => void save(false), AUTOSAVE_MS);
    const warn = (e: BeforeUnloadEvent) => { if (latest.current.dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", warn); };
  }, [save]);

  async function changeTemplate(key: string) {
    setTemplate(key);
    const fd = new FormData();
    fd.set("visitId", props.visitId);
    fd.set("template", key);
    const r = await setTemplateAction(undefined, fd);
    if (r?.error) setStatus({ text: r.error, error: true });
  }

  async function sign() {
    if (!window.confirm("Sign this note? It becomes read-only; later changes are added as addenda.")) return;
    setSigning(true);
    try {
      if (!(await save(true))) return;
      const fd = new FormData();
      fd.set("visitId", props.visitId);
      if (followUp) fd.set("followUpDate", followUp);
      const r = await signVisitAction(undefined, fd);
      if (r?.error) setStatus({ text: r.error, error: true });
      else router.refresh();
    } finally {
      setSigning(false);
    }
  }

  function insertDraft(d: Draft) {
    const patch: Partial<Note> = {};
    for (const { key } of SOAP) {
      const add = d[key]?.trim();
      if (add) patch[key] = latest.current.note[key].trim() ? `${latest.current.note[key].trim()}\n${add}` : add;
    }
    edit(patch);
    setStatus({ text: "Draft inserted. Review it, then save and sign." });
  }

  const fields = getTemplate(template).fields;
  return (
    <div className="space-y-4">
      {props.scribe.allowed
        ? <ScribePanel visitId={props.visitId} onInsert={insertDraft} />
        : props.scribe.reason && <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">AI scribe: {props.scribe.reason}</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Template" className="w-48">
          <Select value={template} onChange={(e) => void changeTemplate(e.target.value)}>
            {Object.values(CLINICAL_TEMPLATES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <span role="status" className={status?.error ? "text-sm text-red-600" : "text-sm text-slate-500"}>{status?.text ?? "Autosaves every 20 seconds"}</span>
      </div>
      {SOAP.map((f) => (
        <Field key={f.key} label={f.label}>
          {f.rows === 1
            ? <Input value={note[f.key]} onChange={(e) => edit({ [f.key]: e.target.value })} onBlur={() => void save(false)} />
            : <Textarea rows={f.rows} value={note[f.key]} onChange={(e) => edit({ [f.key]: e.target.value })} onBlur={() => void save(false)} />}
        </Field>
      ))}
      {fields.length > 0 && (
        <fieldset className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold text-slate-700">{getTemplate(template).label} details</legend>
          {fields.map((f) => (
            <Field key={f.key} label={f.label} className={f.multiline ? "sm:col-span-2" : undefined}>
              {f.multiline
                ? <Textarea rows={2} value={extra[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => edit({}, { [f.key]: e.target.value })} />
                : <Input value={extra[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => edit({}, { [f.key]: e.target.value })} />}
            </Field>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
        <Button type="button" variant="secondary" onClick={() => void save(true)}>Save</Button>
        {props.canSign && (
          <>
            <Field label="Follow-up date (optional)" className="w-48">
              <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </Field>
            <Button type="button" onClick={() => void sign()} disabled={signing}>{signing ? "Signing…" : "Sign note"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
