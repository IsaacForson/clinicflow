"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui";

type Code = { code: string; description: string };

/** ICD-10 typeahead filling hidden icd10Code + editable description; typing without picking = free-text diagnosis. */
export function IcdPicker() {
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [results, setResults] = useState<Code[]>([]);

  useEffect(() => {
    if (code || q.trim().length < 2) return setResults([]);
    const ctl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/icd10?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : [])).then(setResults).catch(() => {});
    }, 200);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, code]);

  return (
    <div className="relative flex-1">
      <input type="hidden" name="icd10Code" value={code} />
      <div className="flex items-center gap-2">
        {code && <button type="button" onClick={() => setCode("")} className="shrink-0 rounded bg-teal-50 px-2 py-1 font-mono text-xs text-teal-800 ring-1 ring-teal-200" title="Clear code">{code} ×</button>}
        <Input name="description" value={q} onChange={(e) => { setQ(e.target.value); setCode(""); }} required autoComplete="off"
          placeholder="Search ICD-10 (code or words) or type a diagnosis" aria-label="Diagnosis" />
      </div>
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md bg-white text-sm shadow-lg ring-1 ring-slate-200">
          {results.map((r) => (
            <li key={r.code}>
              <button type="button" className="flex w-full gap-2 px-3 py-2 text-left hover:bg-teal-50 focus:bg-teal-50"
                onClick={() => { setCode(r.code); setQ(r.description); setResults([]); }}>
                <span className="w-14 shrink-0 font-mono text-xs text-slate-500">{r.code}</span><span>{r.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
