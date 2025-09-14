BUCKET=deno-image-search
SRC=product_images

find "$SRC" -type f -print0 | while IFS= read -r -d '' f; do
  rel="${f#$SRC/}"                 # e.g., "shirts/blue.jpg"
  key="product_images/$rel"              # e.g., "products/shirts/blue.jpg"
  npx wrangler r2 object put "$BUCKET/$key" --file "$f" --remote
done
