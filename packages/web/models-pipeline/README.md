# Fabrication des modèles 3D

Les fichiers d'origine (plusieurs dizaines de Mo) ne sont pas dans le dépôt :
seul le modèle converti l'est, dans `public/models/<filière>/`.

## Le cœur (`public/models/medicine/heart.glb`)

1. Télécharger depuis l'archive officielle BodyParts3D (version 4.0) l'archive
   « part-of » des fichiers OBJ et la table `partof_element_parts.txt`, puis
   les décompresser dans un même dossier.
2. Convertir (depuis `packages/web`) :

       BP3D_DIR=<ce dossier> node models-pipeline/build-heart.mjs

   Le script écrit `models-pipeline/.tmp/heart.raw.glb` et imprime la boîte du
   modèle et la position de chaque repère (à reporter dans
   `src/web/lib/explorer-more.ts` si la source change).
3. Simplifier et compresser, en gardant les pièces séparées et nommées :

       bun ../../node_modules/@gltf-transform/cli/bin/cli.js optimize \
         models-pipeline/.tmp/heart.raw.glb public/models/medicine/heart.glb \
         --compress meshopt --texture-compress false \
         --palette false --join false --flatten false --instance false

   À lancer avec le même programme que celui qui a installé les dépendances
   (sous Windows : `bun.exe`), sinon le module d'images de l'outil ne se charge pas.
   Sans `--join false`, toutes les pièces fusionnent et la surbrillance ne
   fonctionne plus (`tests/explorer-heart-model.test.ts` le signale).
4. `bun test tests/explorer-heart-model.test.ts`

Résultat du 2026-11-15 : 2,76 Mo → 540 Ko, environ 105 000 triangles, 8 pièces.

## Ajouter un modèle

- Vérifier la licence à la source (usage commercial ET modification), l'écrire
  dans `public/models/CREDITS.md`, et renseigner `credit` sur le modèle.
- Pas de compression Draco (décodeur chargé chez un tiers) : meshopt.
- Viser moins de 1 Mo par modèle.
