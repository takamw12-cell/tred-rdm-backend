#!/usr/bin/env bash
# Rend les courts-métrages « Cinematic » un par un (garde-fou mémoire :
# --concurrency=1, jamais deux rendus à la fois), à partir d'un bundle unique.
#
#   scripts/cinematic-render.sh                 (les 12 films)
#   scripts/cinematic-render.sh Cine-EN-1-The-Night-Before Cine-B-DE-2-Null-Halluzinationen
#
# Sorties : out/cinematic/<id>.mp4 (1920 × 1080, H.264 14 Mbit/s : le grain
# rend le CRF inutilisable — 3 s pesaient 17 Mo).
set -u
cd "$(dirname "$0")/.."
BUNDLE="${CINE_BUNDLE:-$(mktemp -d)/bundle}"
[ -f "$BUNDLE/index.html" ] || npx remotion bundle src/index.ts --out-dir="$BUNDLE" >/dev/null
ALL="Cine-EN-1-The-Night-Before Cine-EN-2-The-Group-Project Cine-EN-3-The-Transfer-Student Cine-DE-1-Die-Nacht-vor-der-Klausur Cine-DE-2-Die-Lerngruppe Cine-DE-3-Der-Austauschstudent Cine-B-EN-1-The-Magic-Button Cine-B-EN-2-Zero-Hallucination Cine-B-EN-3-The-Universal-Brain Cine-B-DE-1-Der-magische-Button Cine-B-DE-2-Null-Halluzinationen Cine-B-DE-3-Das-universelle-Gehirn"
mkdir -p out/cinematic
for id in ${@:-$ALL}; do
  start=$(date +%s)
  if npx remotion render "$BUNDLE" "$id" "out/cinematic/$id.mp4" --concurrency=1 --codec=h264 --video-bitrate=14M --audio-bitrate=192k --log=error; then
    echo "$id : rendu en $(( $(date +%s) - start )) s"
  else
    echo "$id : ÉCHEC"
  fi
done
