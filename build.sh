#!/usr/bin/env bash
set -euo pipefail

# Builds web + native artifacts. PROD_DOMAIN is read from .env.
# By default only the web bundle is built; pass --android and/or --desktop
# to also build the native artifacts.

set -a
if [[ -f .env ]]; then
  . ./.env
fi
set +a
: "${PROD_DOMAIN:=localhost}"
BUILD_ANDROID=0
BUILD_DESKTOP=0
for arg in "$@"; do
  case "$arg" in
    --android) BUILD_ANDROID=1 ;;
    --desktop) BUILD_DESKTOP=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# Build frontend for web server
docker build --build-arg VITE_PROD_DOMAIN="$PROD_DOMAIN" --file Dockerfile.build --tag eggplant-build .
docker container create --name eggplant-temp eggplant-build
sudo chown -R $USER:$USER ./frontend/dist/
chmod -R u+rw ./frontend/dist/
docker container cp eggplant-temp:/app/frontend/dist/. ./frontend/dist/
docker container rm eggplant-temp

# Build Android
if [[ "$BUILD_ANDROID" -eq 1 ]]; then
  docker compose --project-name eggplant --file compose.dev.yml --profile build build capacitor-build \
      && docker compose --project-name eggplant --file compose.dev.yml --profile build run --rm capacitor-build
fi

# Build Windows
if [[ "$BUILD_DESKTOP" -eq 1 ]]; then
  docker compose --project-name eggplant --file compose.dev.yml --profile build build electron-build \
      && docker compose --project-name eggplant --file compose.dev.yml --profile build run --rm electron-build
fi

# Collect native app artifacts into dist for Caddy to serve
mkdir -p ./frontend/dist/downloads
if [[ "$BUILD_ANDROID" -eq 1 ]]; then
  cp ./frontend/android/app/build/outputs/apk/debug/app-debug.apk ./frontend/dist/downloads/eggplant.apk 2>/dev/null || true
fi
if [[ "$BUILD_DESKTOP" -eq 1 ]]; then
  cp ./frontend/electron/packed/eggplant-setup.exe ./frontend/dist/downloads/ 2>/dev/null || true
fi

echo "Build complete. Artifacts are in ./frontend/dist/"
