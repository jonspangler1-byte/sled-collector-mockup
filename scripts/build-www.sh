#!/usr/bin/env bash
# Copies the static app into ./www for Capacitor (iOS/Android wrapper). See docs/go-live.md → App stores.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf www && mkdir -p www
cp -r index.html app.js cloud.js config.js data.js map-pins.js timeline.js articles.js events.js sw.js styles.css manifest.webmanifest images icons vendor www/
echo "www/ ready ($(du -sh www | cut -f1)). Next: npx cap sync"
