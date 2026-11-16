#!/usr/bin/env bash
# Planche de contrôle d'une prise : une image par seconde (ou tous les $2 s), en mosaïque.
FF="/mnt/c/Users/HP/Downloads/ffmpeg-master-latest-win64-gpl-shared/ffmpeg-master-latest-win64-gpl-shared/bin/ffmpeg.exe"
name="$1"; every="${2:-1}"; cols="${3:-7}"
n=$(ls "frames/$name" | wc -l)
rows=$(( (n / 30 / every + cols) / cols ))
"$FF" -hide_banner -loglevel error -y -framerate 30 -i "frames/$name/%04d.jpg" -vf "fps=1/$every,scale=300:-1,tile=${cols}x${rows}" -frames:v 1 -q:v 4 "frames/$name-planche.jpg" </dev/null && echo "$name : $n images, planche ${cols}x${rows}"
