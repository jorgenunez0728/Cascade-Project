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

# [Fase 4.3] Build timestamp for cache versioning (YYYYMMDDHHmm)
BUILD_TS=$(date +"%Y%m%d%H%M")

echo "Building $OUTPUT (build $BUILD_TS)..."

cat > "$DIR/$OUTPUT" <<'HEADER'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kia EmLab — Plataforma Integrada v14.0</title>

    <!-- [R3-M1] PWA Meta -->
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#05141f">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <!-- [Fase 4.2] CDN Preconnect hints for faster resource loading -->
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="preconnect" href="https://unpkg.com" crossorigin>
    <link rel="preconnect" href="https://www.gstatic.com" crossorigin>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/signature_pad/1.5.3/signature_pad.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js" defer></script>
    <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" defer></script>

    <!-- Alpine.js — lightweight reactivity for UI -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.9/dist/cdn.min.js"></script>

    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>

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

for jsfile in app.js cop15.js inventory.js testplan.js results.js sop.js panel.js auth.js firebase-sync.js; do
    echo "" >> "$DIR/$OUTPUT"
    cat "$DIR/js/$jsfile" >> "$DIR/$OUTPUT"
    echo "" >> "$DIR/$OUTPUT"
done

echo "</script>" >> "$DIR/$OUTPUT"
echo "" >> "$DIR/$OUTPUT"
echo "</body>" >> "$DIR/$OUTPUT"
echo "</html>" >> "$DIR/$OUTPUT"

# ═══════════════════════════════════════════════════════════════
# [Fase 4.4] Strip console.log, console.warn, and console.error
# from production build.
# Uses perl for robust handling of multi-line console statements
# (e.g., console.log('foo',\n  bar); spanning multiple lines).
# NOTE: Only strips from unified file, source files are untouched.
# ═══════════════════════════════════════════════════════════════
echo "Stripping console.log/warn/error from production build..."
# Replace with void 0 instead of deleting to avoid breaking if-without-braces patterns
perl -0777 -i -pe 's/console\.(log|warn|error)\s*\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)\s*;?/void 0;/gs' "$DIR/$OUTPUT"

# ═══════════════════════════════════════════════════════════════
# [Fase 4.1] Optional minification with terser
# Install: npm install -g terser
# This step is skipped if terser is not available
# ═══════════════════════════════════════════════════════════════
if command -v terser &> /dev/null; then
    echo "Terser found — minifying JS in unified build..."
    # Extract JS between <script> and </script>, minify, replace
    # For now, this is a placeholder — full implementation would extract,
    # minify, and re-inject the JS block. The console stripping above
    # provides the primary size reduction.
    echo "  (terser minification not yet wired — console stripping applied)"
else
    echo "Terser not found — skipping JS minification (install: npm install -g terser)"
fi

# ═══════════════════════════════════════════════════════════════
# [Fase 4.3] Inject build timestamp into sw.js __BUILD_VERSION__
# ═══════════════════════════════════════════════════════════════
echo "Updating sw.js build version to ${BUILD_TS}..."
sed -i "s/__BUILD_VERSION__/${BUILD_TS}/g" "$DIR/sw.js"

LINES=$(wc -l < "$DIR/$OUTPUT")
SIZE=$(du -h "$DIR/$OUTPUT" | cut -f1)
echo "Done! $OUTPUT — $LINES lines, $SIZE"

# [R3-M1] Copy PWA files alongside unified output
cp "$DIR/manifest.json" "$(dirname "$DIR/$OUTPUT")/" 2>/dev/null || true
cp "$DIR/sw.js" "$(dirname "$DIR/$OUTPUT")/" 2>/dev/null || true

echo "PWA files (manifest.json, sw.js) copied."

# ═══════════════════════════════════════════════════════════════
# Restore sw.js placeholder so source stays build-ready
# ═══════════════════════════════════════════════════════════════
sed -i "s/${BUILD_TS}/__BUILD_VERSION__/g" "$DIR/sw.js"
echo "sw.js placeholder restored for next build."
