# Les douze langues de l'interface

## Deux défauts

**L'espagnol faisait planter la page.** `es` figurait dans le type `Locale` et
avait son fichier de traduction — mais il n'avait **aucun chargeur** dans
`LOADERS`. Appeler `LOADERS["es"]()` levait donc une exception pendant le
rendu. Si tu as vu « Etwas ist schiefgelaufen » en choisissant l'espagnol,
c'était ça.

**Huit langues n'avaient aucun fichier.** Le menu proposait douze langues,
`i18n/messages/` en contenait quatre.

## Le principe qui change

Un paquet de langue **n'a plus besoin d'être complet**. Il est fusionné
par-dessus l'allemand au chargement : une clé absente affiche l'allemand, pas
son chemin technique.

Ça change tout pour la suite : ajouter une langue coûte désormais ce que tu
veux y mettre, et ne peut plus casser la compilation. Avant, le type
`Messages` exigeait les 545 clés — tout ou rien.

## Les étapes

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-12-langues.zip" -C .
node patch-langues-ui.mjs
bun run verify
git add -A && git commit -m "douze langues d'interface" && git push
```

Dix fichiers écrits : huit langues, `types.ts`, `index.ts`.

## Ce qui est traduit

Ce qu'un étudiant voit dans ses cinq premières minutes : la **navigation**,
les **mots communs**, la **connexion**, les **réglages**. Environ cent textes
par langue.

Le reste — le chat, les exercices, le tableau de bord — retombe sur
l'allemand. C'est un choix : pour une application de la FH Aachen, l'allemand
est un repli défendable, et le tuteur, lui, répond déjà dans les douze langues.

Compléter une langue plus tard ne demande aucune précaution : tu ajoutes les
clés que tu veux dans le fichier, quand tu veux.

## À vérifier après le déploiement

Passe en 日本語. La barre latérale, les boutons et la page Réglages doivent
changer ; le tableau de bord reste en allemand. Puis pose une question au
tuteur : il doit répondre en japonais.

Et essaie l'espagnol — c'est celui qui plantait.
