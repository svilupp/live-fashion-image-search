import type { ActionFunctionArgs } from "react-router";
import { dotInt8, getIndex } from "~/lib/index-store.server.ts";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const t0 = performance.now();
    const ctype = request.headers.get("content-type") || "";
    let q_b64: string | undefined;
    let k = 8;
    if (ctype.includes("application/json")) {
      const body = await request.json().catch(() => null) as
        | { q_b64?: string; k?: number }
        | null;
      q_b64 = body?.q_b64;
      k = Math.max(1, Math.min(50, Number(body?.k ?? 8)));
    } else {
      const fd = await request.formData().catch(() => null);
      if (fd) {
        const q = fd.get("q_b64");
        const kk = fd.get("k");
        q_b64 = typeof q === "string" ? q : (q ? String(q) : undefined);
        k = Math.max(
          1,
          Math.min(
            50,
            Number(typeof kk === "string" ? kk : kk ? String(kk) : 8),
          ),
        );
      }
    }
    if (!q_b64) {
      return Response.json({ error: "missing q_b64" }, { status: 400 });
    }

    const tDecode0 = performance.now();
    const bin = atob(q_b64);
    const qU8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) qU8[i] = bin.charCodeAt(i);
    const q8 = new Int8Array(qU8.buffer, qU8.byteOffset, qU8.byteLength);
    const tDecode1 = performance.now();

    const tIdx0 = performance.now();
    const { items } = await getIndex();
    const tIdx1 = performance.now();
    const tScore0 = performance.now();
    const results: Array<{ score: number; idx: number }> = new Array(
      items.length,
    );
    for (let i = 0; i < items.length; i++) {
      results[i] = { score: dotInt8(q8, items[i].vec), idx: i };
    }
    const tScore1 = performance.now();
    const tSort0 = performance.now();
    results.sort((a, b) => b.score - a.score);
    const tSort1 = performance.now();
    const top = results.slice(0, k).map(({ score, idx }) => {
      const it = items[idx];
      return {
        id: it.id,
        image: it.image,
        title: it.title,
        price: it.price,
        description: it.description,
        score,
      };
    });
    const t1 = performance.now();
    console.log(
      JSON.stringify({
        evt: "vector-search",
        k,
        items: items.length,
        ms: Math.round(t1 - t0),
        decodeMs: Math.round(tDecode1 - tDecode0),
        indexMs: Math.round(tIdx1 - tIdx0),
        scoreMs: Math.round(tScore1 - tScore0),
        sortMs: Math.round(tSort1 - tSort0),
      }),
    );
    return Response.json({ matches: top });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
};

// API routes require a default export in React Router 7
export default function VectorSearchRoute() {
  return null;
}
