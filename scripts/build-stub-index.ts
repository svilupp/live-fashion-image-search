// Quick stub index builder (deterministic random Int8 embeddings)
// Use this to unblock server while full embedding build runs.
// Usage: deno run -A scripts/build-stub-index.ts [--limit N]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "data", "products.jsonl");
const OUT_PATH = path.join(ROOT, "app", "data", "index.json");

function ensureDir(p: string) {
  return fs.mkdir(path.dirname(p), { recursive: true });
}

function parseLimitArg(defaultLimit: number) {
  const idx = Deno.args.indexOf("--limit");
  if (idx !== -1 && Deno.args[idx + 1]) return +Deno.args[idx + 1];
  const envLimit = Deno.env.get("MAX_ITEMS");
  if (envLimit) return +envLimit;
  return defaultLimit;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vecForId(id: string, dim = 512) {
  const seed = Array.from(id).reduce((s, c) => s + c.charCodeAt(0), 0) >>> 0;
  const rand = mulberry32(seed);
  const arr = new Int8Array(dim);
  for (let i = 0; i < dim; i++) {
    const v = Math.floor(rand() * 255) - 127; // [-127,127]
    arr[i] = v as unknown as number;
  }
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

const main = async () => {
  const text = await fs.readFile(PRODUCTS_PATH, "utf8");
  const all = text.split(/\r?\n/).filter(Boolean);
  const limit = parseLimitArg(Math.min(1000, all.length));
  const lines = all.slice(0, limit);

  const items = lines.map((line) => {
    const r = JSON.parse(line);
    const id = String(r.id);
    const title = r.productDisplayName ?? id;
    const description = [r.gender, r.masterCategory, r.subCategory, r.articleType, r.baseColour]
      .filter(Boolean)
      .join(" • ");
    const imagePath = r.image_path ?? `public/products/${id}.jpg`;
    const image = imagePath.startsWith("public/") ? "/" + imagePath.slice(7) : imagePath;
    const price = +(Math.random() * 120 + 5).toFixed(2);
    return {
      id,
      image,
      title,
      price,
      description,
      vec_b64: vecForId(id, 512),
    };
  });

  await ensureDir(OUT_PATH);
  await fs.writeFile(OUT_PATH, JSON.stringify({ dim: 512, items }), "utf8");
  console.log(`Wrote ${OUT_PATH} with ${items.length} stubbed items.`);
};

await main();

