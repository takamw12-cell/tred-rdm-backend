#!/usr/bin/env bash
# Rend les pilotes TikTok / Snapchat « Survive Your Klausur » (1080 × 1920,
# H.264 crf 18, preset veryslow), un par un, à partir d'un bundle unique.
#
#   scripts/tiktok-render.sh                          (les 3)
#   scripts/tiktok-render.sh SK-1-Die-Klausur-morgen
#
# Sorties : out/tiktok/<id>.mp4 (ou TIKTOK_OUT=<dossier>).
#
# Clips face caméra du fondateur : public/facecam/intro.* et outro.* (voir le
# LISEZ-MOI du dossier). Le script les annonce, mesure leur durée et la passe à
# SK-3, qui taille ses scènes dessus. Ils sont lus au moment du bundle : avec
# TIKTOK_BUNDLE=<bundle déjà fait>, un clip ajouté depuis n'est pas vu.
# Avec TIKTOK_DELIVER=<dossier> (et ffmpeg dans le PATH, ou FFMPEG=<chemin>) :
# une copie prête à publier y est écrite — même image, son ramené à −15 LUFS
# sans crête au-dessus de −2 dBFS, et en-tête au début du fichier (lecture
# immédiate, « faststart »).
set -u
cd "$(dirname "$0")/.."

# ── Clips face caméra ───────────────────────────────────────────────────
FACECAM_PROPS=""
probe() { # durée (s) d'un clip, avec le ffprobe livré avec Remotion
  local dir
  dir=$(ls -d node_modules/@remotion/compositor-* 2>/dev/null | while read -r d; do [ -x "$d/ffprobe" ] && echo "$d" && break; done)
  [ -n "$dir" ] && LD_LIBRARY_PATH="$PWD/$dir" "$dir/ffprobe" -v error -show_entries format=duration -of csv=p=0 "$1" 2>/dev/null | tr -d '\r' | head -1
}
if [ -d public/facecam ]; then
  for f in public/facecam/*; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    [ "$base" = "README.md" ] && continue
    stem=$(printf '%s' "${base%.*}" | tr '[:upper:]' '[:lower:]')
    ext=$(printf '%s' "${base##*.}" | tr '[:upper:]' '[:lower:]')
    case "$ext" in mp4 | mov | webm) ;; *) echo "face caméra : « $base » ignoré (formats acceptés : .mp4, .mov, .webm)"; continue ;; esac
    case "$stem" in
      intro | outro)
        secs=$(probe "$f")
        if printf '%s' "$secs" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
          echo "face caméra : $stem = « $base » ($secs s)"
          FACECAM_PROPS="${FACECAM_PROPS:+$FACECAM_PROPS,}\"${stem}Seconds\":$secs"
        else
          echo "face caméra : $stem = « $base » (durée illisible : le clip est supposé assez long)"
        fi
        ;;
      *) echo "face caméra : « $base » ignoré — renomme-le en intro.$ext ou outro.$ext" ;;
    esac
  done
fi
[ -n "$FACECAM_PROPS" ] && FACECAM_PROPS="{$FACECAM_PROPS}"

BUNDLE="${TIKTOK_BUNDLE:-$(mktemp -d)/bundle}"
[ -f "$BUNDLE/index.html" ] || npx remotion bundle src/index.ts --out-dir="$BUNDLE" >/dev/null
ALL="SK-1-Die-Klausur-morgen SK-2-Physik-verstehen SK-3-Founder-Story"
FF="${FFMPEG:-ffmpeg}"
# Un ffmpeg Windows (…/ffmpeg.exe) lancé depuis WSL ne comprend pas « /mnt/c/… » : on lui donne le chemin Windows.
native() { case "$FF" in *.exe) wslpath -w "$1" 2>/dev/null || printf '%s' "$1" ;; *) printf '%s' "$1" ;; esac; }
OUT="${TIKTOK_OUT:-out/tiktok}"
mkdir -p "$OUT"
for id in ${@:-$ALL}; do
  start=$(date +%s)
  extra=()
  # Seule SK-3 a des emplacements face caméra.
  [ "$id" = "SK-3-Founder-Story" ] && [ -n "$FACECAM_PROPS" ] && extra=(--props="$FACECAM_PROPS")
  if npx remotion render "$BUNDLE" "$id" "$OUT/$id.mp4" --scale=2 --codec=h264 --crf=18 --x264-preset=veryslow --concurrency=2 --audio-bitrate=192k --log=error "${extra[@]}"; then
    echo "$id : rendu en $(( $(date +%s) - start )) s"
    if [ -n "${TIKTOK_DELIVER:-}" ] && command -v "$FF" >/dev/null; then
      mkdir -p "$TIKTOK_DELIVER"
      "$FF" -hide_banner -loglevel error -y -i "$(native "$OUT/$id.mp4")" -c:v copy \
        -af "loudnorm=I=-15:TP=-2.5:LRA=11,alimiter=limit=0.79:level=disabled" -ar 48000 -c:a aac -b:a 192k \
        -movflags +faststart "$(native "$TIKTOK_DELIVER/$id.mp4")" </dev/null && echo "$id : livré dans $TIKTOK_DELIVER"
    fi
  else
    echo "$id : ÉCHEC"
  fi
done
