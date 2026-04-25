#!/usr/bin/env sh
set -eu

PLUGIN_NAME="tabby-ai-terminal"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
EXPORT_DIR="$SCRIPT_DIR/export"
PACKAGE_DIR="$EXPORT_DIR/node_modules/$PLUGIN_NAME"

cd "$SCRIPT_DIR"

if command -v npm.cmd >/dev/null 2>&1; then
    NPM="npm.cmd"
else
    NPM="npm"
fi

"$NPM" run build

rm -rf "$EXPORT_DIR"
mkdir -p "$PACKAGE_DIR/dist"

cp "$SCRIPT_DIR/dist/index.js" "$PACKAGE_DIR/dist/index.js"
cp "$SCRIPT_DIR/dist/index.js.map" "$PACKAGE_DIR/dist/index.js.map"

cat > "$PACKAGE_DIR/package.json" <<'EOF'
{
  "name": "tabby-ai-terminal",
  "version": "1.0.231-nightly.0",
  "description": "AI-assisted terminal panel for Tabby",
  "keywords": [
    "tabby-plugin"
  ],
  "main": "dist/index.js",
  "author": "Tabby Developers",
  "license": "MIT",
  "peerDependencies": {
    "@angular/core": "^15",
    "tabby-core": "*",
    "tabby-terminal": "*"
  }
}
EOF

cat > "$PACKAGE_DIR/README.md" <<'EOF'
# tabby-ai-terminal

AI-assisted terminal panel plugin for Tabby.

- Toggle the panel from the toolbar or with `Alt-I`.
- Works with terminal tabs such as Local, SSH, Serial, and Telnet.
- Captures recent terminal output for analysis.
- Provides suggested commands and a Sender draft area.
EOF

if ! command -v tar >/dev/null 2>&1; then
    echo "error: tar command is required" >&2
    exit 1
fi

tar -a -cf "$EXPORT_DIR/$PLUGIN_NAME.zip" -C "$EXPORT_DIR/node_modules" "$PLUGIN_NAME"

echo "Packaged plugin: $PACKAGE_DIR"
echo "Created archive: $EXPORT_DIR/$PLUGIN_NAME.zip"
