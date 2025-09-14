#!/usr/bin/env python3
"""
Prepare 5,000 random products from a local fashion dataset.

Defaults assume the dataset layout:
  - CSV:   /Users/jsiml/Documents/data/fashion-dataset/styles.csv
  - IMAGES:/Users/jsiml/Documents/data/fashion-dataset/images
  - (Optional JSONs not required for this script.)

Outputs:
  - Copies images to   public/products/<id><ext>
  - Writes             data/products.jsonl with fields:
      {id, image:"/products/<id><ext>", title, price, description}

Usage:
  python3 scripts/prepare_products_local.py \
    --csv /path/to/styles.csv \
    --images /path/to/images \
    --out-json data/products.jsonl \
    --out-images public/products \
    --count 5000
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import shutil
from pathlib import Path


def find_image_path(images_dir: Path, pid: str) -> Path | None:
    # Common extensions
    exts = [".jpg", ".jpeg", ".png", ".webp", ".JPG", ".JPEG", ".PNG"]
    for ext in exts:
        candidate = images_dir / f"{pid}{ext}"
        if candidate.exists():
            return candidate
    return None


def build_description(row: dict) -> str:
    parts = [
        row.get("gender"),
        row.get("masterCategory"),
        row.get("subCategory"),
        row.get("articleType"),
        row.get("baseColour"),
    ]
    return " • ".join([p for p in parts if p])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="/Users/jsiml/Documents/data/fashion-dataset/styles.csv")
    parser.add_argument("--images", default="/Users/jsiml/Documents/data/fashion-dataset/images")
    parser.add_argument("--out-json", default="data/products.jsonl")
    parser.add_argument("--out-images", default="public/products")
    parser.add_argument("--count", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    csv_path = Path(args.csv)
    images_dir = Path(args.images)
    out_json = Path(args.out_json)
    out_images = Path(args.out_images)

    assert csv_path.exists(), f"CSV not found: {csv_path}"
    assert images_dir.exists(), f"Images dir not found: {images_dir}"
    out_images.mkdir(parents=True, exist_ok=True)
    out_json.parent.mkdir(parents=True, exist_ok=True)

    # Load CSV rows
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # Filter rows that have an existing image file
    candidates = []
    for r in rows:
        pid = str(r.get("id") or r.get("Id") or r.get("ID") or "").strip()
        if not pid:
            continue
        img_path = find_image_path(images_dir, pid)
        if img_path is None:
            continue
        candidates.append((pid, r, img_path))

    if not candidates:
        raise SystemExit("No candidates with images found.")

    random.seed(args.seed)
    sample = random.sample(candidates, k=min(args.count, len(candidates)))

    # Write JSONL and copy images
    written = 0
    with out_json.open("w", encoding="utf-8") as jf:
        for pid, r, src_img in sample:
            ext = src_img.suffix.lower()
            # Keep original extension to avoid re-encoding
            dest_rel = f"/products/{pid}{ext}"
            dest_abs = out_images / f"{pid}{ext}"
            # Copy/overwrite
            shutil.copy2(src_img, dest_abs)

            title = r.get("productDisplayName") or r.get("productDisplayName_en") or pid
            description = build_description(r)
            price = round(random.random() * 120 + 5, 2)
            row = {
                "id": pid,
                "image": dest_rel,
                "title": title,
                "price": price,
                "description": description,
            }
            jf.write(json.dumps(row, ensure_ascii=False) + "\n")
            written += 1

    print(f"✅ Wrote {written} products to {out_json} and images to {out_images}")


if __name__ == "__main__":
    main()

