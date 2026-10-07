#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ARCHIVE="$SCRIPT_DIR/sheba-design-reference.tar.gz"
base64 -d "$SCRIPT_DIR/sheba-design-reference.tar.gz.b64" > "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$SCRIPT_DIR"
rm "$ARCHIVE"
printf '%s\n' "Extracted to $SCRIPT_DIR/sheba-design-reference"
