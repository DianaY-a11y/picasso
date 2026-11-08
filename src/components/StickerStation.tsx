"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Book } from "@/components/Book";
import { LassoMask, type LassoMaskHandle } from "@/components/LassoMask";
import { getDb, newId } from "@/lib/db";
import { makeThumbDataUrl } from "@/lib/thumb";
import { trimToAlpha } from "@/lib/trim";
import { generateModel, GenerateError } from "@/lib/generate3d";
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
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  // Stop polling if the studio closes mid-generation.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function giveItABody() {
    if (!file) return;
    setError(null);
    setNote(null);
    setGenStatus("starting");
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

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { glb, model, provider } = await generateModel(file, {
        signal: ac.signal,
        onStatus: setGenStatus,
      });
      const mId = newId();
      await getDb().modelAssets.put({
        id: mId,
        sourceImageId: sId,
        createdAt: Date.now(),
        meshBlob: glb,
        provider,
        modelVersion: model,
      });
      setModelAssetId(mId);
      setGlbUrl(URL.createObjectURL(glb));
      setPhase("ready");
      setNote("A small body has been made. Turn it; take the angles you want.");
    } catch (e) {
      if (ac.signal.aborted) return;
      const reason = e instanceof GenerateError ? e.reason : "network";
      const message = e instanceof Error ? e.message : String(e);
      console.error("[picasso] 3D generation failed:", reason, message);
      setPuppetMode(true);
      setPhase("ready");
      setError(
        reason === "no_token"
          ? `No 3D yet: ${message} Using a flat puppet for now.`
          : `Couldn't make a 3D body — ${message} Using a flat puppet for now.`,
      );
    } finally {
      setGenStatus(null);
      abortRef.current = null;
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
    setNote(null);
  }

  const title = lassoCapture
    ? "cut a shape"
    : hasBody
      ? "take your stickers"
      : phase === "idle"
        ? "bring something in"
        : "give it a body";

  const genLabel =
    genStatus === "downloading" ? "bringing the body home…" : "shaping a body…";

  /* Everything sits on one loose sheet laid across the open book, like the
     composition studio: header + steps above, the work sheet in the middle,
     the actions under it, and the stickers you've just taken at the bottom. */
  const spread = (
    <div className="studio-page">
      {/* header */}
      <div className="flex items-end justify-between gap-6 pr-10">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="eyebrow">sticker creation station</span>
          <h2 className="studio-title text-ink">{title}</h2>
        </div>
        <ol className="steps shrink-0">
          {STEPS.map((s, i) => (
            <li key={s.n} data-active={i === step} data-done={i < step}>
              <span className="n">{s.n}.</span>
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      {/* the sheet */}
      <div className="compose-stage station-stage mt-4">
        <div className="mounted station-sheet">
          {phase === "idle" && <FileDrop onPick={onPickFile} />}

          {phase !== "idle" && previewUrl && !hasBody && (
            <div className="w-full h-full flex flex-col items-center justify-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file?.name ?? "preview"}
                className={`flex-1 min-h-0 max-w-full object-contain ${
                  phase === "generating" ? "animate-pulse" : ""
                }`}
              />
              <div className="studio-copy text-muted mt-2 shrink-0 truncate max-w-full">
                {file?.name}
              </div>
            </div>
          )}

          {hasBody &&
            previewUrl &&
            (lassoCapture ? (
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
            ))}
        </div>
      </div>

      {/* actions under the sheet */}
      <div className="mt-4 flex items-baseline justify-center gap-6 flex-wrap text-center">
        {phase === "idle" && (
          <p className="studio-copy text-muted">
            a photograph, a sketch, anything with a shape — drop it on the sheet.
          </p>
        )}

        {!hasBody && phase !== "idle" && (
          <>
            <button
              type="button"
              disabled={phase === "generating"}
              onClick={giveItABody}
              className="studio-action disabled:cursor-wait"
            >
              {phase === "generating" ? genLabel : "give it a 3D body →"}
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
            <span className="studio-copy text-muted">
              drag to turn · right-drag to slide · scroll to step closer
            </span>
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
              new image
            </button>
          </>
        )}

        {lassoCapture && (
          <>
            <span className="studio-copy text-muted">
              trace around what you want; return to the start and it closes
            </span>
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
      </div>

      {(note || error) && (
        <p
          className={`studio-copy text-center mt-2 ${
            error ? "text-terracotta" : "text-muted"
          }`}
        >
          {error ?? note}
        </p>
      )}

      {/* just taken */}
      <div className="mt-3 station-tray">
        {recent.length > 0 && (
          <h3 className="eyebrow">
            {`just taken · ${recent.length} — saved to your scrapbook`}
          </h3>
        )}
        <div className="sticker-tray mt-1">
          {recent.map((r) => (
            <span key={r.id} className="tray-item">
              <span className="sticker-cut">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumb} alt="sticker just taken" />
              </span>
            </span>
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
      className={`tile-dashed w-full h-full flex flex-col items-center justify-center text-center px-8 cursor-pointer ${
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
