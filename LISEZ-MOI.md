# Bleu calque — palette + fond animé

Regarde d'abord l'aperçu envoyé dans la conversation, et bascule entre
« Turquoise actuel » et « Bleu calque ». Si le bleu te convient, installe.

## Les étapes

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-bleu.zip" -C .
node patch-bleu.mjs
node patch-fond.mjs
bun run verify
git add -A && git commit -m "palette bleu calque + fond anime" && git push
```

`patch-bleu.mjs` doit annoncer **62 valeurs modifiées**, `patch-fond.mjs`
**2 lignes vertes**.

## Ce qui change

`patch-bleu.mjs` réécrit les jetons de couleur dans `styles.css`, pour les deux
thèmes. Il ne remplace pas du texte au hasard : il repère les blocs `:root` et
`.dark`, puis réécrit la valeur des jetons **par leur nom**. Relancer ne fait
rien de plus.

| | Avant | Après |
|---|---|---|
| Accent, thème clair | `#0f4f49` | `#10427b` |
| Accent, thème sombre | `#3fbfa8` | `#72aaf2` |
| Fond de page, clair | `#f4f5f2` | `#f3f5f7` |
| Fond de page, sombre | `#0e1214` | `#0f1215` |

`patch-fond.mjs` monte le fond animé sur `/login` et derrière l'application.

## Trois décisions

**Le bleu a exactement la clarté du turquoise qu'il remplace.** `#0f4f49` et
`#10427b` ont la même luminosité perçue ; `#3fbfa8` et `#72aaf2` aussi. Les
boutons ne deviennent ni plus lourds ni plus clairs — seule la teinte tourne.
C'est ce qui évite l'impression de thème plaqué par-dessus.

**Trois couleurs ne bougent pas** : l'ambre `--signature`, le vert `--mastered`,
le rouge `--destructive`. Ce sont des couleurs de **sens** — l'état d'un
chapitre, une erreur — pas des couleurs de marque. Les faire suivre l'accent
leur ferait perdre ce qu'elles signalent. L'ambre s'accorde d'ailleurs mieux au
bleu marine qu'au turquoise : ce sont deux teintes opposées.

**Le fond a son propre jeton, `--amb`**, un peu plus soutenu que les boutons
(`#1d4ed8` / `#7aa7ff`). À 8 % d'opacité, un bleu de bouton — sombre et peu
saturé pour rester lisible sous du texte blanc — ne se lirait plus que comme du
gris.

## Contrastes

Quinze paires vérifiées avant de te livrer ceci : texte sur bouton, texte
discret, message d'erreur, accent sur fond sombre, pastille ambre. Toutes
au-dessus de 4,5 pour 1, le seuil de la norme allemande BITV 2.0. La plus
serrée est à 5,4 (le rouge d'erreur sur fond sombre).

## Revenir en arrière

Chaque fichier touché a son `.bak` juste à côté. Et tant que tu n'as pas poussé,
`git checkout -- .` annule tout.
