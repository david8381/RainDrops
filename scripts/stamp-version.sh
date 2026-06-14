#!/bin/sh
# Stamp the app version and matching cache-busters into index.html.
#
# The visible version lives in `<div class="version">vX.Y.Z …</div>` and the
# cache-busting query strings are `?v=<version without dots>` on the CSS/JS tags.
# This keeps both in sync.
#
# Usage:
#   scripts/stamp-version.sh          # bump the patch (0.3.34 -> 0.3.35)
#   scripts/stamp-version.sh 0.4.0    # set an explicit version
set -e

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TARGET_FILE="$ROOT_DIR/index.html"

if [ ! -f "$TARGET_FILE" ]; then
  echo "stamp-version: missing $TARGET_FILE" >&2
  exit 1
fi

CURRENT="$(sed -n 's|.*class="version">v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*|\1|p' "$TARGET_FILE" | head -n 1)"
if [ -z "$CURRENT" ]; then
  echo "stamp-version: could not find current version in $TARGET_FILE" >&2
  exit 1
fi

if [ -n "$1" ]; then
  NEW_VERSION="$1"
else
  MAJOR="${CURRENT%%.*}"
  REST="${CURRENT#*.}"
  MINOR="${REST%%.*}"
  PATCH="${REST#*.}"
  NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
fi

# Cache-buster is the version with the dots removed (0.3.35 -> 0335).
BUSTER="$(printf '%s' "$NEW_VERSION" | tr -d '.')"

TMP_FILE="$(mktemp)"
sed \
  -e "s|\(class=\"version\">v\)[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*|\1$NEW_VERSION|" \
  -e "s|?v=[0-9][0-9]*|?v=$BUSTER|g" \
  "$TARGET_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$TARGET_FILE"

# Keep package.json in sync.
PKG_FILE="$ROOT_DIR/package.json"
if [ -f "$PKG_FILE" ]; then
  TMP_PKG="$(mktemp)"
  sed "s|\(\"version\": \"\)[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\"|\1$NEW_VERSION\"|" "$PKG_FILE" > "$TMP_PKG"
  mv "$TMP_PKG" "$PKG_FILE"
fi

echo "stamp-version: $CURRENT -> $NEW_VERSION (cache-buster ?v=$BUSTER)"
