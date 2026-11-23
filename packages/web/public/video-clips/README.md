# Vidéos assemblées à partir de TES clips

Tu génères les clips animés avec une IA vidéo (Luma Dream Machine, Runway…).
TRED les assemble : clips en plein écran, voix ElevenLabs, sous-titres mot par
mot, formules qui s'écrivent par-dessus. Tout se passe sur ta machine ; rien
n'est déployé (les `.mp4` et `.mp3` de ce dossier sont ignorés par git).

## 1. Un dossier par vidéo

    public/video-clips/<nom>/project.json

```json
{
  "title": "Das Hebelprinzip",
  "language": "de",
  "scenes": [
    { "clip": "01.mp4", "voiceover": "Ce que dit la voix.", "formula": "M = F \\cdot l", "formulaPosition": "top-left" }
  ]
}
```

- `clip` : le fichier que tu déposeras dans ce dossier.
- `voiceover` : le texte dit par la voix pendant ce clip. 10 à 14 mots font environ 5 secondes.
- `formula` : une formule KaTeX, ou `""`. Dans un JSON, chaque `\` s'écrit `\\`.
- `formulaPosition` : `top-left`, `top-right`, `bottom-left`, `bottom-right` ou `top-center`.
  Choisis le coin où ton personnage N'EST PAS : le programme ne voit pas le clip.

## 2. La voix d'abord (elle donne la durée de chaque clip)

Depuis WSL, dans `packages/video` :

    npm run clips -- <nom> --voice

Le programme appelle ElevenLabs une fois (payant, au caractère), garde
`voice.mp3` et `voice.json` dans le dossier, et affiche la durée de chaque
scène. Il ne rappelle ElevenLabs que si un texte change.

## 3. Tes clips

Génère un clip par scène, AU MOINS aussi long que la durée affichée, en 16:9
(ou 9:16 avec `--portrait`). Dépose-les dans le dossier sous les noms du
`project.json`.

- Clip plus long que la scène : il est coupé à la fin de la scène.
- Clip plus court : il est ralenti (jusqu'à 2 fois), puis il reprend au début.
- Clip absent : un carton gris « Clip fehlt » le remplace, pour régler le reste en attendant.
- Le son d'un clip est coupé : seule la voix (et la musique) s'entend.

## 4. Le rendu

    npm run clips -- <nom>              # 1920×1080
    npm run clips -- <nom> --portrait   # 1080×1920

La vidéo sort dans `packages/video/out/clips/<nom>.mp4`.
Options : `--no-music` (sans la boucle de fond), `--voice` (la voix seule, sans rendu).
