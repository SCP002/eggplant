#!/usr/bin/env bash
set -euo pipefail
mkdir -p assets
convert -background none -density 512 ../public/eggplant.svg -resize 256x256 assets/icon.png
convert -background none -density 512 ../public/eggplant.svg -resize 16x16 assets/tray.ico
cat > app-config.json <<EOF
{"appUrl": "https://${PROD_DOMAIN:-localhost}"}
EOF
