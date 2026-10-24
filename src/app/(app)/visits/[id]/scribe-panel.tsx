"use client";
import { Mic, ShieldCheck, Sparkles, Square, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Field, IconButton, Textarea } from "@/components/ui";
import { acceptScribeAction } from "../actions";

export type Draft = { complaint: string; subjective: string; objective: string; assessment: string; plan: string };
const KEYS: (keyof Draft)[] = ["complaint", "subjective", "objective", "assessment", "plan"];

/** Record or paste a consultation, get a SOAP draft, edit it, insert into the note. Never signs anything. */
export function ScribePanel({ visitId, onInsert }: { visitId: string; onInsert: (d: Draft) => void }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sessionId: string; draft: Draft; transcript: string; model: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function submit(audio?: Blob) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("visitId", visitId);
      if (audio) fd.set("audio", new File([audio], "consultation.webm", { type: audio.type || "audio/webm" }));
      else fd.set("transcript", typed);
      const res = await fetch("/api/scribe", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ error: `Scribe failed (${res.status})` }));
      if (!res.ok) setError(json.error ?? "Scribe failed");
      else setResult(json);
    } catch {
      setError("Network error: check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void submit(new Blob(chunks.current, { type: r.mimeType }));
      };
      r.start(1000);
      rec.current = r;
      setRecording(true);
    } catch {
      setError("Microphone not available. Allow microphone access, or paste the transcript instead.");
    }
  }

  function stop() {
    rec.current?.stop();
    setRecording(false);
  }

  async function insert() {
    if (!result) return;
    onInsert(result.draft);
    const fd = new FormData();
    fd.set("sessionId", result.sessionId);
    await acceptScribeAction(undefined, fd);
    setResult(null);
    setTyped("");
    setOpen(false);
  }

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)}
      className="glass ring-aurora group relative flex w-full items-center gap-4 overflow-hidden p-4 text-left transition hover:-translate-y-px animate-rise">
      <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-aurora opacity-20 blur-2xl transition group-hover:opacity-35" aria-hidden />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-aurora text-on-accent shadow-glow"><Sparkles className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">AI scribe</span>
        <span className="block text-xs text-muted">Record the consultation or paste a transcript — get a SOAP draft to review.</span>
      </span>
      <span className="hidden items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs font-medium text-fg sm:inline-flex"><Mic className="h-3.5 w-3.5" aria-hidden />Open</span>
    </button>
  );

  return (
    <section className="glass ring-aurora relative space-y-4 overflow-hidden p-5 animate-rise" aria-label="AI scribe">
      <span className={recording ? "pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-bad opacity-20 blur-3xl" : "pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-aurora opacity-20 blur-3xl"} aria-hidden />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-aurora text-on-accent shadow-glow"><Sparkles className="h-5 w-5" aria-hidden /></span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Assistant</div>
            <h3 className="text-[15px] font-semibold text-fg">AI scribe draft</h3>
          </div>
        </div>
        <IconButton type="button" label="Close scribe" onClick={() => setOpen(false)}><X className="h-4 w-4" aria-hidden /></IconButton>
      </div>
      {!result && (
        <div className="relative space-y-4">
          <div className={recording ? "flex flex-wrap items-center gap-4 rounded-2xl border border-bad/30 bg-bad/10 p-4" : "flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface-2 p-4"}>
            {recording
              ? <button type="button" onClick={stop} aria-label="Stop recording and draft"
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-bad text-on-accent animate-pulse-ring"><Square className="h-5 w-5" aria-hidden /></button>
              : <button type="button" onClick={() => void start()} disabled={busy} aria-label="Record consultation"
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-aurora text-on-accent shadow-glow transition hover:scale-105 disabled:opacity-40"><Mic className="h-6 w-6" aria-hidden /></button>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{recording ? "Recording…" : busy ? "Drafting your note…" : "Record consultation"}</div>
              <div className="text-xs text-muted">{recording ? "Tap stop when the consultation ends. We'll draft the note." : busy ? "This takes a few seconds." : "Tap the mic to start. Speak naturally."}</div>
            </div>
            {recording && (
              <span className="flex h-8 items-end gap-0.5" aria-hidden>
                {[0, 1, 2, 3, 4, 5, 6].map((b) => <span key={b} className="w-1 animate-pulse rounded-full bg-bad" style={{ height: `${30 + ((b * 37) % 70)}%`, animationDelay: `${b * 120}ms` }} />)}
              </span>
            )}
            {busy && <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-r-transparent" aria-hidden />}
          </div>
          <Field label="…or paste / dictate the transcript">
            <Textarea rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Doctor: What brings you in today? Patient: …" />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex max-w-md items-start gap-1.5 text-[11px] text-subtle"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />Audio is not stored. Names, phone numbers and ID numbers are removed before the transcript is sent to the AI.</p>
            <Button type="button" variant="secondary" size="sm" disabled={busy || recording || !typed.trim()} onClick={() => void submit()}>Draft from transcript</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="relative rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{error}</p>}
      {result && (
        <div className="relative grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">Source transcript — verify against the draft</div>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface-2 p-3 font-sans text-xs leading-relaxed text-muted">{result.transcript}</pre>
          </div>
          <div className="space-y-3">
            {KEYS.map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <Textarea rows={k === "complaint" ? 1 : 3} value={result.draft[k]}
                  onChange={(e) => setResult({ ...result, draft: { ...result.draft, [k]: e.target.value } })} />
              </Field>
            ))}
            <p className="rounded-xl bg-warn/12 px-3 py-2 text-xs text-warn">Items marked [?] were unclear. This is a draft: review every line before signing.</p>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void insert()}>Insert into note</Button>
              <Button type="button" variant="ghost" onClick={() => setResult(null)}>Discard</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
