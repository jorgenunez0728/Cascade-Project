#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# KIA EmLab — Firebase Hosting deploy
# Builds the unified HTML, assembles a dist/ folder with everything
# Firebase Hosting needs (icons, manifest, sw.js), then deploys.
#
# Usage:
#   ./deploy.sh           # builds and deploys to default channel (live)
#   ./deploy.sh --dry     # builds dist/ but skips firebase deploy
#   ./deploy.sh preview   # deploys to a "preview" channel for staging
# ═══════════════════════════════════════════════════════════════

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$DIR/dist"
MODE="${1:-live}"

echo ">> Building unified HTML..."
bash "$DIR/build.sh"

echo ">> Assembling dist/ folder..."
rm -rf "$DIST"
mkdir -p "$DIST"

# Hosted as index.html so manifest's start_url=./index.html works seamlessly
cp "$DIR/kia-emlab-unified.html" "$DIST/index.html"
cp "$DIR/manifest.json" "$DIST/"
cp "$DIR/sw.js" "$DIST/"
cp -r "$DIR/icons" "$DIST/"

echo "   dist/ contents:"
ls -1 "$DIST"
du -sh "$DIST" | awk '{print "   total: "$1}'

if [ "$MODE" = "--dry" ]; then
    echo ">> Dry run — skipping firebase deploy. dist/ ready for manual upload."
    exit 0
fi

# Firebase CLI must be authenticated and a firebase.json must exist with "hosting": { "public": "dist" }
if ! command -v firebase &> /dev/null; then
    echo "!! firebase CLI not found. Install with: npm install -g firebase-tools"
    echo "   Then run:   firebase login   &&   firebase init hosting"
    exit 1
fi

if [ ! -f "$DIR/firebase.json" ]; then
    echo "!! firebase.json not found. Initialize with: firebase init hosting"
    echo "   Public directory: dist"
    echo "   Single-page app: No"
    exit 1
fi

if [ "$MODE" = "preview" ]; then
    echo ">> Deploying to preview channel..."
    firebase hosting:channel:deploy preview --only hosting
else
    echo ">> Deploying to live..."
    firebase deploy --only hosting
fi
