import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Image → 3D with Stability AI's SPAR3D (Stable Point Aware 3D).
 *
 * SPAR3D runs on Stability's always-on servers and answers in a few seconds
 * with the finished GLB, so there is no job to poll and no cold start. It is
 * Stable Fast 3D plus a point-cloud stage that guesses the unseen back of the
 * object better, at 4 credits a model instead of 10. The GLB is streamed straight through (streamed responses are not
 * subject to Vercel's 4.5 MB buffered-body cap).
 *
 *  POST (multipart "image") → model/gltf-binary, or { ok:false, reason, message }
 */

const ENDPOINT = "https://api.stability.ai/v2beta/3d/stable-point-aware-3d";
const MODEL = "stability/stable-point-aware-3d";

const NO_KEY_MESSAGE =
  "STABILITY_API_KEY is not set for this deployment. In Vercel, add it under Settings → Environment Variables (Production and Preview) and redeploy.";

function fail(reason: string, message: string, status: number) {
  return Response.json({ ok: false, reason, message }, { status });
}

/** Stability errors look like { name, errors: string[] }. */
async function upstreamMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { name?: string; errors?: string[]; message?: string };
    return body.errors?.join(" ") || body.message || body.name || `Stability answered ${res.status}.`;
  } catch {
    return `Stability answered ${res.status}.`;
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.STABILITY_API_KEY;
  if (!key) return fail("no_token", NO_KEY_MESSAGE, 503);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("image");
  } catch {
    return fail("bad_request", "Could not read the uploaded image.", 400);
  }
  if (!(file instanceof Blob)) return fail("no_image", "Missing image upload.", 400);

  const form = new FormData();
  form.append("image", file, "image.png");
  form.append("texture_resolution", "1024");
  form.append("remesh", "none");

  let upstream: Response;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate-model] request failed:", message);
    return fail("network", "Could not reach Stability AI.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    const message = await upstreamMessage(upstream);
    console.error("[generate-model] stability", upstream.status, message);
    const reason =
      upstream.status === 401 || upstream.status === 403
        ? "bad_key"
        : upstream.status === 402
          ? "no_credits"
          : upstream.status === 429
            ? "rate_limited"
            : "stability_error";
    const friendly =
      reason === "no_credits"
        ? "The Stability AI account is out of credits."
        : reason === "bad_key"
          ? "The Stability AI key was refused."
          : reason === "rate_limited"
            ? "Too many requests at once — try again in a moment."
            : message;
    return fail(reason, friendly, upstream.status >= 500 ? 502 : upstream.status);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "X-Picasso-Provider": "stability",
      "X-Picasso-Model": MODEL,
      "Cache-Control": "no-store",
    },
  });
}
