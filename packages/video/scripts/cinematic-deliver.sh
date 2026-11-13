#!/usr/bin/env bash
# Livre les courts-métrages « Cinematic » : son normalisé à −14 LUFS (l'image
# n'est pas réencodée), fichiers copiés dans les dossiers de livraison.
#
#   scripts/cinematic-deliver.sh [id …]     (sans argument : tout out/cinematic)
#
# Série A → $CINE_OUT_A (défaut : Téléchargements/TRED-Cinematic)
# Série B → $CINE_OUT_B (défaut : Téléchargements/TRED-Cinematic-V2)
set -u
cd "$(dirname "$0")/.."
A="${CINE_OUT_A:-/mnt/c/Users/HP/Downloads/TRED-Cinematic}"
B="${CINE_OUT_B:-/mnt/c/Users/HP/Downloads/TRED-Cinematic-V2}"
BIN="$PWD/node_modules/@remotion/compositor-linux-x64-gnu"
export LD_LIBRARY_PATH="$BIN"
mkdir -p "$A" "$B"
ids="${*:-$(ls out/cinematic/*.mp4 | xargs -n1 basename | sed 's/\.mp4$//')}"
for id in $ids; do
  src="out/cinematic/$id.mp4"
  [ -f "$src" ] || { echo "$id : pas encore rendu"; continue; }
  case "$id" in Cine-B-*) dir="$B"; name="TRED-V2-${id#Cine-B-}" ;; *) dir="$A"; name="TRED-${id#Cine-}" ;; esac
  if "$BIN/ffmpeg" -y -v error -i "$src" -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$dir/$name.mp4"; then
    echo "$id → $dir/$name.mp4 ($(du -h "$dir/$name.mp4" | cut -f1))"
  else
    echo "$id : ÉCHEC de la livraison"
  fi
done
