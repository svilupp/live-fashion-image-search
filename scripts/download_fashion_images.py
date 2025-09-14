# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "datasets",
#     "pillow",
# ]
# ///

#!/usr/bin/env python3
from datasets import load_dataset
from pathlib import Path
import json

# -------- Config --------
DATASET_NAME = "ashraq/fashion-product-images-small"
LIMIT = 5000
IMG_DIR = Path("public/products")          # where images go
OUT_DIR = Path("data")               # where JSONL files go
JSONL_BY_SPLIT = False             # True => one JSONL per split
# ------------------------

IMG_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

ds = load_dataset(DATASET_NAME)

def to_serializable(ex):
    """Drop PIL image, add image_path."""
    d = {k: v for k, v in ex.items() if k != "image"}
    img_id = d.get("id")
    if img_id is None:
        # Fallback if id is missing for some reason
        raise ValueError("Example is missing 'id' field; cannot name image file.")
    d["image_path"] = str(IMG_DIR / f"{img_id}.jpg")
    return d

def save_image(pil_img, img_path):
    # Ensure parent exists; convert to RGB for JPEG and save
    img_path.parent.mkdir(parents=True, exist_ok=True)
    pil_img.convert("RGB").save(img_path, format="JPEG", quality=90, optimize=True)

def process_split(split_name, split_data):
    subset = split_data.select(range(min(LIMIT, len(split_data))))
    out_jsonl = OUT_DIR / f"{split_name}.jsonl" if JSONL_BY_SPLIT else OUT_DIR / "products.jsonl"

    count = 0
    with out_jsonl.open("w", encoding="utf-8") as f:
        for ex in subset:
            # Save image to public/{id}.jpg
            img_obj = ex.get("image", None)
            img_id = ex.get("id", None)
            if img_obj is None or img_id is None:
                # Skip if critical fields are missing
                continue

            img_path = IMG_DIR / f"{img_id}.jpg"
            # If multiple splits share an id, last write wins (fine for most cases)
            save_image(img_obj, img_path)

            # Write JSONL row without the image object
            row = to_serializable(ex)
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1

    print(f"✅ {split_name}: saved {count} items to {out_jsonl} and images to {IMG_DIR}/")

process_split("train", ds["train"])

print("✨ Done.")
