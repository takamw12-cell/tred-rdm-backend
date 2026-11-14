#!/usr/bin/env bash
# Rend les pilotes TikTok / Snapchat « Survive Your Klausur » (1080 × 1920,
# H.264 crf 18, preset veryslow), un par un, à partir d'un bundle unique.
#
#   scripts/tiktok-render.sh                          (les 3)
#   scripts/tiktok-render.sh SK-1-Die-Klausur-morgen
#
# Sorties : out/tiktok/<id>.mp4.
# Avec TIKTOK_DELIVER=<dossier> (et ffmpeg dans le PATH, ou FFMPEG=<chemin>) :
# une copie prête à publier y est écrite — même image, son ramené à −15 LUFS
# sans crête au-dessus de −2 dBFS, et en-tête au début du fichier (lecture
# immédiate, « faststart »).
set -u
cd "$(dirname "$0")/.."
BUNDLE="${TIKTOK_BUNDLE:-$(mktemp -d)/bundle}"
[ -f "$BUNDLE/index.html" ] || npx remotion bundle src/index.ts --out-dir="$BUNDLE" >/dev/null
ALL="SK-1-Die-Klausur-morgen SK-2-Physik-verstehen SK-3-Founder-Story"
FF="${FFMPEG:-ffmpeg}"
mkdir -p out/tiktok
for id in ${@:-$ALL}; do
  start=$(date +%s)
  if npx remotion render "$BUNDLE" "$id" "out/tiktok/$id.mp4" --scale=2 --codec=h264 --crf=18 --x264-preset=veryslow --concurrency=2 --audio-bitrate=192k --log=error; then
    echo "$id : rendu en $(( $(date +%s) - start )) s"
    if [ -n "${TIKTOK_DELIVER:-}" ] && command -v "$FF" >/dev/null; then
      mkdir -p "$TIKTOK_DELIVER"
      "$FF" -hide_banner -loglevel error -y -i "out/tiktok/$id.mp4" -c:v copy \
        -af "loudnorm=I=-15:TP=-2.5:LRA=11,alimiter=limit=0.79:level=disabled" -ar 48000 -c:a aac -b:a 192k \
        -movflags +faststart "$TIKTOK_DELIVER/$id.mp4" </dev/null && echo "$id : livré dans $TIKTOK_DELIVER"
    fi
  else
    echo "$id : ÉCHEC"
  fi
done
