# La page Réglages, pour de vrai

## Ce que j'ai trouvé

J'ai cloné ton dépôt GitHub — il est public — et j'ai enfin lu tes **vrais**
fichiers au lieu d'une copie que tu m'avais envoyée il y a des heures. Deux
composants expliquent tout.

### 1. `settings.tsx` était une maquette

Première ligne de ton fichier, écrite noir sur blanc :

```
// Version simplifiée : on utilise useState localement
```

112 lignes. Trois `useState` locaux. Zéro store, zéro appel au serveur, zéro
traduction — tous les textes en dur, en français.

Donc : cliquer « Sombre » ne changeait pas le thème. Rien n'était enregistré.
Et « Code de calcul » ne pouvait pas disparaître, puisque mes correctifs
cherchaient des motifs dans un fichier qui ne les contenait plus.

### 2. Le sélecteur de langue écrivait dans la mauvaise clé

```
language-switcher.tsx  →  localStorage["tred.locale"]
stores/locale.ts       →  localStorage["aerostudy-locale"]
```

Deux clés différentes. **Changer la langue ne touchait jamais l'interface.**
Elle changeait la langue du tuteur — le chat lit bien `tred.locale` — et rien
d'autre. Le menu passait en italien, tous les libellés restaient en français.

Il contournait aussi `setLocale`, c'est-à-dire l'endroit où la langue est
envoyée au serveur. Rien n'était conservé.

**Tout ce qu'il fallait existait déjà** : `useThemeStore`, `useFontSizeStore`,
`useUserStore`, `account.dataExport`, `account.deleteAccount`, un store de
langue soigné qui prévient le serveur. Deux maquettes recouvraient tout ça.

## Les étapes

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-reglages.zip" -C .
node patch-reglages.mjs
bun run verify
git add -A && git commit -m "page reglages reelle" && git push
```

Quatre lignes vertes (une par langue).

## Ce que tu verras

- **Thème** clair / sombre / système — qui fonctionne, et qui persiste
- **Taille du texte** — les trois « A » sont dessinés à leur propre taille
- **Langue de l'interface** — qui change vraiment l'interface, sans recharger
- **Mode allemand technique** — l'interrupteur relié à ton store
- **Abonnement** — ton forfait réel, lien vers la page de tarifs
- **Exporter mes données** — RGPD art. 15 et 20, le JSON se télécharge
- **Supprimer mon compte** — RGPD art. 17, avec saisie de « LÖSCHEN »
- **Plus de « Code de calcul »**

Et douze langues dans le menu : les quatre traduites changent toute
l'application, les huit autres changent le tuteur et sont marquées d'un point.
Pour un étudiant, la langue des réponses compte plus que celle des boutons.

## Vérifié sur ton vrai code

Les deux fichiers compilent contre ton dépôt cloné. Chaque import, chaque
export utilisé a été contrôlé un par un : `Theme`, `FontSize`, `germanMode`,
`Switch`, `Input`, `account.dataExport`, `account.deleteAccount`.
