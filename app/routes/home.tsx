import type { Route } from "./+types/home.ts";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Fashion Search" },
    {
      name: "description",
      content:
        "Live fashion search - snap & discover products instantly on your device!",
    },
  ];
}

type Match = {
  id: string;
  image: string;
  title: string;
  price: number;
  description: string;
  score: number;
};

function getCDNImageUrl(imagePath: string): string {
  // Convert /products/[ID].jpg to CDN URL
  const match = imagePath.match(/\/products\/(\d+)\.jpg$/);
  if (match) {
    const imageId = match[1];
    return `https://pub-c72363c351d640c1b8e1ec9190278ef9.r2.dev/product_images/${imageId}.jpg`;
  }
  // Fallback to original path if pattern doesn't match
  return imagePath;
}

function ClientOnlyHome() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [detail, setDetail] = useState<Match | null>(null);
  // deno-lint-ignore no-explicit-any
  const pipeRef = useRef<any>(null);
  // deno-lint-ignore no-explicit-any
  const tfRef = useRef<any>(null); // holds { env, pipeline, RawImage }
  const [snapTick, setSnapTick] = useState(0);
  const fetcher = useFetcher<{ matches?: Match[]; error?: string }>();

  useEffect(() => {
    // Avoid running on server
    if (typeof window === "undefined") return;
    (async () => {
      try {
        // Import transformers only in the browser to avoid SSR/node backends
        const mod = await import("~/lib/transformers.web.ts");
        tfRef.current = mod;
        // Ensure we fetch models from the Hugging Face Hub, not local /models/*
        // deno-lint-ignore no-explicit-any
        (mod.env as any).allowLocalModels = false;
        // Keep ONNX runtime to single-threaded to reduce asset size and avoid COOP/COEP
        // deno-lint-ignore no-explicit-any
        const be = (mod.env as any).backends ?? (((mod.env as any).backends = {}));
        be.onnx = be.onnx ?? {};
        be.onnx.wasm = be.onnx.wasm ?? {};
        be.onnx.wasm.numThreads = 1;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        console.error("Camera error", e);
      }
      // Warm model
      const t0 = performance.now();
      pipeRef.current = await tfRef.current.pipeline(
        "image-feature-extraction",
        "Xenova/clip-vit-base-patch32",
        { dtype: "q8" },
      );
      const t1 = performance.now();
      console.log(
        JSON.stringify({ evt: "model-loaded", ms: Math.round(t1 - t0) }),
      );
      setReady(true);
    })();
    return () => {
      const tracks =
        (videoRef.current?.srcObject as MediaStream | null)?.getTracks() || [];
      tracks.forEach((t) => t.stop());
    };
  }, []);

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
    return btoa(String.fromCharCode(...new Uint8Array(i8.buffer)));
  }

  async function captureAndSearch() {
    if (!videoRef.current || !pipeRef.current) return;
    setBusy(true);
    try {
      const t0 = performance.now();
      // Visual confirmation pulse in ROI
      setSnapTick((t) => (t + 1) & 0xffff);
      try {
        // deno-lint-ignore no-explicit-any
        (navigator as any).vibrate?.(30);
      } catch {
        // Vibration not supported, ignore
      }
      const video = videoRef.current;
      const iW = video.videoWidth;
      const iH = video.videoHeight;

      // Compute crop that corresponds to the dashed box on screen
      let sx = 0, sy = 0, sw = iW, sh = iH;
      let usedCrop = false;
      try {
        const boxEl = boxRef.current;
        const vRect = video.getBoundingClientRect();
        if (boxEl && vRect.width > 0 && vRect.height > 0 && iW > 0 && iH > 0) {
          const bRect = boxEl.getBoundingClientRect();
          const eW = vRect.width, eH = vRect.height;
          const s = Math.max(eW / iW, eH / iH);
          const dW = iW * s, dH = iH * s;
          const dx = (eW - dW) / 2;
          const dy = (eH - dH) / 2;
          const bx = bRect.left - vRect.left;
          const by = bRect.top - vRect.top;
          const bw = bRect.width;
          const bh = bRect.height;
          const px = bx - dx;
          const py = by - dy;
          // Map from displayed pixels -> intrinsic video pixels
          sx = Math.max(0, Math.floor(px / s));
          sy = Math.max(0, Math.floor(py / s));
          sw = Math.round(bw / s);
          sh = Math.round(bh / s);
          if (sx + sw > iW) sw = iW - sx;
          if (sy + sh > iH) sh = iH - sy;
          if (sw > 8 && sh > 8) usedCrop = true; // sanity threshold
        }
      } catch (err) {
        // Fallback to full frame on any error
        console.warn("crop-calc-failed, using full frame", err);
        sx = 0;
        sy = 0;
        sw = iW;
        sh = iH;
        usedCrop = false;
      }

      // Draw the crop to a temporary canvas
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cctx = cropCanvas.getContext("2d")!;
      cctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      const tDraw = performance.now();

      const raw = tfRef.current.RawImage.fromCanvas(cropCanvas);
      const tEmbed0 = performance.now();
      const out = await pipeRef.current(raw);
      const f32 = l2normalize(out.data as Float32Array);
      const q8 = quantizeInt8(f32);
      const q_b64 = i8ToB64(q8);
      const tEmbed1 = performance.now();

      // Log embedding completion before network so we always see it
      console.log(
        JSON.stringify({
          evt: "embed-ready",
          drawMs: Math.round(tDraw - t0),
          embedMs: Math.round(tEmbed1 - tEmbed0),
          usedCrop,
          crop: { sx, sy, sw, sh, iW, iH },
        }),
      );
      // Use React Router action via fetcher to ensure correct dev routing
      const fd = new FormData();
      fd.set("q_b64", q_b64);
      fd.set("k", String(10));
      fetcher.submit(fd, { method: "post", action: "/api/vector-search" });
    } catch (e) {
      console.error(e);
    }
  }

  // When fetcher completes, consume results and clear busy
  useEffect(() => {
    if (fetcher.state === "idle") {
      if (fetcher.data && Array.isArray(fetcher.data.matches)) {
        setMatches(fetcher.data.matches as Match[]);
      } else if (fetcher.data && fetcher.data.error) {
        console.error("vector-search error", fetcher.data.error);
      }
      setBusy(false);
    }
  }, [fetcher.state]);

  return (
    <main className="app">
      <div className="cam-wrap">
        <video ref={videoRef} className="cam" playsInline muted />
        <div className="box" ref={boxRef}>
          {/* Re-mount on each capture to restart CSS animation */}
          <div className="box-flash" key={snapTick} />
        </div>
        <button
          type="button"
          className="shutter"
          disabled={!ready || busy}
          onClick={captureAndSearch}
          aria-label="Capture"
        >
          {busy ? "..." : "●"}
        </button>
      </div>

      <div className="cards carousel">
        {matches.map((m) => (
          <button
            type="button"
            className="card"
            key={m.id}
            onClick={() => setDetail(m)}
          >
            <div className="meta small">
              <div className="title" title={m.title}>{m.title}</div>
            </div>
            <div className="thumb">
              <img
                src={getCDNImageUrl(m.image)}
                alt={m.title}
                loading="lazy"
                width={80}
                height={60}
              />
            </div>
          </button>
        ))}
      </div>

      {detail && (
        <div className="modal" onClick={() => setDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <img
              src={getCDNImageUrl(detail.image)}
              alt={detail.title}
              width={160}
              height={120}
            />
            <h3>{detail.title}</h3>
            {detail.description && <p className="desc">{detail.description}</p>}
            <div className="price-lg">${detail.price.toFixed(2)}</div>
            <button type="button" className="close" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: "none" }} />
      <style>{css}</style>
    </main>
  );
}

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  if (!isClient) {
    return (
      <main className="app">
        <div className="cam-wrap">
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontSize: '18px'
          }}>
            Loading camera...
          </div>
        </div>
        <style>{css}</style>
      </main>
    );
  }
  
  return <ClientOnlyHome />;
}

