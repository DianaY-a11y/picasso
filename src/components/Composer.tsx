"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as fabric from "fabric";
import { getDb } from "@/lib/db";
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

export function Composer({ id }: { id: string }) {
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
      c.dispose();
      fabricRef.current = null;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
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

  const addSticker = useCallback(async (s: Sticker) => {
    const c = fabricRef.current;
    if (!c) return;
    // Embed as a data URL, not an object URL. blob: URLs die when the page
    // reloads, which means a saved composition would lose its stickers on the
    // next visit. Data URLs serialize into the canvas JSON directly.
    const dataUrl = await blobToDataUrl(s.blob);
    const img = await fabric.FabricImage.fromURL(dataUrl);
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

  const stickerStrip = useMemo(
    () => (
      <div className="grid grid-cols-3 gap-2">
        {stickers.length === 0 && (
          <div className="col-span-3 text-[0.85rem] text-muted display-italic">
            no stickers yet —{" "}
            <Link href="/upload" className="text-ochre-deep">
              make some
            </Link>
          </div>
        )}
        {stickers.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => addSticker(s)}
            className="sticker-tile aspect-square p-1 hover:cursor-grab"
            title={s.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.thumbDataUrl}
              alt={s.name}
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          </button>
        ))}
      </div>
    ),
    [stickers, addSticker],
  );

  return (
    <main className="w-full max-w-[1240px] mx-auto px-6 pt-4 pb-16">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-4">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              scheduleSave();
            }}
            className="display-italic text-[1.9rem] leading-none bg-transparent outline-none border-b border-transparent focus:border-canvas-edge"
          />
        </div>
        <div className="flex items-baseline gap-5 text-[0.82rem] text-muted">
          {savingState === "saving" && (
            <span className="display-italic">saving…</span>
          )}
          {savingState === "saved" && savedAt && (
            <span className="display-italic">
              saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => doSave(true)}
            className="btn-ghost"
          >
            save
          </button>
          <button
            type="button"
            onClick={downloadPng}
            className="btn-ghost"
            title="download a PNG of the composition"
          >
            download png
          </button>
          <Link href="/" className="btn-ghost">
            ← studio
          </Link>
        </div>
      </div>
      <div className="rule mt-4 mb-6" />

      <div className="grid grid-cols-[200px_1fr_220px] gap-6 items-start">
        <aside>
          <h2 className="eyebrow">tools</h2>
          <div className="mt-3 flex flex-col gap-2">
            <ToolButton
              active={tool === "select"}
              onClick={() => setTool("select")}
            >
              select / move
            </ToolButton>
            <ToolButton
              active={tool === "draw"}
              onClick={() => setTool("draw")}
            >
              draw
            </ToolButton>
            <button
              type="button"
              onClick={clearCanvas}
              className="btn-ghost text-left text-[0.85rem] text-muted hover:text-terracotta"
            >
              clear
            </button>
          </div>

          {tool === "draw" && (
            <div className="mt-6">
              <h3 className="eyebrow">brush</h3>
              <div className="mt-2 flex items-center gap-2">
                {["#1c1812", "#a36f24", "#b8533a", "#6f7a5c", "#c89958"].map(
                  (c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setBrushColor(c)}
                      className="w-6 h-6 rounded-full border"
                      style={{
                        background: c,
                        outline:
                          brushColor === c
                            ? "2px solid var(--color-ochre-deep)"
                            : "none",
                        outlineOffset: 2,
                      }}
                      aria-label={`brush color ${c}`}
                    />
                  ),
                )}
              </div>
              <label className="mt-3 block text-[0.78rem] text-muted">
                size
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
          )}
        </aside>

        <div className="flex justify-center">
          <div
            className="rounded-[2px] border border-canvas-edge"
            style={{
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.5) inset, 0 20px 40px -28px rgba(60,40,12,0.5)",
            }}
          >
            <canvas
              ref={canvasElRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="block"
            />
          </div>
        </div>

        <aside>
          <h2 className="eyebrow">stickers</h2>
          <div className="mt-3">{stickerStrip}</div>
        </aside>
      </div>
    </main>
  );
}

function ToolButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left text-[0.92rem] py-1 border-b ${
        active
          ? "border-ochre-deep text-ochre-deep display-italic"
          : "border-canvas-edge text-ink-soft hover:text-ochre-deep"
      }`}
    >
      {children}
    </button>
  );
}
