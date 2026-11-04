"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Book } from "@/components/Book";
import { LassoMask, type LassoMaskHandle } from "@/components/LassoMask";
import { getDb, newId } from "@/lib/db";
import { makeThumbDataUrl } from "@/lib/thumb";
import { trimToAlpha } from "@/lib/trim";
import type { CaptureFn } from "@/components/StudioViewer";

const StudioViewer = dynamic(
  () => import("@/components/StudioViewer").then((m) => m.StudioViewer),
  { ssr: false },
);

type Phase = "idle" | "uploaded" | "generating" | "ready" | "saved";

const STEPS = [
  { n: "i", label: "upload an image" },
  { n: "ii", label: "give it a 3D body" },
  { n: "iii", label: "cut your stickers" },
];

/**
 * The sticker creation station, laid out as a scrapbook spread:
 * the left page explains and holds the controls, the right page is the
 * work surface (drop zone → preview → 3D viewer / lasso).
 */
export function StickerStation({
  onClose,
  onBusyChange,
}: {
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [puppetMode, setPuppetMode] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceImageId, setSourceImageId] = useState<string | null>(null);
  const [modelAssetId, setModelAssetId] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ id: string; thumb: string }[]>([]);
  const [lassoCapture, setLassoCapture] = useState<string | null>(null);
  const [lassoState, setLassoState] = useState<{
    closed: boolean;
    hasShape: boolean;
  }>({ closed: false, hasShape: false });
  const lassoRef = useRef<LassoMaskHandle | null>(null);
  const captureRef = useRef<CaptureFn | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (glbUrl) URL.revokeObjectURL(glbUrl);
    };
  }, [previewUrl, glbUrl]);

  useEffect(() => {
    onBusyChange?.(phase === "generating");
  }, [phase, onBusyChange]);

  const hasBody = !!glbUrl || puppetMode;
  const step = hasBody ? 2 : phase === "idle" ? 0 : 1;

  function onPickFile(f: File) {
    setError(null);
    setNote(null);
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setGlbUrl(null);
    setPuppetMode(false);
    setPhase("uploaded");
    setSourceImageId(null);
    setModelAssetId(null);
    setLassoCapture(null);
  }

  function startOver() {
    setPhase("idle");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setGlbUrl(null);
    setPuppetMode(false);
    setLassoCapture(null);
    setNote(null);
    setError(null);
  }

  async function giveItABody() {
    if (!file) return;
    setError(null);
    setNote(null);
    setPhase("generating");

    const thumb = await makeThumbDataUrl(file);
    const sId = newId();
    await getDb().sourceImages.put({
      id: sId,
      name: file.name || "untitled",
      createdAt: Date.now(),
      blob: file,
      thumbDataUrl: thumb,
    });
    setSourceImageId(sId);

    const fd = new FormData();
    fd.append("image", file);

    let res: Response;
    try {
      res = await fetch("/api/generate-model", { method: "POST", body: fd });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Network error: ${msg}`);
      setPuppetMode(true);
      setPhase("ready");
      return;
    }

    if (res.ok && res.headers.get("Content-Type")?.includes("gltf")) {
      const glbBlob = await res.blob();
      const mId = newId();
      await getDb().modelAssets.put({
        id: mId,
        sourceImageId: sId,
        createdAt: Date.now(),
        meshBlob: glbBlob,
        provider: "replicate",
        modelVersion: res.headers.get("X-Picasso-Model") ?? "unknown",
      });
      setModelAssetId(mId);
      setGlbUrl(URL.createObjectURL(glbBlob));
      setPhase("ready");
      setNote("A small body has been made. Turn it; take the angles you want.");
      return;
    }

    let reason = "unknown";
    let message = "Could not generate a 3D body.";
    try {
      const body = (await res.json()) as { reason?: string; message?: string };
      reason = body.reason ?? reason;
      message = body.message ?? message;
    } catch {
      // body wasn't JSON
    }

    setPuppetMode(true);
    setPhase("ready");
    if (reason === "no_token") {
      setNote(
        "No Replicate token configured — using a flat puppet so you can keep working. Set REPLICATE_API_TOKEN to enable true 3D.",
      );
    } else {
      setError(`${message} Using a flat puppet instead.`);
    }
  }

  const onViewerReady = useCallback((capture: CaptureFn) => {
    captureRef.current = capture;
  }, []);

  async function saveStickerBlob(raw: Blob) {
    const blob = await trimToAlpha(raw);
    const thumb = await makeThumbDataUrl(blob);
    const id = newId();
    await getDb().stickers.put({
      id,
      name: `sticker ${new Date().toLocaleTimeString()}`,
      createdAt: Date.now(),
      blob,
      sourceImageId: sourceImageId ?? undefined,
      modelAssetId: modelAssetId ?? undefined,
      thumbDataUrl: thumb,
    });
    setRecent((prev) => [{ id, thumb }, ...prev]);
    setPhase("saved");
  }

  async function takeSticker() {
    const dataUrl = captureRef.current?.();
    if (!dataUrl) {
      setError("Could not capture the view.");
      return;
    }
    const blob = await (await fetch(dataUrl)).blob();
    await saveStickerBlob(blob);
    setError(null);
    setNote("Saved to your scrapbook. Keep turning to take more.");
  }

  function startLasso() {
    const dataUrl = captureRef.current?.();
    if (!dataUrl) {
      setError("Could not capture the view.");
      return;
    }
    setError(null);
    setNote(null);
    setLassoCapture(dataUrl);
  }

  async function onLassoSave(blob: Blob) {
    await saveStickerBlob(blob);
    setLassoCapture(null);
    setNote("Saved to your scrapbook. Cut another shape or turn to a new angle.");
  }

  const title = lassoCapture
    ? "cut a shape"
    : hasBody
      ? "take your stickers"
      : phase === "idle"
        ? "bring something in"
        : "give it a body";

  /* ——— left page: guidance + controls ——— */
  const left = (
    <div className="studio-page">
      <div className="eyebrow">sticker creation station</div>
      <h2 className="studio-title text-ink mt-3">{title}</h2>

      <ol className="steps steps--stack mt-5">
        {STEPS.map((s, i) => (
          <li key={s.n} data-active={i === step} data-done={i < step}>
            <span className="n">{s.n}.</span>
            {s.label}
          </li>
        ))}
      </ol>

      <div className="rule my-5" />

      <div className="flex flex-col items-start gap-3">
        {phase === "idle" && (
          <p className="studio-copy">
            Choose a photograph, a sketch, anything with a shape. Drop it on the
            right-hand page.
          </p>
        )}

        {!hasBody && phase !== "idle" && (
          <>
            <p className="studio-copy">
              Give the object a small 3D body so you can turn it and cut it
              from any side. This can take a minute.
            </p>
            <button
              type="button"
              disabled={phase === "generating"}
              onClick={giveItABody}
              className="studio-action mt-1 disabled:cursor-wait"
            >
              {phase === "generating"
                ? "shaping a body… this can take a minute"
                : "give it a body →"}
            </button>
            {phase !== "generating" && (
              <button
                type="button"
                onClick={startOver}
                className="studio-action studio-action--quiet"
              >
                choose a different image
              </button>
            )}
          </>
        )}

        {hasBody && !lassoCapture && (
          <>
            <p className="studio-copy">
              Drag to turn · right-drag to slide · scroll to step closer. Take
              the whole view, or cut out just the part you want.
            </p>
            <button type="button" onClick={startLasso} className="studio-action">
              cut a shape ✎
            </button>
            <button type="button" onClick={takeSticker} className="studio-action">
              take this angle ⊕
            </button>
            <button
              type="button"
              onClick={startOver}
              className="studio-action studio-action--quiet"
            >
              start with a new image
            </button>
          </>
        )}

        {lassoCapture && (
          <>
            <p className="studio-copy">
              Trace around what you want to keep. Whatever falls inside the
              line becomes the sticker — come back to where you started and it
              closes itself.
            </p>
            <button
              type="button"
              onClick={() => lassoRef.current?.save()}
              disabled={!lassoState.closed}
              className="studio-action"
            >
              keep this shape →
            </button>
            <button
              type="button"
              onClick={() => lassoRef.current?.reset()}
              disabled={!lassoState.hasShape}
              className="studio-action studio-action--quiet"
            >
              trace again
            </button>
            <button
              type="button"
              onClick={() => setLassoCapture(null)}
              className="studio-action studio-action--quiet"
            >
              back to turning
            </button>
          </>
        )}

        {(note || error) && (
          <p
            className={`studio-copy mt-2 ${error ? "text-terracotta" : "text-muted"}`}
          >
            {error ?? note}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col mt-6">
        {recent.length > 0 && (
          <>
            <h3 className="eyebrow">just taken · {recent.length}</h3>
            <div className="scrapbook-scroll mt-2">
              <div className="grid grid-cols-4 gap-2">
                {recent.map((r) => (
                  <div key={r.id} className="sticker-cut-wrap">
                    <div className="sticker-cut">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.thumb} alt="sticker just taken" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="studio-action studio-action--quiet self-start mt-3"
      >
        ← back to the scrapbook
      </button>
    </div>
  );

  /* ——— right page: the work surface ——— */
  const right = (
    <div className="studio-page justify-center">
      {phase === "idle" && <FileDrop onPick={onPickFile} />}

      {phase !== "idle" && previewUrl && !hasBody && (
        <figure className="mounted corners self-center p-4 max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={file?.name ?? "preview"}
            className={`block max-w-full max-h-[52cqw] object-contain ${
              phase === "generating" ? "animate-pulse" : ""
            }`}
          />
          <figcaption className="studio-copy text-muted mt-2 truncate">
            {file?.name}
          </figcaption>
        </figure>
      )}

      {hasBody && previewUrl && (
        <div className="mounted p-2">
          {lassoCapture ? (
            <LassoMask
              ref={lassoRef}
              imageUrl={lassoCapture}
              onSave={onLassoSave}
              onStateChange={setLassoState}
            />
          ) : (
            <StudioViewer
              glbUrl={glbUrl}
              puppetUrl={puppetMode ? previewUrl : null}
              onReady={onViewerReady}
            />
          )}
        </div>
      )}
    </div>
  );

  return (
    <Book left={left} right={right} className="h-full">
      <button
        type="button"
        onClick={onClose}
        className="studio-close"
        aria-label="close the sticker creation station"
      >
        ×
      </button>
    </Book>
  );
}

function FileDrop({ onPick }: { onPick: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className={`tile-dashed rounded-[4px] flex-1 flex flex-col items-center justify-center text-center px-8 cursor-pointer ${
        drag ? "border-ochre-deep text-ochre-deep" : ""
      }`}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <div className="studio-title text-ink-soft">choose an image</div>
      <div className="studio-copy text-muted mt-3 max-w-xs">
        a photograph, a sketch, anything with a shape.
      </div>
      <div className="studio-action mt-6">click or drop →</div>
    </label>
  );
}
