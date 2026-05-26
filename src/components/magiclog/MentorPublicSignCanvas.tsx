"use client";

import { useCallback, useRef } from "react";

type MentorPublicSignCanvasProps = {
  disabled?: boolean;
  onConfirm: (base64Png: string) => void;
};

/**
 * White canvas, black ink — same UX as react-signature-canvas without an extra dependency.
 */
export function MentorPublicSignCanvas({ disabled, onConfirm }: MentorPublicSignCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return { canvas, ctx };
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    const scaleX = canvas.width / box.width;
    const scaleY = canvas.height / box.height;
    return {
      x: (e.clientX - box.left) * scaleX,
      y: (e.clientY - box.top) * scaleY
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const g = getCtx();
    if (!g) return;
    drawing.current = true;
    g.canvas.setPointerCapture(e.pointerId);
    const p = getPos(e);
    g.ctx.beginPath();
    g.ctx.moveTo(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const g = getCtx();
    if (!g) return;
    const p = getPos(e);
    g.ctx.strokeStyle = "#000000";
    g.ctx.lineWidth = 3;
    g.ctx.lineCap = "round";
    g.ctx.lineJoin = "round";
    g.ctx.lineTo(p.x, p.y);
    g.ctx.stroke();
  };

  const onPointerUp = () => {
    drawing.current = false;
  };

  const clear = () => {
    const g = getCtx();
    if (!g) return;
    g.ctx.fillStyle = "#ffffff";
    g.ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    if (!base64) return;
    onConfirm(base64);
  };

  const initCanvas = (node: HTMLCanvasElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, node.width, node.height);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <canvas
          ref={initCanvas}
          width={900}
          height={360}
          className="block h-[220px] w-full touch-none sm:h-[280px]"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={clear}
          disabled={disabled}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn-primary flex-[2]"
          onClick={confirm}
          disabled={disabled}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
