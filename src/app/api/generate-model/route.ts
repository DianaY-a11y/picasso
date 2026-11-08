import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Image → 3D, done in a way that fits inside Vercel Functions' limits:
 *
 *  - Request and response bodies are capped at 4.5 MB, and a textured GLB is
 *    usually much bigger. So the GLB never passes through a buffered
 *    response: the client downloads it from Replicate's delivery URL (or via
 *    the streaming proxy below, which is not subject to that cap).
 *  - Generation can take minutes. So instead of blocking on
 *    `replicate.run()`, POST starts a prediction and returns its id, and the
 *    client polls GET ?id=… until it finishes.
 *
 *  POST  (multipart "image")  → { id }
 *  GET   ?id=<prediction>     → { status, modelUrl?, error? }
 *  GET   ?file=<delivery url> → streams the GLB (CORS fallback)
 */

// Hunyuan3D 2.1 runs on Replicate's own GPUs. Hunyuan 3D 3.1 on Replicate
// relays to Tencent Cloud, whose capacity errors ("ResourceInsufficient")
// fail the whole job. Override with REPLICATE_IMAGE_TO_3D_MODEL.
const REPLICATE_MODEL =
  process.env.REPLICATE_IMAGE_TO_3D_MODEL ??
  "ndreca/hunyuan3d-2.1:440550ccc51ea571e41adf00fb5804b7ac2e2b3e74db56167dbda797fe7611dc";

function buildInput(model: string, dataUrl: string): Record<string, unknown> {
  const slug = model.split(":")[0];
  if (slug === "firtoz/trellis") {
    return {
      images: [dataUrl],
      texture_size: 1024,
      mesh_simplify: 0.9,
      generate_color: true,
      generate_model: true,
      randomize_seed: true,
      generate_normal: false,
      save_gaussian_ply: false,
      ss_sampling_steps: 25,
      slat_sampling_steps: 25,
      return_no_background: false,
      ss_guidance_strength: 7.5,
      slat_guidance_strength: 3,
    };
  }
  if (slug === "ndreca/hunyuan3d-2.1") {
    return {
      image: dataUrl,
      steps: 30,
      guidance_scale: 7.5,
      max_facenum: 40000,
      octree_resolution: 256,
      remove_background: true,
      generate_texture: true,
      seed: Math.floor(Math.random() * 1_000_000),
    };
  }
  // tencent/hunyuan-3d-3.1 shape.
  return {
    image: dataUrl,
    enable_pbr: true,
    face_count: 500000,
    generate_type: "Normal",
  };
}

function fail(reason: string, message: string, status: number) {
  return Response.json({ ok: false, reason, message }, { status });
}

async function client() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;
  const { default: Replicate } = await import("replicate");
  return new Replicate({ auth: token });
}

const NO_TOKEN_MESSAGE =
  "REPLICATE_API_TOKEN is not set for this deployment. In Vercel, check that the variable exists for this environment (Production and/or Preview) and redeploy.";

/** Pull the GLB URL out of whatever shape the model returns. */
function findModelUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const urls = output.filter((o): o is string => typeof o === "string");
    return urls.find((u) => /\.glb(\?|$)/i.test(u)) ?? urls[0] ?? null;
  }
  if (typeof output === "object") {
    const o = output as Record<string, unknown>;
    for (const key of ["model_file", "mesh", "glb", "model", "output"]) {
      const v = findModelUrl(o[key]);
      if (v) return v;
    }
    const all = Object.values(o).map(findModelUrl).filter(Boolean) as string[];
    return all.find((u) => /\.glb(\?|$)/i.test(u)) ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const replicate = await client();
  if (!replicate) return fail("no_token", NO_TOKEN_MESSAGE, 503);

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("image");
  } catch {
    return fail("bad_request", "Could not read the uploaded image.", 400);
  }
  if (!(file instanceof Blob)) {
    return fail("no_image", "Missing image upload.", 400);
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;
  const [model, version] = REPLICATE_MODEL.split(":");

  try {
    const prediction = await replicate.predictions.create(
      version
        ? { version, input: buildInput(REPLICATE_MODEL, dataUrl) }
        : {
            model: model as `${string}/${string}`,
            input: buildInput(REPLICATE_MODEL, dataUrl),
          },
    );
    return Response.json({ ok: true, id: prediction.id, model: REPLICATE_MODEL });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate-model] create failed:", message);
    return fail("replicate_error", message, 502);
  }
}

export async function GET(req: NextRequest) {
  const fileUrl = req.nextUrl.searchParams.get("file");
  if (fileUrl) return proxyFile(fileUrl);

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("no_id", "Missing prediction id.", 400);

  const replicate = await client();
  if (!replicate) return fail("no_token", NO_TOKEN_MESSAGE, 503);

  try {
    const p = await replicate.predictions.get(id);
    if (p.status === "succeeded") {
      const modelUrl = findModelUrl(p.output);
      if (!modelUrl) {
        console.error("[generate-model] no GLB in output:", JSON.stringify(p.output));
        return Response.json({
          status: "failed",
          error: "The model finished but returned no 3D file.",
        });
      }
      return Response.json({ status: "succeeded", modelUrl });
    }
    if (p.status === "failed" || p.status === "canceled") {
      const error = typeof p.error === "string" ? p.error : `Generation ${p.status}.`;
      console.error("[generate-model] prediction", p.status, error);
      return Response.json({ status: "failed", error });
    }
    return Response.json({ status: p.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail("replicate_error", message, 502);
  }
}

/** Streams a Replicate delivery file through, for browsers that hit CORS.
 *  Streaming responses are not subject to the 4.5 MB buffered-body cap. */
async function proxyFile(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("bad_url", "Invalid file URL.", 400);
  }
  if (url.protocol !== "https:" || !/(^|\.)replicate\.delivery$/.test(url.hostname)) {
    return fail("bad_url", "Only Replicate delivery URLs can be proxied.", 400);
  }
  const upstream = await fetch(url);
  if (!upstream.ok || !upstream.body) {
    return fail("fetch_failed", `Could not download the model (${upstream.status}).`, 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "model/gltf-binary" },
  });
}
