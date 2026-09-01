# Les trois correctifs restants, en un seul zip

Un seul téléchargement, une seule commande. Les scripts sont exactement ceux
des trois zips précédents ; ils sont enchaînés pour que l'ordre ne puisse pas
être inversé.

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-tout.zip" -C .
node tout.mjs
```

Quatre étapes, quatre lignes vertes au bilan.

Puis :

```
bun --env-file=.env migration-memoire.mjs
bun run verify
git add -A && git commit -m "correctifs" && git push
```

## Ce que contient chaque étape

**1. La mémoire ne peut plus casser le chat.** Tu as déployé le code de la
mémoire ; s'il tourne sans la table `misconception`, chaque message lève une
exception et `/api/agent/messages` tombe. Désormais la mémoire se désactive
toute seule, écrit une ligne dans les journaux Railway, et le tuteur repart
comme avant. Une fonction de confort ne doit jamais emporter la fonction
principale.

**2. Dix langues côté serveur.** Il y avait deux tables couvrant `de`, `fr`,
`en`, alors que ton interface propose dix langues. Le code retombait
explicitement en allemand pour les sept autres — sans message, sans trace.
Une seule table désormais, quinze langues, chacune avec sa consigne rédigée
dans la langue.

**3 et 4. La palette bleu calque et le fond animé.** Dans cet ordre : la
palette pose le jeton `--amb` que le fond utilise. Inversés, le fond
retomberait sur la couleur des boutons.

## Ce que ça touche

| Fichier | Étape |
|---|---|
| `api/lib/memory.ts` | remplacé (1) |
| `api/lib/languages.ts` | nouveau (2) |
| `api/agent/index.ts` | table unique (2) |
| `api/index.ts` | table unique (2) |
| `web/styles.css` | 62 jetons de couleur (3) |
| `web/components/ambient-background.tsx` | nouveau (4) |
| `web/pages/login.tsx`, `components/layout.tsx` | fond monté (4) |
| `.gitignore` | les `*.bak` sortent du dépôt (1) |

Chaque fichier modifié garde son `.bak` à côté. Relancer `tout.mjs` ne fait
rien de plus.

## Et si rien ne change encore une fois

Alors le problème n'est pas dans le code. Va sur **railway.app → ton projet →
Deployments** : un déploiement doit apparaître dans la minute qui suit ton
`git push`, et finir en vert. S'il n'apparaît pas, Railway n'écoute pas ce
dépôt — et c'est la seule chose qui compte à ce moment-là.
