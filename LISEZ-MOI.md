# La boucle de diagnostic

Le tuteur repère une lacune, la retient, et y revient tout seul la fois
suivante. C'est le chantier dont on parlait — *l'intellect, la sagesse*.

## Les étapes

**Étape 1** — décompresse à la racine du projet :

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-memoire.zip" -C .
```

**Étape 2** — crée la table dans Turso :

```
bun --env-file=.env migration-memoire.mjs
```

Deux lignes vertes attendues. Le script écrit une ligne d'essai, la relit,
vérifie les valeurs par défaut, puis l'efface — créer une table ne prouve pas
qu'on peut s'en servir.

**Étape 3** — branche le code :

```
node patch-memoire.mjs
bun run verify
git add -A && git commit -m "boucle de diagnostic" && git push
```

Sept lignes vertes, puis 56 tests.

---

## Ce que ça fait

**Le tuteur a deux nouveaux outils.** `merke_luecke` quand il identifie une
*fausse idée* — confondre Spannung et Dehnung, appliquer une formule hors de
son domaine — et `luecke_geschlossen` quand l'étudiant réexplique le lien
correctement, tout seul.

**Ce qu'il sait arrive en tête du prompt.** Avant l'identité, avant les
documents :

```
NIVEAU 2b — WAS DU ÜBER DIESE PERSON WEISST
Offene Denklücken aus früheren Gesprächen:

  - Verwechselt Spannung und Dehnung (TM 2, 3×, zuletzt vor 4 Tagen)
```

Avec la consigne d'en parler activement quand la question la touche — et de ne
**jamais** mentionner la liste elle-même. Il se souvient ; il ne lit pas un
dossier à voix haute.

**L'étudiant voit tout.** Une carte sur le tableau de bord : ce que TRED croit
savoir de lui, avec le compteur de répétitions. Deux boutons : « Verstanden »
et « Stimmt nicht ». Il a le dernier mot.

---

## Quatre décisions

**Le compteur est le cœur du dispositif.** Une fois, c'est de l'inattention.
Trois fois, c'est un motif. Sans compteur, on ne saurait pas distinguer les
deux — et c'est cette distinction qui fait la différence entre un tuteur et un
carnet de notes.

**Le regroupement est testé à part.** Le modèle n'écrira jamais deux fois la
même phrase. « Verwechselt Spannung und Dehnung » et « verwechselt Spannung mit
Dehnung » doivent compter pour une seule lacune, sinon le compteur ne monte
jamais. Seize tests couvrent ce qui doit fusionner et ce qui doit rester
distinct — dont le cas piège d'un mot unique en commun.

**La consigne de l'outil est stricte.** Pas les erreurs de calcul, pas les
fautes de frappe, pas les étourderies. En cas de doute : ne pas enregistrer. Un
profil rempli de bruit est pire que pas de profil.

**Rien n'est supprimé quand c'est résolu.** Le statut passe à `resolved`. Le
verrou de suppression reste à l'étudiant seul.

---

## Comment vérifier après déploiement

Ouvre le chat et fais exprès une confusion conceptuelle nette :

> « Die Spannung ist doch die Verformung geteilt durch die Länge, oder? »

Le tuteur corrige. Recharge le tableau de bord : la carte apparaît. Repose une
question sur le même sujet dans une **nouvelle** conversation — il doit y
revenir de lui-même.

Si rien n'apparaît, c'est que le modèle a jugé que ce n'était pas une lacune
conceptuelle. C'est le comportement voulu ; insiste avec une confusion plus
franche.
