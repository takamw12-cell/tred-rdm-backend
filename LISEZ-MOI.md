# Fond animé

Regarde d'abord l'aperçu que je t'ai envoyé dans la conversation. Si ça te va,
installe. Sinon, dis-moi ce qui cloche avant que ça parte en ligne.

## Les étapes

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-fond.zip" -C .
node patch-fond.mjs
bun run verify
git add -A && git commit -m "fond anime" && git push
```

`patch-fond.mjs` doit afficher **2 lignes vertes**.

## Ce que ça touche

| Fichier | Modification |
|---|---|
| `components/ambient-background.tsx` | Nouveau |
| `pages/login.tsx` | `paper-grid` remplacé par le composant, variante « hero » |
| `components/layout.tsx` | `bg-background` retiré du conteneur, variante « ambient » |

Les deux retraits sont volontaires et nécessaires :

- `paper-grid` dessinait déjà une trame statique. Le composant dessine la même,
  avec les mêmes jetons `--grid-line` et `--grid-step`. En laisser deux
  superposées ferait apparaître des lignes doubles au moindre décalage.
- `bg-background` sur le conteneur posait un aplat opaque **par-dessus** le
  fond. Cette couleur est déjà peinte par `<body>` dans `styles.css` — la
  retirer ne change rien à l'apparence, mais laisse le fond visible.

## Réglages

Deux nombres à changer si l'effet te paraît trop fort ou trop faible, dans
`ambient-background.tsx`, tout en bas :

```ts
"--tred-glow-1": hero ? "... 24% ..." : "... 8% ..."
"--tred-glow-2": hero ? "... 15% ..." : "... 5% ..."
```

Le premier nombre de chaque paire est la page de connexion, le second
l'application. Monte ou descends de deux ou trois points à la fois.

Les vitesses sont dans le bloc CSS : `38s` et `52s` pour la connexion, `76s` et
`104s` pour l'application. Plus le nombre est grand, plus c'est lent.
