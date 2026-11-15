# Modèles 3D de l'Explorateur

Dépose ici un fichier `.glb` (glTF binaire), par exemple `herz-anatomie.glb`.
Il s'ouvre alors à l'adresse `/explorer?glb=herz-anatomie`.

- **Nom du fichier** : minuscules, chiffres et tirets seulement.
- **Sans compression Draco** : son décodeur serait téléchargé chez un tiers.
- **Licence** : n'y dépose que des modèles dont la licence permet la diffusion
  (CC0, ou CC BY avec la mention de l'auteur sur la page). Tout ce dossier est
  servi publiquement.
- **Poids** : vise moins de 5 Mo, le fichier est téléchargé sur téléphone.

Les modèles livrés avec TRED (turboréacteur, engrenage, cellule, cœur, surface,
atome, pyramide des normes) ne sont pas des fichiers : ils sont construits dans
le navigateur (`src/web/components/Explorer3D.tsx`, `explorer-scenes.tsx`).
