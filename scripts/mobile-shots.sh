#!/usr/bin/env bash
# Screenshots of the phone-layout preview (mobile-preview.html, sample data)
# at iPhone size (414x896 CSS px, 2x). Needs the dev server running
# (`npm run dev`, or point MOBILE_PREVIEW_URL at another port) and the
# agent-browser CLI.
#
#   scripts/mobile-shots.sh <outdir> [screen ...]
#
# With no screens it shoots the reference set, in the order of the reference
# screenshots: home home-scrolled workspace board item-updates board-scrolled
# sheet-status sheet-date sheet-files sheet-date2 sheet-timeline sheet-views.
set -euo pipefail

OUT="${1:?usage: scripts/mobile-shots.sh <outdir> [screen ...]}"
shift || true
BASE="${MOBILE_PREVIEW_URL:-http://localhost:5173/mobile-preview.html}"
SESSION="${AB_SESSION:-mobile-shots}"
EXTRA="${MOBILE_PREVIEW_EXTRA:-}"   # e.g. "&theme=dark"

if [ "$#" -eq 0 ]; then
  set -- home home-scrolled workspace board item-updates board-scrolled \
         sheet-status sheet-date sheet-files sheet-date2 sheet-timeline sheet-views
fi

mkdir -p "$OUT"
agent-browser --session "$SESSION" set viewport 414 896 2 >/dev/null
for screen in "$@"; do
  agent-browser --session "$SESSION" open "${BASE}?screen=${screen}${EXTRA}" >/dev/null
  agent-browser --session "$SESSION" wait --load networkidle >/dev/null 2>&1 || true
  agent-browser --session "$SESSION" wait 900 >/dev/null
  agent-browser --session "$SESSION" screenshot "$OUT/${screen}.png" >/dev/null
  echo "$OUT/${screen}.png"
done
