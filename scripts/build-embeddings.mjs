// Node script to build CLIP image embeddings for products
// Reads data/products.jsonl (dataset-like rows), writes app/data/index.json

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, RawImage } from "@huggingface/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "data", "products.jsonl");
const OUT_PATH = path.join(ROOT, "app", "data", "index.json");

function ensureDir(p) {
  return fs.mkdir(path.dirname(p), { recursive: true });
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
function i8ToB64(i8) {
  return Buffer.from(i8.buffer, i8.byteOffset, i8.byteLength).toString(
    "base64",
  );
}

function mapDatasetRow(rec) {
  // Input rows from download_fashion_images.py look like the HF dataset
  // Map them into our simpler product shape
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
  const price = +(Math.random() * 120 + 5).toFixed(2);
  return { id, image, title, price, description, imageAbs };
}

function parseLimitArg(defaultLimit) {
  const idx = process.argv.indexOf("--limit");
  if (idx !== -1 && process.argv[idx + 1]) return +process.argv[idx + 1];
  if (process.env.MAX_ITEMS) return +process.env.MAX_ITEMS;
  return defaultLimit;
}

async function main() {
  const text = await fs.readFile(PRODUCTS_PATH, "utf8");
  const allLines = text.split(/\r?\n/).filter(Boolean);
  const limit = parseLimitArg(allLines.length);
  const lines = allLines.slice(0, limit);
  console.log(`Reading ${lines.length}/${allLines.length} products...`);

  const extractor = await pipeline(
    "image-feature-extraction",
    "Xenova/clip-vit-base-patch32",
  );

  const items = [];
  let done = 0;
  for (const line of lines) {
    const rec = JSON.parse(line);
    const mapped = mapDatasetRow(rec);

    // Absolute fs path for reading
    const fsPath = mapped.imageAbs.startsWith("public/")
      ? path.join(ROOT, mapped.imageAbs)
      : mapped.imageAbs.startsWith("/")
      ? path.join(ROOT, mapped.imageAbs.slice(1))
      : path.join(ROOT, "public", mapped.imageAbs);

    try {
      const raw = await RawImage.read(fsPath);
      const out = await extractor(raw);
      const f32 = l2normalize(out.data);
      const q8 = quantizeInt8(f32);
      items.push({
        id: mapped.id,
        image: mapped.image,
        title: mapped.title,
        price: mapped.price,
        description: mapped.description,
        vec_b64: i8ToB64(q8),
      });
      done++;
      if (done % 25 === 0) process.stdout.write(`\rEmbedded ${done}`);
    } catch (e) {
      console.warn(`\nSkip ${mapped.id} (${fsPath}):`, e?.message || e);
    }
  }
  process.stdout.write(`\rEmbedded ${done}\n`);

  await ensureDir(OUT_PATH);
  await fs.writeFile(OUT_PATH, JSON.stringify({ dim: 512, items }), "utf8");
  console.log(`Wrote ${OUT_PATH} (${items.length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
