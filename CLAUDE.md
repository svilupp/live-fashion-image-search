# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development Tasks
- `deno task dev` - Start development server with HMR at http://localhost:5173
- `deno task build` - Create production build
- `deno task start` - Run production server (requires build first)
- `deno task typecheck` - Run TypeScript type checking (depends on typegen)
- `deno task typegen` - Generate route types for React Router

### Vector Search Index Management
- `deno task build-index` - Build full embeddings index from product data
- `deno task build-index:stub` - Build stub index for development
- `deno task test-search` - Test vector search with sample image

### Installation
- `deno install` - Install dependencies

## Architecture Overview

This is a **fashion image search application** built with React Router 7 and Deno, featuring real-time camera-based visual search using CLIP embeddings.

### Core Components

**Frontend (app/routes/home.tsx)**
- Camera interface for capturing fashion images
- Real-time image encoding using Hugging Face Transformers (CLIP model)
- Vector quantization (Float32 → Int8) for efficient network transfer
- Horizontal scrolling results carousel with modal detail views

**Vector Search API (app/routes/api.vector-search.ts)**
- Receives base64-encoded Int8 query vectors
- Performs dot-product similarity search against pre-built index
- Returns top-k matches with scores and metadata

**Index System (app/lib/index-store.server.ts)**
- In-memory vector index loaded once on server startup
- Stores quantized Int8 vectors with product metadata (id, image, title, price, description)
- Uses dot-product for cosine similarity approximation

### Data Flow
1. User captures image via camera
2. Client-side CLIP model extracts 512-dim features
3. Features normalized (L2) and quantized to Int8
4. Encoded vector sent to `/api/vector-search`
5. Server computes similarity against all indexed products
6. Top matches returned and displayed

### File Structure
- `app/routes/` - React Router 7 routes
- `app/lib/` - Shared utilities (vector operations, index loading)
- `app/data/index.json` - Pre-built vector index with product embeddings
- `scripts/` - Build tools for creating embeddings index
- `public/products/` - Product images served statically
- `instrumentation.ts` - OpenTelemetry tracing for React Router

### Technology Stack
- **Runtime**: Deno with React Router 7
- **ML**: Hugging Face Transformers.js (CLIP-ViT-Base-Patch32)
- **Styling**: Inline CSS-in-JS, Tailwind CSS available
- **Monitoring**: OpenTelemetry with structured logging

## Development Notes

### Vector Search Performance
- Index loads once into memory on first request
- All operations are synchronous after initial load
- Dot-product similarity is computed for every item (brute force)
- Results include timing metrics for each pipeline stage

### Camera Integration
- Uses `getUserMedia` with environment-facing camera preference
- Canvas-based image capture for ML processing
- Automatic model warming on component mount

### Build Process
- `deno task build` creates optimized client/server bundles
- Server serves static assets with cache headers
- OpenTelemetry instrumentation wraps route handlers