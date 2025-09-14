// In-memory index of quantized Int8 vectors + metadata
// Loads once on first access in the Deno server runtime

export type IndexedItem = {
  id: string;
  image: string; // public path, e.g. /products/123.jpg
  title: string;
  price: number;
  description: string;
  vec: Int8Array; // quantized vector
};

let INDEX: { dim: number; items: IndexedItem[] } | null = null;

function b64ToInt8(b64: string): Int8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  // reinterpret the bytes as Int8 without copying
  return new Int8Array(u8.buffer, u8.byteOffset, u8.byteLength);
}

export async function getIndex() {
  if (INDEX) return INDEX;
  const t0 = performance.now();
  // NOTE: path is relative to repo root where server runs
  const raw = await Deno.readTextFile("app/data/index.json");
  const parsed = JSON.parse(raw) as {
    dim: number;
    items: Array<{
      id: string;
      image: string;
      title: string;
      price: number;
      description: string;
      vec_b64: string;
    }>;
  };
  INDEX = {
    dim: parsed.dim,
    items: parsed.items.map((r) => ({
      id: r.id,
      image: r.image,
      title: r.title,
      price: r.price,
      description: r.description,
      vec: b64ToInt8(r.vec_b64),
    })),
  };
  const t1 = performance.now();
  console.log(
    JSON.stringify({
      evt: "index-loaded",
      items: INDEX.items.length,
      dim: INDEX.dim,
      ms: Math.round(t1 - t0),
    }),
  );
  return INDEX!;
}

export function dotInt8(a: Int8Array, b: Int8Array): number {
  let s = 0;
  // assume same length and pre-normalized pre-quantization
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // proportional to cosine similarity
}
