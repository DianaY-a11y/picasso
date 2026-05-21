"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudioHeader } from "@/components/StudioHeader";
import { LassoMask, type LassoMaskHandle } from "@/components/LassoMask";
import { getDb, newId } from "@/lib/db";
import { makeThumbDataUrl } from "@/lib/thumb";
import type { CaptureFn } from "@/components/StudioViewer";

const StudioViewer = dynamic(
  () => import("@/components/StudioViewer").then((m) => m.StudioViewer),
  { ssr: false },
);

type Phase = "idle" | "uploaded" | "generating" | "ready" | "saved";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [puppetMode, setPuppetMode] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceImageId, setSourceImageId] = useState<string | null>(null);
  const [modelAssetId, setModelAssetId] = useState<string | null>(null);
  const [recentStickerThumbs, setRecentStickerThumbs] = useState<string[]>([]);
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
  }

  async function giveItABody() {
    if (!file) return;
    setError(null);
    setNote(null);
    setPhase("generating");

    const thumb = await makeThumbDataUrl(file);
    const sId = newId();
    const sourceImage = {
      id: sId,
      name: file.name || "untitled",
      createdAt: Date.now(),
      blob: file,
      thumbDataUrl: thumb,
    };
    await getDb().sourceImages.put(sourceImage);
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
      setNote("A small body has been made. Rotate it; take the angles you want.");
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
        "No Replicate token configured — falling back to a flat puppet so you can keep working. Set REPLICATE_API_TOKEN to enable true 3D.",
      );
    } else {
      setError(`${message} Falling back to a flat puppet.`);
    }
  }

  const onViewerReady = useCallback((capture: CaptureFn) => {
    captureRef.current = capture;
  }, []);

  async function saveStickerBlob(blob: Blob) {
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
    setRecentStickerThumbs((prev) => [thumb, ...prev].slice(0, 6));
    setPhase("saved");
  }

  async function takeSticker() {
    if (!captureRef.current) return;
    const dataUrl = captureRef.current();
    if (!dataUrl) {
      setError("Could not capture the canvas.");
      return;
    }
    const blob = await (await fetch(dataUrl)).blob();
    const trimmed = await trimToAlpha(blob);
    await saveStickerBlob(trimmed);
    setNote("Saved. Keep rotating to take more.");
  }

  function startLasso() {
    if (!captureRef.current) return;
    const dataUrl = captureRef.current();
    if (!dataUrl) {
      setError("Could not capture the canvas.");
      return;
    }
    setError(null);
    setNote(null);
    setLassoCapture(dataUrl);
  }

  async function onLassoSave(blob: Blob) {
    await saveStickerBlob(blob);
    setLassoCapture(null);
    setNote("Saved. Cut another shape or rotate to a new angle.");
  }

  return (
    <div className="min-h-screen">
      <StudioHeader />
      <main className="w-full max-w-4xl mx-auto px-8 pt-6 pb-24">
        <div className="flex items-baseline justify-between">
          <h1 className="display-italic text-[2.4rem] leading-none">
            bring something in
          </h1>
          <Link
            href="/"
            className="display-italic text-muted text-[0.9rem] hover:text-ochre-deep"
          >
            ← studio
          </Link>
        </div>
        <div className="rule mt-6 mb-10" />

        {phase === "idle" && (
          <FileDrop
            onPick={onPickFile}
            label="drop an image — a photograph, a sketch, anything with a shape."
          />
        )}

        {phase !== "idle" && previewUrl && !glbUrl && !puppetMode && (
          <section className="grid md:grid-cols-[1fr_1fr] gap-8 items-start">
            <figure className="sticker-tile rounded-[2px] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file?.name ?? "preview"}
                className="w-full h-auto object-contain max-h-[480px]"
              />
              <figcaption className="display-italic text-[0.85rem] text-ink-soft mt-3 truncate">
                {file?.name}
              </figcaption>
            </figure>
            <div>
              <p className="text-[0.95rem] leading-relaxed text-ink-soft">
                Press the button to give the object a small 3D body. This might take a minute...
              </p>
              <button
                type="button"
                disabled={phase === "generating"}
                onClick={giveItABody}
                className="mt-6 btn-ghost display-italic text-[1.05rem] text-ochre-deep disabled:opacity-50 disabled:cursor-wait"
              >
                {phase === "generating"
                  ? "shaping a body…  this can take a minute"
                  : "give it a body →"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("idle");
                  setFile(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                className="ml-6 btn-ghost text-[0.8rem] text-muted"
              >
                start over
              </button>
            </div>
          </section>
        )}

        {(glbUrl || puppetMode) && previewUrl && (
          <section className="grid md:grid-cols-[2fr_1fr] gap-8 items-start">
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
            <aside>
              {lassoCapture ? (
                <>
                  <h2 className="eyebrow">cut a shape</h2>
                  <p className="mt-3 text-[0.9rem] text-ink-soft leading-relaxed">
                    Trace around what you want to keep. Whatever falls inside
                    the line becomes the sticker — the rest is left behind.
                  </p>
                  <div className="mt-5 flex flex-col items-start gap-3">
                    <button
                      type="button"
                      onClick={() => lassoRef.current?.save()}
                      disabled={!lassoState.closed}
                      className="btn-ghost display-italic text-[1.05rem] text-ochre-deep disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      keep this shape →
                    </button>
                    <button
                      type="button"
                      onClick={() => lassoRef.current?.reset()}
                      disabled={!lassoState.hasShape}
                      className="btn-ghost text-[0.9rem] text-muted disabled:opacity-40"
                    >
                      trace again
                    </button>
                    <button
                      type="button"
                      onClick={() => setLassoCapture(null)}
                      className="btn-ghost text-[0.85rem] text-muted"
                    >
                      cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="eyebrow">take a sticker</h2>
                  <p className="mt-3 text-[0.9rem] text-ink-soft leading-relaxed">
                    Drag to turn · right-drag (or two fingers) to slide it
                    around · scroll to step closer
                  </p>
                  <div className="mt-5 flex flex-col items-start gap-3">
                    <button
                      type="button"
                      onClick={takeSticker}
                      className="btn-ghost display-italic text-[1.05rem] text-ochre-deep"
                    >
                      take this angle ⊕
                    </button>
                    <button
                      type="button"
                      onClick={startLasso}
                      className="btn-ghost display-italic text-[1.05rem] text-ochre-deep"
                    >
                      cut a shape ✎
                    </button>
                  </div>
                </>
              )}

              {!lassoCapture && recentStickerThumbs.length > 0 && (
                <>
                  <div className="rule mt-8 mb-4" />
                  <h3 className="eyebrow">just taken</h3>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {recentStickerThumbs.map((t, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={t}
                        alt="recent sticker"
                        className="sticker-tile aspect-square object-contain p-1"
                      />
                    ))}
                  </div>
                  <Link
                    href="/"
                    className="mt-6 inline-block display-italic text-[0.9rem] text-muted hover:text-ochre-deep"
                  >
                    ← back to the studio
                  </Link>
                </>
              )}
            </aside>
          </section>
        )}

        {(note || error) && (
          <p
            className={`mt-8 text-[0.85rem] ${
              error ? "text-terracotta" : "text-muted"
            } display-italic`}
          >
            {error ?? note}
          </p>
        )}
      </main>
    </div>
  );
}

function FileDrop({
  onPick,
  label,
}: {
  onPick: (f: File) => void;
  label: string;
}) {
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
      className={`tile-dashed block rounded-[2px] py-24 px-10 text-center cursor-pointer ${
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
      <div className="display-italic text-[1.7rem] text-ink-soft">
        choose an image
      </div>
      <div className="mt-3 text-[0.9rem] text-muted max-w-md mx-auto leading-relaxed">
        {label}
      </div>
      <div className="mt-8 display-italic text-ochre-deep">click or drop →</div>
    </label>
  );
}

/**
 * Crops a PNG to the bounding box of its non-transparent pixels.
 * The studio scene has a solid canvas background; for now we just return the
 * blob unchanged so capturing keeps the warm paper around the subject. We keep
 * this function so we can swap in a transparent capture later without churning
 * the call site.
 */
async function trimToAlpha(blob: Blob): Promise<Blob> {
  return blob;
}
