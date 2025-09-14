// Deno-friendly embedding builder
// Usage: deno run -A scripts/build-embeddings.ts [--limit N]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, RawImage, env } from "@huggingface/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "data", "products.jsonl");
const OUT_PATH = path.join(ROOT, "app", "data", "index.json");

(env as any).allowLocalModels = false; // ensure remote model fetch from HF hub
// Reduce wasm threading to avoid worker/teardown issues in some CLIs
const be: any = (env as any).backends ?? ((env as any).backends = {});
be.onnx = be.onnx ?? {};
be.onnx.wasm = be.onnx.wasm ?? {};
be.onnx.wasm.numThreads = 1;

function ensureDir(p: string) {
  return fs.mkdir(path.dirname(p), { recursive: true });
}

function l2normalize(f32: Float32Array) {
  let s = 0;
  for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i];
  const inv = 1 / Math.sqrt(s || 1);
  for (let i = 0; i < f32.length; i++) f32[i] *= inv;
  return f32;
}
function quantizeInt8(unit: Float32Array) {
  const out = new Int8Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    let v = Math.round(unit[i] * 127);
    if (v > 127) v = 127;
    if (v < -127) v = -127;
    out[i] = v;
  }
  return out;
}
function i8ToB64(i8: Int8Array) {
  return Buffer.from(i8.buffer, i8.byteOffset, i8.byteLength).toString(
    "base64",
  );
}

function parseLimitArg(defaultLimit: number) {
  const idx = Deno.args.indexOf("--limit");
  if (idx !== -1 && Deno.args[idx + 1]) return +Deno.args[idx + 1];
  const envLimit = Deno.env.get("MAX_ITEMS");
  if (envLimit) return +envLimit;
  return defaultLimit;
}

function mapDatasetRow(rec: any) {
  const id = String(rec.id);
  const title = rec.productDisplayName ?? String(rec.title ?? id);
  const descParts = [
    rec.gender,
    rec.masterCategory,
    rec.subCategory,
    rec.articleType,
    rec.baseColour,
  ].filter(Boolean);
  const description = descParts.join(" • ");
  const imageAbs = rec.image_path ?? rec.image ?? `public/products/${id}.jpg`;
  const image = imageAbs.startsWith("public/")
    ? "/" + imageAbs.slice("public/".length)
    : imageAbs.startsWith("/")
    ? imageAbs
    : "/" + imageAbs;
  return { id, image, title, description, imageAbs };
}

const main = async () => {
  const text = await fs.readFile(PRODUCTS_PATH, "utf8");
  const all = text.split(/\r?\n/).filter(Boolean);
  const limit = parseLimitArg(all.length);
  const lines = all.slice(0, limit);
  console.log(`Embedding ${lines.length}/${all.length} products...`);

  const extractor: any = await pipeline(
    "image-feature-extraction",
    "Xenova/clip-vit-base-patch32",
  );

  const items: any[] = [];
  let done = 0;
  for (const line of lines) {
    const rec = JSON.parse(line);
    const mapped = mapDatasetRow(rec);
    let fsPath: string;
    if (mapped.imageAbs.startsWith("/products/")) {
      fsPath = path.join(ROOT, "public", mapped.imageAbs);
    } else if (mapped.imageAbs.startsWith("public/")) {
      fsPath = path.join(ROOT, mapped.imageAbs);
    } else if (mapped.imageAbs.startsWith("/public/")) {
      fsPath = path.join(ROOT, mapped.imageAbs.slice(1));
    } else if (mapped.imageAbs.startsWith("/")) {
      fsPath = path.join(ROOT, mapped.imageAbs.slice(1));
    } else {
      fsPath = path.join(ROOT, mapped.imageAbs);
    }

    try {
      const raw = await RawImage.read(fsPath);
      const out: any = await extractor(raw);
      const f32 = l2normalize(out.data as Float32Array);
      const q8 = quantizeInt8(f32);
      items.push({
        id: mapped.id,
        image: mapped.image,
        title: mapped.title,
        price: +(Math.random() * 120 + 5).toFixed(2),
        description: mapped.description,
        vec_b64: i8ToB64(q8),
      });
      done++;
      if (done % 25 === 0) Deno.stdout.write(new TextEncoder().encode(`\r${done}`));
    } catch (e) {
      console.warn(`\nSkip ${mapped.id} (${fsPath}):`, e?.message ?? e);
    }
  }
  console.log(`\nWriting index with ${items.length} items...`);
  await ensureDir(OUT_PATH);
  await fs.writeFile(OUT_PATH, JSON.stringify({ dim: 512, items }), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
  // Clean up to prevent teardown races with wasm workers
  try {
    if (typeof extractor?.dispose === "function") await extractor.dispose();
  } catch (_) {
    // ignore
  }
  // Give the runtime a moment to settle before exit
  await new Promise((r) => setTimeout(r, 50));
};

await main();
