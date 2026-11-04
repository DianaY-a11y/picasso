/**
 * Bakes a white die-cut border around a sticker's alpha silhouette, the way a
 * real cut-out sticker has a paper edge. Used when placing stickers onto a
 * composition so the exported PNG carries the outline too.
 */
export async function withWhiteOutline(
  dataUrl: string,
  edgeRatio = 0.025,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image load failed"));
    el.src = dataUrl;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const edge = Math.max(3, Math.round(Math.max(w, h) * edgeRatio));

  const out = document.createElement("canvas");
  out.width = w + edge * 2;
  out.height = h + edge * 2;
  const ctx = out.getContext("2d");
  if (!ctx) return dataUrl;

  // Stamp the silhouette around a circle to dilate it, then paint it white.
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(img, edge + Math.cos(a) * edge, edge + Math.sin(a) * edge);
  }
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(img, edge, edge);
  return out.toDataURL("image/png");
}
