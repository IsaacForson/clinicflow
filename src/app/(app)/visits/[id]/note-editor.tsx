"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, FileSignature, FileText, Save, Sparkles } from "lucide-react";
import { Button, cx, Field, IconTile, Input, Select, Textarea } from "@/components/ui";
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
  const dirtyish = status?.error ? "bad" : status ? "ok" : "idle";
  return (
    <div className="space-y-5">
      {props.scribe.allowed
        ? <ScribePanel visitId={props.visitId} onInsert={insertDraft} />
        : props.scribe.reason && (
          <p className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />AI scribe: {props.scribe.reason}
          </p>
        )}

      <section className="glass animate-rise overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <IconTile><FileText /></IconTile>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">Consultation note</div>
              <h2 className="text-[15px] font-semibold tracking-tight text-fg">SOAP</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs",
              dirtyish === "bad" ? "bg-bad/12 text-bad" : dirtyish === "ok" ? "bg-ok/12 text-ok" : "bg-surface-3 text-muted")}>
              {dirtyish === "bad" ? <CloudOff className="h-3.5 w-3.5" aria-hidden /> : <Cloud className="h-3.5 w-3.5" aria-hidden />}
              {status?.text ?? "Autosaves every 20 seconds"}
            </span>
            <label className="sr-only" htmlFor="tpl">Template</label>
            <Select id="tpl" value={template} onChange={(e) => void changeTemplate(e.target.value)} className="h-9 w-44 text-xs">
              {Object.values(CLINICAL_TEMPLATES).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </div>
        </header>

        <div className="space-y-5 p-5">
          {SOAP.map((f) => (
            <div key={f.key} className="group flex gap-3">
              <span className="mt-6 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-xs font-semibold text-accent transition group-focus-within:border-accent group-focus-within:bg-accent/15" aria-hidden>
                {f.key === "complaint" ? "C" : f.key[0].toUpperCase()}
              </span>
              <Field label={f.label} className="min-w-0 flex-1">
                {f.rows === 1
                  ? <Input value={note[f.key]} onChange={(e) => edit({ [f.key]: e.target.value })} onBlur={() => void save(false)} placeholder="Why are they here today?" />
                  : <Textarea rows={f.rows} value={note[f.key]} onChange={(e) => edit({ [f.key]: e.target.value })} onBlur={() => void save(false)} />}
              </Field>
            </div>
          ))}
          {fields.length > 0 && (
            <fieldset className="grid gap-4 rounded-2xl border border-accent/25 bg-accent/5 p-4 sm:grid-cols-2">
              <legend className="px-1.5 text-xs font-semibold text-accent">{getTemplate(template).label} details</legend>
              {fields.map((f) => (
                <Field key={f.key} label={f.label} className={f.multiline ? "sm:col-span-2" : undefined}>
                  {f.multiline
                    ? <Textarea rows={2} value={extra[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => edit({}, { [f.key]: e.target.value })} />
                    : <Input value={extra[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => edit({}, { [f.key]: e.target.value })} />}
                </Field>
              ))}
            </fieldset>
          )}
        </div>

        <footer className="sticky bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 border-t border-line bg-solid/90 px-5 py-4 backdrop-blur">
          <Button type="button" variant="secondary" onClick={() => void save(true)}><Save className="h-4 w-4" aria-hidden />Save draft</Button>
          {props.canSign && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Follow-up date (optional)" className="w-44">
                <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              </Field>
              <Button type="button" size="lg" onClick={() => void sign()} disabled={signing}>
                <FileSignature className="h-4 w-4" aria-hidden />{signing ? "Signing…" : "Sign note"}
              </Button>
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}
