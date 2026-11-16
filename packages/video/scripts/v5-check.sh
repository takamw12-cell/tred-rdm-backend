#!/usr/bin/env bash
# Planche de contrôle d'une vidéo rendue : une image par seconde, horodatée, + durée, taille et niveau sonore.
FF="/mnt/c/Users/HP/Downloads/ffmpeg-master-latest-win64-gpl-shared/ffmpeg-master-latest-win64-gpl-shared/bin/ffmpeg.exe"
PROBE="${FF%ffmpeg.exe}ffprobe.exe"
src="$1"; name=$(basename "$src" .mp4); out="$(dirname "$src")/$name-planche-de-controle.jpg"
dur=$("$PROBE" -v error -show_entries format=duration -of csv=p=0 "$(wslpath -w "$src")" | tr -d '\r')
rows=$(python3 -c "import math;print(math.ceil(math.ceil($dur)/7))")
"$FF" -hide_banner -loglevel error -y -i "$(wslpath -w "$src")" -vf "fps=1,scale=270:-1,tile=7x${rows}" -frames:v 1 -q:v 4 "$(wslpath -w "$out")" </dev/null 2>/dev/null
info=$("$PROBE" -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name -of csv=p=0 "$(wslpath -w "$src")" | tr -d '\r')
loud=$("$FF" -hide_banner -i "$(wslpath -w "$src")" -af ebur128=peak=true -f null - 2>&1 </dev/null | grep -E "^\s+I:|Peak:" | tail -2 | tr -s ' ' | tr '\n' ' ')
echo "$name : ${dur}s | $info | $(du -h "$src" | cut -f1) | $loud"
