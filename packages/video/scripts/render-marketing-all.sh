#!/usr/bin/env bash
# Rend les 6 vidéos « Pro Marketing » en 1080 × 1920 : out/marketing/<id>.mp4
#   npm run render:marketing-all            (les 6)
#   npm run render:marketing-all en1-panic-hack   (une seule)
# Le projet est assemblé une fois (remotion bundle), puis chaque vidéo est rendue
# depuis ce paquet : sous WSL, c'est ce qui évite les blocages de Chrome.
set -euo pipefail
cd "$(dirname "$0")/.."
ids=(en1-panic-hack en2-3d-arcade en3-personal-professor de1-klausur-rettung de2-technischer-deep-dive de3-lernprofil)
[ $# -gt 0 ] && ids=("$@")
mkdir -p out/marketing
# La musique est synthétisée (libre de droits) : générée si elle manque.
[ -f public/pro/music.wav ] || node scripts/lofi-music.mjs
npx remotion bundle src/index.ts --out-dir=out/.bundle-marketing
for id in "${ids[@]}"; do
  npx remotion render out/.bundle-marketing "Pro-$id" "out/marketing/$id.mp4" --concurrency=2 --codec=h264 --crf=18
done
ls -la out/marketing