const css = `
.app { height: 100dvh; display:flex; flex-direction:column; }
.cam-wrap { position:relative; flex:1; background:#000; }
.cam { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.box { position:absolute; inset:0; margin:auto; width:60vmin; height:60vmin; border:2px dashed rgba(255,255,255,.8); border-radius:12px; overflow:hidden; }
.box .box-flash { position:absolute; inset:0; pointer-events:none; background:#fff; opacity:0; border-radius:inherit; animation: snapFlash 160ms ease-out; }
@keyframes snapFlash { 0% { opacity: 0; } 20% { opacity: .55; } 100% { opacity: 0; } }
.shutter {
  position:absolute; left:50%; transform:translateX(-50%);
  bottom:12px; width:56px; height:56px; border-radius:50%;
  background:#fff; border:none; font-size:24px; line-height:56px;
  box-shadow:0 4px 14px rgba(0,0,0,.25);
}

/* Results: compact horizontal carousel at bottom */
.cards.carousel {
  display:flex; gap:8px; overflow-x:auto; overflow-y:hidden; padding:8px 10px;
  background:#fff; border-top:1px solid #eee;
}
.cards.carousel::-webkit-scrollbar { height: 6px; }
.cards.carousel::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }
.card {
  display:flex; flex-direction:column; align-items:center; gap:6px;
  border:1px solid #eee; border-radius:10px; background:#fff;
  padding:6px; width:110px; flex: 0 0 110px; text-align:center;
}
.thumb { width:96px; height:72px; border-radius:8px; overflow:hidden; background:#f3f3f3; }
.thumb img { width:100%; height:100%; object-fit:contain; image-rendering:crisp-edges; }
.meta { display:flex; flex-direction:column; gap:4px; min-width:0; }
.meta.small { align-items:center; }
.title { font:500 12px/1.2 system-ui, sans-serif; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.price { color:#0a7b3f; font-weight:600; font-size:12px; }

/* Modal detail: keep image small for 80x60 sources */
.modal { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:flex-end; }
.sheet { background:#fff; width:100%; border-radius:16px 16px 0 0; padding:16px; max-height:85dvh; overflow:auto; }
.sheet img { display:block; margin:0 auto 8px; max-width:min(280px, 90vw); max-height:40vh; width:auto; height:auto; border-radius:10px; image-rendering:crisp-edges; }
.sheet h3 { font:600 16px/1.25 system-ui, sans-serif; margin-top:6px; }
.desc { color:#444; margin:8px 0; font-size:14px; }
.price-lg { font-size:18px; font-weight:700; color:#0a7b3f; }
.close { margin-top:8px; width:100%; padding:12px; border-radius:10px; border:1px solid #ddd; background:#fafafa; }

@media (min-width: 520px) { .card { width:120px; flex-basis:120px; } }
`;
