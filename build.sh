#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# KIA EmLab — Build Script
# Generates a single unified HTML file from modular sources
# Usage: ./build.sh
# Output: kia-emlab-unified.html (offline-ready, single file)
# ═══════════════════════════════════════════════════════════════

set -e

OUTPUT="kia-emlab-unified.html"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Building $OUTPUT..."

cat > "$DIR/$OUTPUT" <<'HEADER'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kia EmLab — Plataforma Integrada v14.0</title>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/signature_pad/1.5.3/signature_pad.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.min.js"></script>

    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>

    <style>
HEADER

# Inline CSS
cat "$DIR/styles.css" >> "$DIR/$OUTPUT"

echo "    </style>" >> "$DIR/$OUTPUT"
echo "</head>" >> "$DIR/$OUTPUT"
echo "" >> "$DIR/$OUTPUT"

# Extract body content from index.html (between <body> and the script tags)
# We use sed to get everything between <body> and the JS module comment
sed -n '/<body>/,/<!-- JS Modules/{ /<!-- JS Modules/d; p; }' "$DIR/index.html" >> "$DIR/$OUTPUT"

# Inline all JS modules into a single <script> block
echo "<script>" >> "$DIR/$OUTPUT"

for jsfile in app.js cop15.js inventory.js testplan.js results.js firebase-sync.js smart-import-merge-with-history.js; do
    echo "" >> "$DIR/$OUTPUT"
    cat "$DIR/js/$jsfile" >> "$DIR/$OUTPUT"
    echo "" >> "$DIR/$OUTPUT"
done

echo "</script>" >> "$DIR/$OUTPUT"
echo "" >> "$DIR/$OUTPUT"
echo "</body>" >> "$DIR/$OUTPUT"
echo "</html>" >> "$DIR/$OUTPUT"

LINES=$(wc -l < "$DIR/$OUTPUT")
SIZE=$(du -h "$DIR/$OUTPUT" | cut -f1)
echo "Done! $OUTPUT — $LINES lines, $SIZE"
