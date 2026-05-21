"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

type Point = { x: number; y: number };

type Props = {
  imageUrl: string;
  onSave: (blob: Blob) => void;
  onStateChange?: (state: { closed: boolean; hasShape: boolean }) => void;
};

export type LassoMaskHandle = {
  save: () => void;
  reset: () => void;
};

// Snap thresholds, measured in CSS pixels so they feel consistent regardless
// of the underlying image resolution.
const SNAP_CSS_PX = 16;
const HINT_CSS_PX = 36;
const MIN_PATH_CSS_PX = 60;
const MIN_POINTS_FOR_SNAP = 8;

const TRACE_COLOR = "#a36f24";
const SNAP_FILL = "rgba(163, 111, 36, 0.35)";

export const LassoMask = forwardRef<LassoMaskHandle, Props>(function LassoMask(
  { imageUrl, onSave, onStateChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const pathLenCssRef = useRef(0);
  const [closed, setClosed] = useState(false);
  const [hasShape, setHasShape] = useState(false);
  const [snapNear, setSnapNear] = useState(false);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      redraw(false);
    };
  }, [imageUrl]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    onStateChange?.({ closed, hasShape });
  }, [closed, hasShape, onStateChange]);

  useImperativeHandle(
    ref,
    () => ({
      save: () => void handleSave(),
      reset: () => handleReset(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function redraw(isClosed: boolean, snapActive = false) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const pts = pointsRef.current;
    if (pts.length === 0) return;

    if (isClosed && pts.length >= 3) {
      // Dim everything outside the closed path.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = "rgba(28, 24, 18, 0.45)";
      ctx.fill("evenodd");
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (isClosed) ctx.closePath();
    ctx.lineWidth = Math.max(2, canvas.width / 360);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = TRACE_COLOR;
    ctx.stroke();
    ctx.restore();

    // Marker at the starting point while the user is mid-drag, so they can see
    // where to snap closed. Fills in when within snap range.
    if (drawingRef.current && pts.length >= MIN_POINTS_FOR_SNAP) {
      const scale = cssToCanvasScale();
      const r = SNAP_CSS_PX * scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, canvas.width / 480);
      ctx.strokeStyle = TRACE_COLOR;
      if (snapActive) {
        ctx.fillStyle = SNAP_FILL;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function cssToCanvasScale(): number {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return 1;
    return canvas.width / rect.width;
  }

  function cssDistance(a: Point, b: Point): number {
    const scale = cssToCanvasScale();
    return Math.hypot(a.x - b.x, a.y - b.y) / scale;
  }

  function toCanvasCoords(e: React.PointerEvent): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvasCoords(e);
    pointsRef.current = [p];
    pathLenCssRef.current = 0;
    drawingRef.current = true;
    setClosed(false);
    setHasShape(true);
    setSnapNear(false);
    redraw(false);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = toCanvasCoords(e);
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
    pts.push(p);
    if (last) pathLenCssRef.current += cssDistance(last, p);

    if (
      pts.length >= MIN_POINTS_FOR_SNAP &&
      pathLenCssRef.current >= MIN_PATH_CSS_PX
    ) {
      const d = cssDistance(p, pts[0]);
      if (d <= SNAP_CSS_PX) {
        drawingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore — pointer may already be released
        }
        setSnapNear(false);
        setClosed(true);
        redraw(true);
        void handleSave();
        return;
      }
      setSnapNear(d <= HINT_CSS_PX);
      redraw(false, d <= HINT_CSS_PX);
      return;
    }
    redraw(false);
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setSnapNear(false);
    if (pointsRef.current.length >= 3) {
      setClosed(true);
      redraw(true);
    } else {
      pointsRef.current = [];
      pathLenCssRef.current = 0;
      setHasShape(false);
      redraw(false);
    }
  }

  function handleReset() {
    pointsRef.current = [];
    pathLenCssRef.current = 0;
    drawingRef.current = false;
    setClosed(false);
    setHasShape(false);
    setSnapNear(false);
    redraw(false);
  }

  async function handleSave() {
    const pts = pointsRef.current;
    const img = imgRef.current;
    if (pts.length < 3 || !img) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = 2;
    minX = Math.max(0, Math.floor(minX - pad));
    minY = Math.max(0, Math.floor(minY - pad));
    maxX = Math.min(img.naturalWidth, Math.ceil(maxX + pad));
    maxY = Math.min(img.naturalHeight, Math.ceil(maxY + pad));
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x - minX, pts[0].y - minY);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x - minX, pts[i].y - minY);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, -minX, -minY);
    ctx.restore();

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), "image/png"),
    );
    if (blob) onSave(blob);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="w-full h-auto rounded-[2px] border border-canvas-edge bg-canvas-deep/40 touch-none cursor-crosshair"
      />
      <p className="mt-3 display-italic text-[0.85rem] text-muted">
        {snapNear
          ? "snap when you reach the marker — it will keep itself."
          : "trace a shape; come back to where you started and it closes."}
      </p>
    </div>
  );
});
