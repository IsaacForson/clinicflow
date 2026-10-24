"use client";
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
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f172a";
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
    <div className="space-y-1">
      <canvas ref={canvas} width={600} height={200} aria-label="Signature pad: sign with your finger or mouse"
        className="h-40 w-full touch-none rounded-md bg-white ring-1 ring-slate-300"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <input type="hidden" name={name} value={value} />
      <div className="flex justify-between text-xs text-slate-500">
        <span>{value ? "Signed" : "Sign above with your finger"}</span>
        <button type="button" onClick={clear} className="text-brand-800 underline">Clear</button>
      </div>
    </div>
  );
}
