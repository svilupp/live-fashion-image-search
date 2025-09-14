// Validate vector search results for a given query image
// Usage:
//   deno run -A scripts/test-search.mjs [--image data/red_dress.jpg] [--k 30]
// Prints top-K matches from app/data/index.json.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline, RawImage } from "@huggingface/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Config
const IMG = getFlag("--image") || path.join(ROOT, "data", "red_dress.jpg");
const K = +(getFlag("--k") || 30);
const INDEX_PATH = path.join(ROOT, "app", "data", "index.json");

// Ensure HF runs with wasm backend and no local /models paths
env.allowLocalModels = false;
env.backends = env.backends || {};
env.backends.onnx = env.backends.onnx || {};
env.backends.onnx.wasm = { ...(env.backends.onnx.wasm || {}), numThreads: 1 };

function getFlag(name) {
  const i = Deno.args.indexOf(name);
  return i !== -1 ? Deno.args[i + 1] : undefined;
}

function l2normalize(f32) {
  let s = 0;
  for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i];
  const inv = 1 / Math.sqrt(s || 1);
  for (let i = 0; i < f32.length; i++) f32[i] *= inv;
  return f32;
}
function quantizeInt8(unit) {
  const out = new Int8Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    let v = Math.round(unit[i] * 127);
    if (v > 127) v = 127;
    if (v < -127) v = -127;
    out[i] = v;
  }
  return out;
}
function b64ToInt8(b64) {
  const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Int8Array(u8.buffer, u8.byteOffset, u8.byteLength);
}
function dotInt8(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function main() {
  const t0 = performance.now();
  const idxRaw = await fs.readFile(INDEX_PATH, "utf8");
  const idxJson = JSON.parse(idxRaw);
  const items = idxJson.items.map((r) => ({ ...r, vec: b64ToInt8(r.vec_b64) }));
  const tIdx1 = performance.now();

  const extractor = await pipeline(
    "image-feature-extraction",
    "Xenova/clip-vit-base-patch32",
    { dtype: "q8" },
  );
  const tModel = performance.now();

  const raw = await RawImage.read(IMG);
  const out = await extractor(raw);
  const q8 = quantizeInt8(l2normalize(out.data));
  const tEmbed = performance.now();

  /** @type {{score:number, i:number}[]} */
  const scores = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    scores[i] = { score: dotInt8(q8, items[i].vec), i };
  }
  scores.sort((a, b) => b.score - a.score);
  const tRank = performance.now();

  const top = scores.slice(0, Math.max(1, Math.min(100, K))).map((
    { score, i },
  ) => ({
    score,
    id: items[i].id,
    image: items[i].image,
    title: items[i].title,
    price: items[i].price,
    description: items[i].description,
  }));

  // Minimal output: print image path, title, and description for top-K
  for (let i = 0; i < top.length; i++) {
    const m = top[i];
    console.log(`${m.image}\t${m.title}`);
  }

  // Attempt to dispose and exit cleanly
  try {
    await extractor.dispose?.();
  } catch {}
}

await main();
