#!/bin/bash
# Figma node organizer - OPTIONAL local relay launcher (macOS, double-click).
# Default mode needs NO terminal: the plugin calls the LLM gateway directly.
# Use this only when the gateway blocks the plugin with a CORS error.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found. Install Node 18+ from https://nodejs.org and retry."
  echo
  echo "Press any key to close..."
  read -n 1 -s
  exit 1
fi

echo "[figma-relay] Node $(node -v) | starting on ws://localhost:3055 ..."
echo "[figma-relay] Keep this window open. Go back to Figma and click 'Connect local proxy'."
echo "[figma-relay] Press Ctrl+C to stop."
echo
node socket-server.mjs
code=$?
echo
echo "[figma-relay] exited with code $code"
echo "Press any key to close..."
read -n 1 -s
