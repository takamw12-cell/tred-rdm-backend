# TRED — `rdm-solver.ts` : le solveur qui arbitre toutes les valeurs

## D'abord, ce que tu as déjà

Avant d'écrire, j'ai lu ton repo. Le principe que tu défends — *le LLM ne
calcule jamais* — **est déjà appliqué chez toi** :

| Ce qui existe | Où | Ce que ça fait |
|---|---|---|
| Solveur déterministe | `lib/beam.ts` (289 lignes) | réactions, Q(x), M(x), 200 points, erreurs typées |
| Outil exposé au LLM | `agent/index.ts:581` `balkenstatik` | le modèle appelle le solveur, il ne calcule pas |
| Générateur SVG natif | `lib/diagrams.ts` `renderDiagram` | Festlager hachuré, Loslager, marqueurs `<marker>`, `viewBox` |
| Outil de dessin | `agent/index.ts:647` `skizze` | le modèle commande le dessin |
| Règles SVG du prompt | `agent/index.ts:389-435` | `viewBox` obligatoire, largeur fixe interdite, TikZ et Mermaid proscrits, couleurs `#2563EB` / `#EF4444` / `#10B981` / `#64748B` |

L'en-tête de `beam.ts` dit d'ailleurs mot pour mot ce que tu m'écris : *« Ein
Sprachmodell schreibt Zahlen, es rechnet sie nicht. »*

Réécrire tout ça aurait détruit du code qui marche. J'ai donc écrit la **version
supérieure**, qui fait ce que `beam.ts` ne sait pas faire.

## Ce que `rdm-solver.ts` ajoute

**Les systèmes hyperstatiques.** `beam.ts` traite l'isostatique par formules
fermées : deux appuis, ou un encastrement. Le nouveau solveur accepte un nombre
quelconque d'appuis — poutre continue à trois appuis, encastrée-appuyée,
bi-encastrée. C'est ce que tu demandais, et ça ne se fait pas sans passer par la
déformation.

**Les unités.** `1500 mm`, `1,2 kN`, `6 kN/m` sont acceptés et convertis en SI
avant tout calcul. Le virgule décimale allemande est gérée. Une unité inconnue
est **refusée**, jamais devinée : une unité supposée en silence est plus
dangereuse qu'un message d'erreur.

**L'auto-vérification.** Après le calcul, le solveur recontrôle ΣV = 0 et
ΣM = 0 sur son propre résultat. Si le résidu dépasse la tolérance, il refuse de
répondre avec le code `NOT_IN_EQUILIBRIUM` et le message *« il manque une force
ou un appui dans l'énoncé »*.

## La méthode, et pourquoi elle est hybride

Deux étapes, chacune avec l'outil qui convient.

**1. Les réactions par éléments finis.** Poutre d'Euler-Bernoulli, 2 nœuds,
2 degrés de liberté par nœud (flèche *w*, rotation *φ*). Matrice de rigidité
classique, charges réparties converties en charges nodales équivalentes,
résolution par élimination de Gauss avec pivot partiel. C'est le seul moyen pour
l'hyperstatique : les équations d'équilibre ne suffisent pas, il faut la
déformation.

**2. Q(x) et M(x) en forme fermée**, une fois les réactions connues. Pas par
interpolation des éléments finis. Résultat : **zéro erreur de discrétisation**,
des sauts nets aux points d'application, et exactement la même convention de
signes que `beam.ts`.

Un nœud est placé à chaque discontinuité — appui, force ponctuelle, moment,
début et fin de charge répartie — sinon une force ponctuelle tombe entre deux
nœuds et se retrouve étalée au lieu d'être appliquée.

## La vérification, chiffres à l'appui

J'ai testé contre les formules des formulaires. Le fichier de test est livré,
tu peux le relancer.

