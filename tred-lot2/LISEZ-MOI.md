# Lot 2 — recherche globale · export PDF · tests

Trois choses, dans cet ordre d'importance.

**1. La recherche.** Ctrl + K (⌘ K sur Mac) ou le bouton « Suche » en haut à
droite. Elle cherche en même temps dans les documents, les conversations et les
exercices enregistrés, et montre l'extrait où le mot apparaît. Les trémas ne
posent plus de problème : `übung`, `Übung` et `Uebung` donnent le même résultat.

**2. L'export PDF d'une conversation.** L'icône imprimante sur une ligne de
résultat. Les formules sortent en vectoriel et restent sélectionnables — ce
n'est pas une capture d'écran.

**3. `bun run verify`.** 40 tests automatiques. Une seule commande te dit si
tu peux pousser.

---

## Les étapes

**Étape 1** — décompresse le zip **à la racine du projet**, là où se trouve le
dossier `packages` (le dossier, avec un `s` ; pas le fichier `package.json`).
Windows te demandera de fusionner les dossiers : dis oui. Aucun de tes fichiers
n'est écrasé, le zip n'apporte que des fichiers nouveaux.

**Étape 2** — ouvre l'invite de commandes et colle ce bloc entier :

```
cd C:\dev\tred-rdm\aerostudy-ai
node patch-lot2.mjs
```

Tu dois voir sept lignes vertes et `0 échec(s)`.

**Étape 3** — vérifie, puis déploie :

```
bun run verify
git add -A
git commit -m "lot 2 : recherche + export PDF + tests"
git push
```

`bun run verify` doit finir par `0 fail`. S'il affiche une erreur, **ne pousse
pas** — envoie-moi le message.

Railway redéploie tout seul après le `git push`. Deux à trois minutes.

---

## Ce que le zip contient

| Fichier | Rôle |
|---|---|
| `packages/web/src/api/lib/search-text.ts` | Comparaison de texte allemand — trémas, casse, extraits |
| `packages/web/src/api/routes/search.ts` | La recherche côté serveur |
| `packages/web/src/web/components/search-dialog.tsx` | La palette Ctrl + K |
| `packages/web/src/web/queries/search.ts` | Le raccord avec TanStack Query |
| `packages/web/tests/*.test.ts` | 40 tests |
| `patch-lot2.mjs` | Branche tout ça dans tes fichiers existants |

Le script modifie sept fichiers à toi : `api/index.ts`, `layout.tsx`,
`chat.tsx`, les trois fichiers de langue, et `package.json`. Chacun est
sauvegardé en `.bak` juste avant. Relancer le script ne fait rien de plus.

---

## Deux décisions que tu dois connaître

**La recherche ne rapatrie jamais un document entier.** SQLite trouve la
position du mot et ne renvoie qu'une fenêtre de 320 caractères autour. Un
polycopié de 400 pages coûte donc la même chose qu'une note de trois lignes.
C'est ce qui permet de chercher à chaque frappe sans faire souffrir Turso.

**Une limite assumée.** Taper `ubung` sans tréma trouve un document *intitulé*
« Übungsblatt », mais pas le mot « Übung » enfoui dans le corps d'un PDF. Lever
cette limite demanderait une colonne supplémentaire en base et une reprise de
tout l'existant. Le jour où un étudiant s'en plaint, on le fera — pas avant.

---

## Ce que les tests couvrent

`bun test` vérifie, entre autres :

- que `Übung`, `übung` et `Uebung` sont bien traités comme le même mot ;
- que le surlignage désigne le bon morceau **même quand le mot contient un
  tréma** (le repliement change la longueur, c'est le piège classique) ;
- que la recherche **ne remonte jamais les documents d'un autre compte** — sur
  une vraie base SQLite, pas sur une imitation ;
- qu'un `%` tapé dans la barre de recherche reste un caractère ordinaire ;
- qu'un prénom contenant du HTML ne se retrouve pas exécuté dans l'e-mail de
  réinitialisation.

Ces tests ont déjà servi : ils ont trouvé un plantage qui serait arrivé en
production dès qu'on cherche un mot d'un seul caractère ou déjà tout en
minuscules — `COALESCE()` à un seul argument, que SQLite refuse. Corrigé.

---

## Si un bloc échoue

Le script te dit lequel et pourquoi. Cela veut dire que le fichier concerné a
changé depuis que je l'ai lu. Envoie-le-moi, je réajuste — les autres blocs sont
déjà appliqués, il n'y a rien à défaire.
