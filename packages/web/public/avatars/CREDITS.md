# Avatars des professeurs

Générés avec Replicate (black-forest-labs/flux-schnell, licence Apache-2.0 :
usage commercial autorisé) par `scripts/generate-avatars.mjs` — les quatre
premiers le 2026-11-05, les cinq suivants le 2026-11-15.

Avatars originaux générés par IA, inspirés par des archétypes pédagogiques
(le stratège, le farceur, l'observateur, la médecin, l'analyste…). Aucune
affiliation avec une œuvre existante : les prompts décrivent un rôle, un âge
et une tenue de tous les jours, et ne nomment aucun studio, artiste ou
personnage. Aucun signe distinctif d'un personnage connu n'a été demandé ;
chaque image a été regardée avant d'être gardée.

| Fichier | Professeur | Servi |
|---|---|---|
| kenta.png / .webp | Prof. Kenta — Das junge Genie | .webp (512 px) |
| haruto.png / .webp | Sensei Haruto — Der geduldige Sensei | .webp (512 px) |
| ren.png / .webp | Prof. Ren — Der Exzentriker | .webp (512 px) |
| aiko.png / .webp | Dr. Aiko — Die Prüferin | .webp (512 px) |
| daichi.png / .webp | Prof. Daichi — Der Stratege | .webp (512 px) |
| kazu.png / .webp | Prof. Kazu — Der Spaßvogel | .webp (512 px) |
| sora.png / .webp | Sensei Sora — Der Beobachter | .webp (512 px) |
| mio.png / .webp | Dr. Mio — Die Ärztin | .webp (512 px) |
| shun.png / .webp | Prof. Shun — Der Analytiker | .webp (512 px) |

Les .png (512 px) sont gardés comme sources ; l'interface sert les .webp.

## Poses pour les vidéos (dossier `video/`)

Fabriquées le 2026-11-23 par `scripts/generate-professor-sprites.mjs` avec Replicate
(black-forest-labs/flux-kontext-pro pour les poses, 851-labs/background-remover pour le détourage).
Images par personnage : `idle`, `talk`, `point`, `point-talk`, et pour `mentor` `hold`, `hold-talk`.
Les objets animés (`public/video-props/` : clé, planche, rocher, appui) viennent de
`scripts/generate-video-props.mjs` (black-forest-labs/flux-schnell, Apache-2.0, puis détourage).

- `kenta-*` : d'après `kenta.png`.
- `mentor-*` et `mentor.png` : personnage dessiné d'après une photo fournie par le fondateur
  (personne réelle : à utiliser seulement avec son accord ; la photo n'est pas dans le dépôt).
