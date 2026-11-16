#!/usr/bin/env bash
# Images → clip pour Remotion : 30 i/s constantes, SANS images B, une image clé par seconde.
# (Avec les réglages par défaut de x264 — images B, groupes de 250 — le moteur de Remotion ne retrouve pas
#  certaines images : « No frame found at position ».) Plage de couleurs ramenée à la plage vidéo.
FF="/mnt/c/Users/HP/Downloads/ffmpeg-master-latest-win64-gpl-shared/ffmpeg-master-latest-win64-gpl-shared/bin/ffmpeg.exe"
DEST=/mnt/c/dev/tred-rdm/aerostudy-ai/packages/video/src/assets/tiktok
take="$1"; out="$2"
"$FF" -hide_banner -loglevel error -y -framerate 30 -i "frames/$take/%04d.jpg" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=pc:out_range=tv,format=yuv420p" -r 30 -fps_mode cfr -c:v libx264 -preset slow -crf 23 -bf 0 -g 30 -keyint_min 30 -sc_threshold 0 -color_range tv -movflags +faststart "$(wslpath -w "$DEST")\\$out.mp4" </dev/null && echo "$take → $out.mp4 : $(ls frames/$take | wc -l) images, $(du -h "$DEST/$out.mp4" | cut -f1)"
