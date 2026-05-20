"use client";

import { useCallback, useRef } from "react";

export function SignaturePad({
  onSave
}: {
  onSave: (blob: Blob) => void | Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    return { c, ctx };
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = getCtx();
    if (!g) return;
    drawing.current = true;
    g.c.setPointerCapture(e.pointerId);
    const p = pos(e);
    g.ctx.beginPath();
    g.ctx.moveTo(p.x, p.y);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const g = getCtx();
    if (!g) return;
    const p = pos(e);
    g.ctx.strokeStyle = "#111";
    g.ctx.lineWidth = 2;
    g.ctx.lineCap = "round";
    g.ctx.lineTo(p.x, p.y);
    g.ctx.stroke();
  };

  const onUp = () => {
    drawing.current = false;
  };

  const clear = () => {
    const g = getCtx();
    if (!g) return;
    g.ctx.clearRect(0, 0, g.c.width, g.c.height);
  };

  const save = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (blob) void onSave(blob);
    }, "image/png");
  }, [onSave]);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="signature-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" onClick={clear}>
          Clear
        </button>
        <button type="button" className="btn-primary" onClick={save}>
          Save signature
        </button>
      </div>
    </div>
  );
}
