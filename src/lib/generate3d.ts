/**
 * Client half of image → 3D. See src/app/api/generate-model/route.ts for why
 * this is start-then-poll and why the GLB is downloaded directly.
 */

export class GenerateError extends Error {
  constructor(
    public reason: string,
    message: string,
  ) {
    super(message);
  }
}

/** Shrink big photos so the upload stays far below Vercel's 4.5 MB body cap.
 *  PNG keeps transparency; the 3D model only needs ~1k pixels anyway. */
export async function prepareImage(file: Blob, maxEdge = 1024): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    if (scale === 1 && file.size < 2_500_000) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return out ?? file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readError(res: Response): Promise<GenerateError> {
  try {
    const body = (await res.json()) as { reason?: string; message?: string };
    return new GenerateError(
      body.reason ?? `http_${res.status}`,
      body.message ?? `Request failed (${res.status}).`,
    );
  } catch {
    // Not JSON — e.g. a platform error page.
    const hint =
      res.status === 413
        ? "The upload was too large for the server."
        : res.status === 504
          ? "The server timed out."
          : `The server answered ${res.status}.`;
    return new GenerateError(`http_${res.status}`, hint);
  }
}

export async function generateModel(
  image: Blob,
  {
    onStatus,
    signal,
  }: { onStatus?: (s: string) => void; signal?: AbortSignal } = {},
): Promise<{ glb: Blob; model: string }> {
  const fd = new FormData();
  fd.append("image", await prepareImage(image), "image.png");

  const start = await fetch("/api/generate-model", {
    method: "POST",
    body: fd,
    signal,
  });
  if (!start.ok) throw await readError(start);
  const { id, model } = (await start.json()) as { id: string; model: string };

  // Poll. Hunyuan usually takes 1–4 minutes; give it up to 10.
  const deadline = Date.now() + 10 * 60_000;
  let modelUrl: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    if (signal?.aborted) throw new GenerateError("aborted", "Cancelled.");
    const res = await fetch(`/api/generate-model?id=${encodeURIComponent(id)}`, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw await readError(res);
    const s = (await res.json()) as {
      status: string;
      modelUrl?: string;
      error?: string;
    };
    if (s.status === "succeeded" && s.modelUrl) {
      modelUrl = s.modelUrl;
      break;
    }
    if (s.status === "failed") {
      throw new GenerateError("replicate_failed", s.error ?? "Generation failed.");
    }
    onStatus?.(s.status);
  }
  if (!modelUrl) throw new GenerateError("timeout", "Generation took too long.");

  onStatus?.("downloading");
  let glb: Blob | null = null;
  try {
    const direct = await fetch(modelUrl, { signal });
    if (direct.ok) glb = await direct.blob();
  } catch {
    // probably CORS — fall through to the streaming proxy
  }
  if (!glb) {
    const proxied = await fetch(
      `/api/generate-model?file=${encodeURIComponent(modelUrl)}`,
      { signal },
    );
    if (!proxied.ok) throw await readError(proxied);
    glb = await proxied.blob();
  }
  return { glb, model };
}
