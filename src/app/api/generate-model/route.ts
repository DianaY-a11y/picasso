import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const REPLICATE_MODEL =
  process.env.REPLICATE_IMAGE_TO_3D_MODEL ??
  "tencent/hunyuan-3d-3.1:a2838628b41a2e0ee2eb19b3ea98a40d75f8d7639bf5a1ddd37ea299bb334854";

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
  // Default: tencent/hunyuan-3d-3.1 shape.
  return {
    image: dataUrl,
    enable_pbr: true,
    face_count: 500000,
    generate_type: "Normal",
  };
}

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return Response.json(
      {
        ok: false,
        reason: "no_token",
        message:
          "REPLICATE_API_TOKEN is not set on the server. The studio will fall back to a flat puppet so you can keep building.",
      },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof Blob)) {
    return Response.json(
      { ok: false, reason: "no_image", message: "Missing image upload." },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  const mime = file.type || "image/png";
  const dataUrl = `data:${mime};base64,${base64}`;

  const { default: Replicate } = await import("replicate");
  const client = new Replicate({ auth: token });

  try {
    const output = (await client.run(REPLICATE_MODEL as `${string}/${string}`, {
      input: buildInput(REPLICATE_MODEL, dataUrl),
    })) as Record<string, unknown> | unknown[];

    // Trellis returns { model_file, color_video, ... }.
    // Stable Fast 3D returns a single FileOutput.
    const modelFile =
      (output as Record<string, unknown>)?.model_file ??
      (Array.isArray(output) ? output[0] : output);

    if (!modelFile) {
      return Response.json(
        {
          ok: false,
          reason: "no_output",
          message: "Replicate returned no model file.",
        },
        { status: 502 },
      );
    }

    let glbBlob: Blob | null = null;
    const candidate = modelFile as {
      blob?: () => Promise<Blob>;
      url?: () => string | URL;
    };
    if (typeof candidate.blob === "function") {
      glbBlob = await candidate.blob();
    } else if (typeof candidate.url === "function") {
      const u = candidate.url();
      const r = await fetch(typeof u === "string" ? u : u.toString());
      glbBlob = await r.blob();
    } else if (typeof modelFile === "string") {
      const r = await fetch(modelFile);
      glbBlob = await r.blob();
    }

    if (!glbBlob) {
      return Response.json(
        { ok: false, reason: "no_blob", message: "Could not retrieve GLB." },
        { status: 502 },
      );
    }

    return new Response(glbBlob, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "X-Picasso-Provider": "replicate",
        "X-Picasso-Model": REPLICATE_MODEL,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: "replicate_error", message },
      { status: 502 },
    );
  }
}