```
OK  Einfeldträger F mittig: A = F/2                500,000
OK  Einfeldträger F mittig: Mmax = FL/4          1000,000
OK  Gleichlast: A = qL/2                         6000,000
OK  Gleichlast: Mmax = qL²/8                     9000,000
OK  Kragarm: Einspannmoment = −FL               −1500,000
OK  bds. eingespannt: M_Rand = −FL/8             −500,000   ← hyperstatique
OK  bds. eingespannt: M_Feld = +FL/8              500,000   ← hyperstatique
OK  Stützträger: R_B = 3qL/8                     1500,000   ← hyperstatique
OK  Stützträger: M_A = −qL²/8                   −2000,000   ← hyperstatique
OK  Zweifeldträger: R_Mitte = 1,25 qL            6250,000   ← hyperstatique
OK  Einheiten 1500 mm / 1,2 kN ≡ 1,5 m / 1200 N   600,000
OK  einzelnes Loslager → UNSTABLE
OK  unbekannte Einheit → INVALID_UNIT
OK  Residuum ΣV, ΣM = 0

✅ 24/24
```

**Deux de ces tests ont échoué au premier passage** — erreur de signe sur les
couples dans le contrôle d'équilibre : un porte-à-faux parfaitement calculé
était déclaré hors équilibre. C'est corrigé, et c'est exactement pourquoi je
te livre les tests plutôt qu'une affirmation.

## Pour lancer les tests toi-même

```
cd C:\dev\tred-rdm\aerostudy-ai\packages\web
npx tsx ..\..\_patch5\tests\rdm-solver.test.ts
```

Ajoute un cas dès que tu doutes d'un résultat. C'est le filet qui empêche une
régression silencieuse dans six mois.

## Les erreurs, et ce qu'elles disent

| Code | Quand | Message à l'étudiant |
|---|---|---|
| `INVALID_UNIT` | unité inconnue | « Unité inconnue "furlong" pour length » |
| `INVALID_GEOMETRY` | charge hors poutre, appuis confondus | « La charge en x = 7 m est hors de la poutre (0 … 4 m) » |
| `UNSTABLE` | système hypostatique | « Un seul appui simple ne tient pas la poutre : elle peut tourner librement » |
| `NOT_IN_EQUILIBRIUM` | résidu trop grand | « Il manque une force ou un appui dans l'énoncé » |
| `NUMERICAL` | tout le reste | « Les données ne suffisent pas ou se contredisent » |

`solveRdmSafe()` enveloppe le tout dans un `try/catch`. Aucun chemin ne permet
au modèle d'inventer une valeur : soit il reçoit des nombres exacts, soit il
reçoit un refus explicite.

## Fichiers

```
packages/web/src/api/lib/rdm-solver.ts   [NOUVEAU]  ~520 lignes
packages/web/src/api/lib/units.ts        [NOUVEAU]  conversion SI
tests/rdm-solver.test.ts                 [NOUVEAU]  24 assertions
```

`tsc --noEmit` passe. Aucune dépendance ajoutée : tout est du TypeScript pur.

## Installation

```
cd C:\dev\tred-rdm\aerostudy-ai
powershell -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\tred-rdm-solver.zip' -DestinationPath '.\_patch5' -Force"
xcopy /E /Y /I _patch5\api packages\web\src\api
railway up
```

Déployable seul, comme tu l'as demandé : ce lot n'ajoute aucun appel, il ne fait
qu'apporter deux fichiers. Rien ne change tant qu'on ne le branche pas.

## L'étape suivante, et une question de conception

Le solveur est écrit mais **le LLM ne l'utilise pas encore** : l'outil
`balkenstatik` de `agent/index.ts` appelle toujours `beam.ts`. C'est volontaire —
je ne voulais pas modifier un outil en production dans le même lot que le code
neuf.

Pour le brancher, deux options :

**Remplacer** `beam.ts` par `rdm-solver.ts` dans l'outil. Une seule source de
vérité, mais toute question de statique passe par les éléments finis, y compris
« poutre sur deux appuis avec une force » où une formule fermée suffisait.

**Router** : `beam.ts` pour l'isostatique, `rdm-solver.ts` dès qu'il y a plus de
deux liaisons. Plus rapide sur le cas courant, mais deux chemins à maintenir.

Je recommande le **remplacement**. Deux solveurs qui doivent rester d'accord
entre eux, c'est précisément le genre de dette qui produit deux réponses
différentes à la même question — et sur une app d'ingénierie, c'est pire que
lent. Le coût en calcul est négligeable : quelques dizaines de nœuds, une
élimination de Gauss, moins d'une milliseconde.

Dis-moi ce que tu choisis et je fais la bascule, avec l'élargissement du schéma
Zod de l'outil pour accepter les appuis multiples.
