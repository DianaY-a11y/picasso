/**
 * Client half of image → 3D. The server (src/app/api/generate-model/route.ts)
 * answers the one request with the finished GLB.
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
): Promise<{ glb: Blob; model: string; provider: string }> {
  const fd = new FormData();
  fd.append("image", await prepareImage(image), "image.png");

  onStatus?.("processing");
  const res = await fetch("/api/generate-model", {
    method: "POST",
    body: fd,
    signal,
  });
  if (!res.ok) throw await readError(res);
  if (!res.headers.get("Content-Type")?.includes("gltf")) {
    throw new GenerateError("bad_response", "The server didn't send back a 3D file.");
  }
  onStatus?.("downloading");
  const glb = await res.blob();
  return {
    glb,
    model: res.headers.get("X-Picasso-Model") ?? "unknown",
    provider: res.headers.get("X-Picasso-Provider") ?? "unknown",
  };
}
