# TRED — Design System

## La direction en une phrase

L'interface se comporte comme un **polycopié annoté** : papier, graphite, trait
de surligneur. Pas comme une application scolaire, pas comme un réseau social
d'étudiants.

Ce choix vient du monde du sujet — le dessin technique, les normes DIN, le
papier millimétré, les annotations en marge. C'est le vocabulaire visuel de
l'ingénieur, et personne d'autre sur ce marché ne l'utilise : Knowunity et
StudySmarter sont sur un violet arrondi avec mascotte.

---

## Couleurs

Quatre rôles, pas une palette de dix.

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `background` | `#f4f5f2` | `#0e1214` | Papier / ardoise |
| `foreground` | `#14181b` | `#e8ebe6` | Graphite (jamais noir pur) |
| `primary` | `#0f4f49` | `#3fbfa8` | **Toutes les actions.** Vert ingénieur |
| `signature` | `#f2b705` | `#ffc93c` | **Le surligneur.** Jamais en couleur de texte |

`signature` est la couleur de marque. Elle ne sert jamais à écrire — uniquement
en aplat sous du texte, en filet de marge, ou en jauge de progression. C'est ce
qui la rend identifiable : on la voit toujours au même endroit, pour la même
raison.

Le mode sombre est **conçu séparément**, pas inversé. Le vert profond ne tient
pas sur l'ardoise, il devient un vert lumineux ; le jaune, lui, traverse les
deux modes sans changer de rôle.

## Typographie

Une seule famille, trois rôles — la cohérence d'une documentation technique.

| Rôle | Police | Usage |
|---|---|---|
| Display | IBM Plex Sans Condensed 600/700 | Titres, wordmark |
| Corps | IBM Plex Sans 400–600 | Tout le texte de lecture |
| Utilitaire | IBM Plex Mono 400–600 | `.label-tech` : numéros d'étape, pages, statuts |

IBM Plex a une origine industrielle et gère très bien les diacritiques
allemandes. La classe `.label-tech` (mono, capitales, interlettrage large)
donne le ton « beauftragung au cartouche de plan ».

## Formes et espacement

`--radius: 0.5rem`. Un dessin technique n'a pas d'angles mous. Les cartes
descendent de `rounded-3xl` à `rounded-lg`, les ombres deviennent presque
invisibles — la hiérarchie passe par le filet et l'espace, pas par la
profondeur.

`.rule-hairline` : filet de 1 px, l'équivalent de la ligne de cote.
`.paper-grid` : trame de papier millimétré. **Uniquement sur de grandes zones
vides** (connexion, états vides). Jamais derrière du texte courant.

## L'élément signature

**La marque de marge.** Dans le chat, chaque réponse porte un filet vertical à
gauche :

- filet **jaune** → le contenu vient du polycopié officiel de l'étudiant ;
- filet **gris** → c'est une explication propre du tuteur.

C'est le seul endroit où le jaune apparaît par défaut, et il encode la seule
chose qui distingue vraiment TRED d'un chat IA généraliste. Tout le reste de
l'interface reste silencieux pour que cette distinction se voie.

## Le logo

Un **T** de deux barres, exact et d'aplomb, traversé d'un trait de surligneur
légèrement incliné. La rigueur de la construction, plus la marque faite à la
main dans le cours.

Fichiers : `packages/web/public/icon.svg` (tuile) et `logo.svg` (détouré). Les
tracés sont dupliqués dans `src/web/components/logo.tsx` pour que la marque
hérite des couleurs du thème — **modifier les deux** en cas de changement, puis
régénérer les PNG.

La version 16 px utilise un trait droit (`favicon-16.png`) : l'inclinaison se
perd de toute façon à cette taille et brouille la lecture.

## Dette assumée

`.brand-gradient` porte encore ce nom alors que ce n'est plus un dégradé mais
un aplat de `primary`. Elle est appelée à une vingtaine d'endroits ; la
renommer n'apportait rien et risquait d'en oublier. À nettoyer un jour.

## À faire ensuite

Les écrans traités : connexion, réponses du chat, marque globale. Restent à
reprendre sur le nouveau système : tableau de bord, exercices, mode examen,
Formelsammlung, Engineering DNA. Ils fonctionnent — ils ont hérité des
nouveaux tokens — mais leur mise en page date encore de l'ancienne direction.
