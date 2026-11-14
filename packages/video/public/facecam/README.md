# Clips « face caméra » — vidéo 3 (SK-3 · Founder Story)

Dépose ici tes deux clips, avec **exactement ces noms**. Rien d'autre à faire :
au rendu suivant, Remotion les met à leur place.

| Fichier | Où il passe dans la vidéo | La voix dit à ce moment-là | Durée |
|---|---|---|---|
| `intro.mp4` | tout au début, à la place du plan du moteur | « Ich studiere Luft- und Raumfahrttechnik in Deutschland. » | 5 s (2 s au minimum) |
| `outro.mp4` | à la fin, à la place de la carte « Ich baue TRED. » | « Wenn du studierst, probier TRED aus und sag mir, was ich verbessern soll. » | 4 s (2 s au minimum) |

- Un seul des deux suffit : l'autre emplacement garde son plan actuel.
- `.mov` (iPhone) et `.webm` sont acceptés aussi, majuscules comprises (`INTRO.MOV`).
- Un clip plus court que sa place ne fige pas l'image : la scène suivante
  commence plus tôt (début), ou la démonstration dure un peu plus (fin).
  Un clip plus long est coupé à la durée de sa place.
- Un fichier avec un autre nom est ignoré, et le script de rendu le signale.

## Comment filmer

- **À la verticale** (téléphone debout), 1080 × 1920 ou plus, téléphone posé ou tenu stable.
- **Le son de tes clips n'est pas utilisé** : la voix off continue par-dessus.
  Regarde l'objectif, souris, hoche la tête — évite de parler, tes lèvres ne
  suivraient pas la voix. Si tu veux TA voix à la place de la voix off, dis-le :
  c'est un autre réglage (on enregistre ta voix à part).
- **Cadrage** : les yeux vers 40 % de la hauteur. Laisse libre le tiers du bas
  (les sous-titres) et, pour `outro`, le quart du haut (le logo et « Link im
  Profil » y arrivent pendant les deux dernières secondes).
- Lumière de face (une fenêtre devant toi), pas de contre-jour.

## Rendre la vidéo

Depuis `packages/video`, dans WSL :

```bash
TIKTOK_DELIVER="/mnt/c/Users/HP/Downloads/TRED-TikTok-Campaign" \
FFMPEG="/mnt/c/Users/HP/Downloads/ffmpeg-master-latest-win64-gpl-shared/ffmpeg-master-latest-win64-gpl-shared/bin/ffmpeg.exe" \
bash scripts/tiktok-render.sh SK-3-Founder-Story
```

Le script affiche les clips trouvés et leur durée, puis rend la vidéo
(environ 7 minutes). Pour revenir à la version sans clip : retire les fichiers
de ce dossier et relance.

Ces clips ne sont **pas** envoyés sur GitHub (voir `.gitignore` ici) : ils
restent sur ta machine.
