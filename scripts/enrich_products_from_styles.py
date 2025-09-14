#!/usr/bin/env python3
"""
Enrich data/products.jsonl using per-product JSON files in a styles directory.

For each product id found in --in-json, this script will:
  - Load <styles_dir>/<id>.json if present
  - Extract richer metadata (brand, gender, categories, attributes)
  - Synthesize/overwrite the description field with a concise summary
  - Preserve id, image, title, price (unless title is missing -> use productDisplayName)

Usage:
  python3 scripts/enrich_products_from_styles.py \
    --styles /Users/jsiml/Documents/data/fashion-dataset/styles \
    --in-json data/products.jsonl \
    --out-json data/products.jsonl
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re


def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def write_jsonl(path: Path, rows):
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def safe_load(path: Path):
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def pick(*vals):
    for v in vals:
        if v is None:
            continue
        if isinstance(v, str):
            s = v.strip()
            if s:
                return s
        else:
            return v
    return None


def _root(js: dict) -> dict:
    if isinstance(js, dict) and isinstance(js.get("data"), dict):
        return js["data"]
    return js or {}


_TAG_RE = re.compile(r"<[^>]+>")


def _clean_html(s: str) -> str:
    s = _TAG_RE.sub(" ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def extract_descriptors(js: dict) -> list[str]:
    js = _root(js)
    out: list[str] = []
    if not isinstance(js, dict):
        return out
    # Some datasets include a 'productDescriptors' key as dict or list
    desc = js.get("productDescriptors")
    if isinstance(desc, dict):
        # flatten first level values
        for k, v in desc.items():
            if isinstance(v, str) and v.strip():
                out.append(_clean_html(v))
            elif isinstance(v, (list, tuple)):
                for x in v:
                    if isinstance(x, str) and x.strip():
                        out.append(_clean_html(x))
    elif isinstance(desc, (list, tuple)):
        for el in desc:
            if isinstance(el, str) and el.strip():
                out.append(_clean_html(el))
            elif isinstance(el, dict):
                t = pick(el.get("type"), el.get("descriptorType"))
                val = pick(el.get("value"), el.get("description"))
                if val:
                    out.append(_clean_html(str(val)))
                elif t:
                    out.append(str(t))
    # Also look for generic 'description' or 'shortDescription'
    for k in ("description", "shortDescription", "longDescription"):
        v = js.get(k)
        if isinstance(v, str) and v.strip():
            out.append(v.strip())
    # Dedup, keep order, cap length
    seen = set()
    uniq = []
    for s in out:
        if s in seen:
            continue
        seen.add(s)
        uniq.append(s)
        if len(uniq) >= 3:  # keep it short
            break
    return uniq


def compose_description(js: dict) -> str:
    js = _root(js)
    brand = pick(js.get("brand"), js.get("brandName"))
    def S(x):
        if x is None:
            return None
        if isinstance(x, (dict, list, tuple)):
            return None
        return str(x).strip()

    parts = [
        S(brand),
        S(js.get("gender")),
        S(js.get("masterCategory")),
        S(js.get("subCategory")),
        S(js.get("articleType")),
        S(js.get("baseColour")),
    ]
    season = pick(js.get("season"))
    year = pick(js.get("year"))
    usage = pick(js.get("usage"))
    if season or year:
        parts.append(" ".join([S(x) for x in (season, year) if S(x)]))
    if usage:
        parts.append(S(usage))

    # Append a short tail of descriptors
    tail = extract_descriptors(js)
    desc = " • ".join([p for p in parts if p])
    if tail:
        # Keep a short tail; trim overly long strings
        tail_str = "; ".join([t[:80] for t in tail])
        desc = f"{desc} — {tail_str}" if desc else tail_str

    # Cap total length
    return (desc or "").strip()[:240]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--styles", default="/Users/jsiml/Documents/data/fashion-dataset/styles")
    ap.add_argument("--in-json", default="data/products.jsonl")
    ap.add_argument("--out-json", default="data/products.jsonl")
    args = ap.parse_args()

    styles_dir = Path(args.styles)
    in_path = Path(args.in_json)
    out_path = Path(args.out_json)

    rows = list(read_jsonl(in_path))
    out_rows = []
    enriched = 0

    for r in rows:
        pid = str(r.get("id"))
        style_path = styles_dir / f"{pid}.json"
        js = safe_load(style_path)
        if js:
            # Update title if missing; otherwise keep existing title
            root = _root(js)
            if not r.get("title"):
                title = pick(root.get("productDisplayName"), root.get("title"))
                if title:
                    r["title"] = title

            # Overwrite/compose description
            desc = compose_description(js)
            if desc:
                r["description"] = desc
                enriched += 1
        out_rows.append(r)

    write_jsonl(out_path, out_rows)
    print(f"✅ Enriched {enriched}/{len(rows)} items -> {out_path}")


if __name__ == "__main__":
    main()
