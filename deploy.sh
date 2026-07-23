#!/usr/bin/env bash
set -euo pipefail

# Deploy settings
TARGET_HOST="${1:-}"
TARGET_SSH_PORT="${2:-}"
TARGET_USER="${3:-}"
TARGET_PASSWORD="${4:-}"
REMOTE_DIR="${5:-}"

if [[ -z "$TARGET_HOST" ]]; then
    read -r -p "Server address: " TARGET_HOST
fi
if [[ -z "$TARGET_SSH_PORT" ]]; then
    read -r -p "SSH port [22]: " TARGET_SSH_PORT
fi
if [[ -z "$TARGET_USER" ]]; then
    read -r -p "SSH user: " TARGET_USER
fi
if [[ -z "$TARGET_PASSWORD" ]]; then
    read -r -s -p "SSH password (leave empty for key/agent auth): " TARGET_PASSWORD
    echo
fi
if [[ -z "$REMOTE_DIR" ]]; then
    read -r -p "Remote dir [~/apps/eggplant]: " REMOTE_DIR
fi

TARGET_SSH_PORT="${TARGET_SSH_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-apps/eggplant}"
SSH_DEST="${TARGET_USER}@${TARGET_HOST}"

if [[ -n "$TARGET_PASSWORD" ]]; then
    if ! command -v sshpass >/dev/null 2>&1; then
        echo "sshpass is required to pass a password. Install it." >&2
        exit 1
    fi
    export SSHPASS="$TARGET_PASSWORD"
    SSH_CMD=(sshpass -e ssh)
else
    SSH_CMD=(ssh)
fi

SSH_CMD+=(-o StrictHostKeyChecking=accept-new -p "$TARGET_SSH_PORT")

RSH_STR="${SSH_CMD[*]}"

# Sync project files. Production .env is excluded from the sync (matches no
# --include rule), so rsync --delete leaves the server's own .env untouched.
rsync --mkpath \
    --archive \
    --verbose \
    --compress \
    --delete \
    --checksum \
    --chmod=D755,F644 \
    --include="Caddyfile" \
    --include="compose.prod.yml" \
    --include="livekit.prod.yml" \
    --include="package.json" \
    --include="package-lock.json" \
    --include="frontend/" \
    --include="frontend/dist/***" \
    --include="backend/" \
    --exclude="backend/node_modules" \
    --exclude="backend/dist" \
    --include="backend/***" \
    --include="shared/***" \
    --exclude="*" \
    --rsh="$RSH_STR" \
    ./ "$SSH_DEST:$REMOTE_DIR/"

# Deploy
"${SSH_CMD[@]}" "$SSH_DEST" "cd $REMOTE_DIR && docker compose --file compose.prod.yml up --detach --force-recreate --remove-orphans --build"

# Show status
"${SSH_CMD[@]}" "$SSH_DEST" "cd $REMOTE_DIR && docker compose --file compose.prod.yml ps"
