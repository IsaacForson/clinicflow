"use client";
import { Eraser, PenLine } from "lucide-react";
import { useRef, useState } from "react";

/** Finger/mouse signature on a canvas; the PNG data URL goes into a hidden form field. */
export function SignaturePad({ name }: { name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState("");

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current!.getContext("2d")!;
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    // Ink = the light-theme foreground of the "paper" wrapper, so the saved PNG reads on any review screen.
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = getComputedStyle(canvas.current!).getPropertyValue("--fg").trim();
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setValue(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setValue("");
  };

  return (
    <div className="space-y-2">
      <div data-theme="light" className={`relative overflow-hidden rounded-2xl border bg-solid transition ${value ? "border-accent/50 shadow-glow" : "border-line-strong"}`}>
        <canvas ref={canvas} width={600} height={200} aria-label="Signature pad: sign with your finger or mouse"
          className="relative z-10 block h-44 w-full cursor-crosshair touch-none"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {/* Baseline + hint behind the ink */}
        <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-line-strong" aria-hidden />
        <span className="pointer-events-none absolute bottom-3 left-6 font-mono text-[10px] uppercase tracking-[0.2em] text-subtle" aria-hidden>Sign here</span>
      </div>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center justify-between text-xs">
        <span className={`inline-flex items-center gap-1.5 ${value ? "text-ok" : "text-muted"}`} aria-live="polite">
          <PenLine className="h-3.5 w-3.5" aria-hidden />{value ? "Signed — thank you" : "Sign above with your finger"}
        </span>
        <button type="button" onClick={clear} disabled={!value} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 font-medium text-accent transition hover:bg-surface-3 disabled:opacity-40">
          <Eraser className="h-3.5 w-3.5" aria-hidden /> Clear
        </button>
      </div>
    </div>
  );
}
