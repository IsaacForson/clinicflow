"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui";

type Code = { code: string; description: string };

/** ICD-10 typeahead filling hidden icd10Code + editable description; typing without picking = free-text diagnosis. */
export function IcdPicker() {
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [results, setResults] = useState<Code[]>([]);

  const searching = !code && q.trim().length >= 2;
  useEffect(() => {
    if (!searching) return;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/icd10?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : [])).then(setResults).catch(() => {});
    }, 200);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, searching]);

  return (
    <div className="relative">
      <input type="hidden" name="icd10Code" value={code} />
      <div className="flex items-center gap-2">
        {code && <button type="button" onClick={() => setCode("")} className="shrink-0 rounded-lg border border-accent/30 bg-accent/15 px-2 py-1.5 font-mono text-xs font-medium text-accent transition hover:bg-accent/25" title="Clear code" aria-label={`Clear code ${code}`}>{code} ×</button>}
        <Input name="description" value={q} onChange={(e) => { setQ(e.target.value); setCode(""); }} required autoComplete="off"
          placeholder="Search ICD-10 (code or words) or type a diagnosis" aria-label="Diagnosis" />
      </div>
      {searching && results.length > 0 && (
        <ul className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-line-strong bg-solid p-1 text-sm shadow-panel animate-rise">
          {results.map((r) => (
            <li key={r.code}>
              <button type="button" className="flex w-full gap-3 rounded-xl px-3 py-2 text-left text-fg outline-none transition hover:bg-surface-3 focus:bg-accent/15"
                onClick={() => { setCode(r.code); setQ(r.description); setResults([]); }}>
                <span className="w-14 shrink-0 font-mono text-xs text-accent">{r.code}</span><span>{r.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
