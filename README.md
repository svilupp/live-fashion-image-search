# Live Fashion Image Search

A client-side live image search application that runs entirely in the browser
using computer vision and machine learning. Point your camera at fashion items
to find visually similar products in real-time.

## Features

- **Live Camera Search** - Real-time image capture and search
- **Client-Side ML** - CLIP vision model runs entirely in browser
- **Instant Results** - Vector similarity search with sub-second response
- **Fashion Dataset** - Curated collection of clothing and accessories
- **Privacy First** - All processing happens locally, no images sent to servers
- **Mobile Optimized** - Touch-friendly interface with camera access

## Getting Started

Try it live: [HERE](https://fashion-image-search.svilupp.deno.net/)

### Installation

Install the dependencies:

```bash
deno install
```

### Development

Start the development server with HMR:

```bash
deno task dev
```

Your application will be available at `http://localhost:5173`.

### Build Vector Search Index

Before using the search functionality, build the embeddings index from fashion
images:

```bash
deno task build-index
```

## Building for Production

Create a production build:

```bash
deno task build
```

## How It Works

1. **Camera Capture** - Access device camera and capture fashion images
2. **Feature Extraction** - CLIP vision transformer processes images client-side
3. **Vector Quantization** - Convert 512-dim features to Int8 for efficiency
4. **Similarity Search** - Compare against pre-built fashion product index
5. **Results Display** - Show visually similar items with scores and details

## Architecture

- **Frontend**: React Router 7 with client-side ML processing
- **ML Model**: Hugging Face Transformers.js (CLIP-ViT-Base-Patch32)
- **Search**: Dot-product similarity on quantized vectors
- **Data**: Fashion product images with embeddings index
- **Runtime**: Deno with modern JavaScript APIs

### Improvement Notes

- Adding crop box was crucial for performance (it struggles with domain drift:
  photo vs catalog image)
- Model B32 (patch 32) - loads in 7-10s (subsequent loads are 200ms, it's cached), embedding takes ~200-400ms
- Model B16 (patch 16) - load was 7-10s, embedding takes
  ~1.2s
- Image search (5K products): ~21s (of which indexing is 15ms and scoring ~4ms)

Improvements:

- Add linear adapter to align photos vs catalog
- Rebalance the random product sample (too heavy on pants and shorts)

## Deployment

### Deno Deploy

After building the index and running a production build:

```bash
deno task build-index
deno task build
deno run -A jsr:@deno/deployctl deploy --entrypoint server.ts
```

The application serves static assets via R2 bucket and a minimal API for vector
search, with all ML processing happening in the browser.

---
