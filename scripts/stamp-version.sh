#!/bin/sh
set -e

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TARGET_FILE="$ROOT_DIR/script.js"
STAMP="$(date "+%Y-%m-%d %H:%M")"

if [ ! -f "$TARGET_FILE" ]; then
  echo "stamp-version: missing $TARGET_FILE" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
sed "s/^const VERSION = \".*\";/const VERSION = \"$STAMP\";/" "$TARGET_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$TARGET_FILE"
