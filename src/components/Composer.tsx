"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Book } from "@/components/Book";
import * as fabric from "fabric";
import { getDb } from "@/lib/db";
import { withWhiteOutline } from "@/lib/outline";
import type { Composition, Sticker } from "@/lib/types";

type Tool = "select" | "draw";

const CANVAS_W = 960;
const CANVAS_H = 600;

function pickPlacement() {
  return {
    dx: (Math.random() - 0.5) * 120,
    dy: (Math.random() - 0.5) * 80,
    angle: (Math.random() - 0.5) * 6,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

export function Composer({
  id,
  onClose,
  onCreateStickers,
}: {
  id: string;
  onClose: () => void;
  onCreateStickers?: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [brushColor, setBrushColor] = useState("#1c1812");
  const [brushSize, setBrushSize] = useState(3);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [name, setName] = useState("untitled");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const saveTimer = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const doSaveRef = useRef<(explicit: boolean) => Promise<void>>(
    async () => {},
  );

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => doSaveRef.current(false), 800);
    setSavingState("idle");
  }, []);

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const c = new fabric.Canvas(el, {
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: "#faf5e9",
      preserveObjectStacking: true,
    });
    fabricRef.current = c;

    const brush = new fabric.PencilBrush(c);
    brush.color = brushColor;
    brush.width = brushSize;
    c.freeDrawingBrush = brush;

    const handler = () => scheduleSave();
    c.on("object:added", handler);
    c.on("object:modified", handler);
    c.on("object:removed", handler);
    c.on("path:created", handler);

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea/i.test(target.tagName)) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        const active = c.getActiveObjects();
        if (active.length) {
          active.forEach((o) => c.remove(o));
          c.discardActiveObject();
          c.requestRenderAll();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    (async () => {
      const row = await getDb().compositions.get(id);
      if (row) {
        setName(row.name);
        if (row.canvasJson) {
          try {
            await c.loadFromJSON(JSON.parse(row.canvasJson));
            c.requestRenderAll();
          } catch (e) {
            console.warn("compose: failed to load saved canvas", e);
          }
        }
      }
      loadedRef.current = true;
    })();

    (async () => {
      const rows = await getDb()
        .stickers.orderBy("createdAt")
        .reverse()
        .toArray();
      setStickers(rows);
    })();

    return () => {
      window.removeEventListener("keydown", onKey);
      // Flush a pending autosave so closing the studio never loses work.
      // doSave serializes the canvas synchronously before its first await.
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void doSaveRef.current(false);
      }
      c.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    if (tool === "draw") {
      c.isDrawingMode = true;
      if (!(c.freeDrawingBrush instanceof fabric.PencilBrush)) {
        c.freeDrawingBrush = new fabric.PencilBrush(c);
      }
      c.freeDrawingBrush.color = brushColor;
      c.freeDrawingBrush.width = brushSize;
    } else {
      c.isDrawingMode = false;
    }
  }, [tool, brushColor, brushSize]);

  // Fit the fixed-resolution canvas into whatever room the open book gives
  // it. Only the CSS size changes; Fabric maps pointer coordinates back to
  // the 960×600 drawing surface.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const c = fabricRef.current;
      if (!c) return;
      const pad = 8;
      const w = Math.max(0, stage.clientWidth - pad * 2);
      const h = Math.max(0, stage.clientHeight - pad * 2);
      const scale = Math.min(w / CANVAS_W, h / CANVAS_H);
      if (!(scale > 0)) return;
      c.setDimensions(
        {
          width: `${Math.floor(CANVAS_W * scale)}px`,
          height: `${Math.floor(CANVAS_H * scale)}px`,
        },
        { cssOnly: true },
      );
      c.calcOffset();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();
    return () => ro.disconnect();
  }, []);

  const addSticker = useCallback(async (s: Sticker) => {
    const c = fabricRef.current;
    if (!c) return;
    // Embed as a data URL, not an object URL. blob: URLs die when the page
    // reloads, which means a saved composition would lose its stickers on the
    // next visit. Data URLs serialize into the canvas JSON directly.
    const dataUrl = await withWhiteOutline(await blobToDataUrl(s.blob));
    const img = await fabric.FabricImage.fromURL(dataUrl);
    img.set({
      shadow: new fabric.Shadow({
        color: "rgba(40,28,12,0.22)",
        blur: 6,
        offsetX: 0,
        offsetY: 2,
      }),
    });
    const maxEdge = 280;
    const scale = Math.min(
      maxEdge / (img.width ?? maxEdge),
      maxEdge / (img.height ?? maxEdge),
      1,
    );
    const { dx, dy, angle } = pickPlacement();
    img.set({
      left: CANVAS_W / 2 + dx,
      top: CANVAS_H / 2 + dy,
      originX: "center",
      originY: "center",
      scaleX: scale,
      scaleY: scale,
      angle,
    });
    c.add(img);
    c.setActiveObject(img);
    c.requestRenderAll();
  }, []);

  function downloadPng() {
    const c = fabricRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL({ format: "png", multiplier: 2 });
    const safeName =
      (nameRef.current || "composition").replace(/[^a-z0-9-_ ]+/gi, "_").trim() ||
      "composition";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function clearCanvas() {
    const c = fabricRef.current;
    if (!c) return;
    c.getObjects().slice().forEach((o) => c.remove(o));
    c.requestRenderAll();
  }

  const doSave = useCallback(
    async (explicit: boolean) => {
      const c = fabricRef.current;
      if (!c || !loadedRef.current) return;
      setSavingState("saving");
      const json = JSON.stringify(c.toJSON());
      const dataUrl = c.toDataURL({
        format: "png",
        multiplier: 256 / Math.max(CANVAS_W, CANVAS_H),
      });
      const now = Date.now();
      const existing = await getDb().compositions.get(id);
      const row: Composition = {
        id,
        name: nameRef.current,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        canvasJson: json,
        thumbDataUrl: dataUrl,
      };
      await getDb().compositions.put(row);
      setSavedAt(now);
      setSavingState("saved");
      if (explicit) {
        window.setTimeout(() => setSavingState("idle"), 1500);
      }
    },
    [id],
  );

  useEffect(() => {
    doSaveRef.current = doSave;
  }, [doSave]);

  const colors = ["#1c1812", "#a36f24", "#b8533a", "#6f7a5c", "#c89958"];

  const spread = (
    <div className="studio-page">
      {/* header */}
      <div className="flex items-end justify-between gap-6 pr-10">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="eyebrow">composition studio</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              scheduleSave();
            }}
            aria-label="composition name"
            className="studio-title text-ink bg-transparent outline-none border-b border-transparent focus:border-canvas-edge min-w-0"
          />
        </div>
        <div className="flex items-baseline gap-5 shrink-0">
          <span className="studio-copy text-muted">
            {savingState === "saving"
              ? "saving…"
              : savingState === "saved" && savedAt
                ? `saved ${new Date(savedAt).toLocaleTimeString()}`
                : ""}
          </span>
          <button
            type="button"
            onClick={() => doSave(true)}
            className="studio-action"
          >
            save
          </button>
          <button
            type="button"
            onClick={downloadPng}
            className="studio-action"
            title="download a PNG of the composition"
          >
            download png
          </button>
        </div>
      </div>

      {/* tools */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          className="tool-chip"
          data-active={tool === "select"}
          onClick={() => setTool("select")}
        >
          select / move
        </button>
        <button
          type="button"
          className="tool-chip"
          data-active={tool === "draw"}
          onClick={() => setTool("draw")}
        >
          draw
        </button>
        {tool === "draw" && (
          <div className="flex items-center gap-2 ml-2">
            {colors.map((col) => (
              <button
                type="button"
                key={col}
                onClick={() => setBrushColor(col)}
                className="w-5 h-5 rounded-full border border-canvas-edge"
                style={{
                  background: col,
                  outline:
                    brushColor === col
                      ? "2px solid var(--color-ochre-deep)"
                      : "none",
                  outlineOffset: 2,
                }}
                aria-label={`brush color ${col}`}
              />
            ))}
            <label className="studio-copy text-muted flex items-center gap-2 ml-2">
              size
              <input
                type="range"
                min={1}
                max={20}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-24"
              />
            </label>
          </div>
        )}
        <button
          type="button"
          onClick={clearCanvas}
          className="tool-chip ml-auto hover:!text-terracotta hover:!border-terracotta"
        >
          clear
        </button>
      </div>

      {/* canvas: a loose sheet laid across the spread */}
      <div ref={stageRef} className="compose-stage mt-3">
        <div className="mounted compose-sheet">
          <canvas ref={canvasElRef} width={CANVAS_W} height={CANVAS_H} />
        </div>
      </div>

      {/* sticker tray */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <h3 className="eyebrow">your stickers · tap to place</h3>
          {onCreateStickers && (
            <button
              type="button"
              onClick={onCreateStickers}
              className="studio-action studio-action--quiet"
            >
              create new stickers →
            </button>
          )}
        </div>
        <div className="sticker-tray mt-1">
          {stickers.length === 0 && (
            <div className="studio-copy text-muted py-4">
              no stickers yet — make some first, then come back to arrange
              them.
            </div>
          )}
          {stickers.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addSticker(s)}
              title={s.name}
            >
              <span className="sticker-cut">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.thumbDataUrl}
                  alt={s.name}
                  className="pointer-events-none"
                  draggable={false}
                />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Book spread={spread} className="h-full">
      <button
        type="button"
        onClick={onClose}
        className="studio-close"
        aria-label="close the composition studio"
      >
        ×
      </button>
    </Book>
  );
}
