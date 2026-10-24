"use client";
import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
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

  if (!open) return <Button type="button" variant="secondary" onClick={() => setOpen(true)}><Mic className="h-4 w-4" aria-hidden /> AI scribe</Button>;

  return (
    <section className="space-y-3 rounded-lg bg-violet-50/60 p-3 ring-1 ring-violet-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-900">AI scribe draft</h3>
        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpen(false)}>Close</Button>
      </div>
      {!result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {recording
              ? <Button type="button" variant="danger" onClick={stop}><Square className="h-4 w-4" aria-hidden /> Stop & draft</Button>
              : <Button type="button" onClick={() => void start()} disabled={busy}><Mic className="h-4 w-4" aria-hidden /> Record consultation</Button>}
            {recording && <span className="animate-pulse text-sm text-red-700">● Recording…</span>}
            {busy && <span className="text-sm text-slate-600">Drafting…</span>}
          </div>
          <Field label="…or paste / dictate the transcript">
            <Textarea rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Doctor: What brings you in today? Patient: …" />
          </Field>
          <Button type="button" variant="secondary" disabled={busy || recording || !typed.trim()} onClick={() => void submit()}>Draft from transcript</Button>
          <p className="text-xs text-slate-500">Audio is not stored. Names, phone numbers and ID numbers are removed before the transcript is sent to the AI.</p>
        </>
      )}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium text-slate-700">Source transcript — verify against the draft</div>
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs text-slate-700 ring-1 ring-slate-200">{result.transcript}</pre>
          </div>
          <div className="space-y-2">
            {KEYS.map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <Textarea rows={k === "complaint" ? 1 : 3} value={result.draft[k]}
                  onChange={(e) => setResult({ ...result, draft: { ...result.draft, [k]: e.target.value } })} />
              </Field>
            ))}
            <p className="text-xs text-slate-500">Items marked [?] were unclear. This is a draft: review every line before signing.</p>
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
