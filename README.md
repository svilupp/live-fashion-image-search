# Fashion Image Search

A client-side live image search application that runs entirely in the browser
using computer vision and machine learning. Point your camera at fashion items
to find visually similar products in real-time.

## Features

- 📷 **Live Camera Search** - Real-time image capture and search
- 🧠 **Client-Side ML** - CLIP vision model runs entirely in browser
- ⚡ **Instant Results** - Vector similarity search with sub-second response
- 👗 **Fashion Dataset** - Curated collection of clothing and accessories
- 🔒 **Privacy First** - All processing happens locally, no images sent to
  servers
- 📱 **Mobile Optimized** - Touch-friendly interface with camera access

## Getting Started

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

## Deployment

### Deno Deploy

After building the index and running a production build:

```bash
deno task build-index
deno task build
deno run -A jsr:@deno/deployctl deploy --entrypoint server.ts
```

The application serves static assets and a minimal API for vector search, with
all ML processing happening in the browser.

---
