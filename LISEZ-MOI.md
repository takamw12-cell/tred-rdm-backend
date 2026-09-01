# Remplir les mentions légales

Neuf questions dans le terminal. Tu réponds, il écrit. Aucune ligne de
TypeScript à toucher.

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-remplir.zip" -C .
node remplir-legal.mjs
```

Rien n'est écrit avant le récapitulatif et ta confirmation. Une sauvegarde
`legal.ts.bak` est faite juste avant.

## Les questions

| | |
|---|---|
| Prénom et nom | tel qu'il figurerait sur un courrier officiel |
| Rue et numéro | § 5 DDG exige une adresse réelle, pas une boîte postale |
| Code postal, ville | |
| E-mail de contact | |
| **Téléphone** | portable accepté, **obligatoire** |
| Région Railway | railway.app → ton service → Settings |
| Stockage de fichiers | Cloudflare R2, Backblaze B2, AWS S3… |
| Région du stockage | |

Le script refuse un code postal à trois chiffres, une adresse e-mail malformée
ou un numéro trop court. La date du jour est écrite automatiquement dans le
« Stand: ».

## Ensuite

```
bun run legal
```

Doit afficher quatre lignes vertes. Puis :

```
bun run verify
git add -A && git commit -m "mentions legales" && git push
```

## Si tu te trompes

Relance le script : il réécrit par-dessus. Ou restaure :

```
copy /Y packages\web\src\web\data\legal.ts.bak packages\web\src\web\data\legal.ts
```
