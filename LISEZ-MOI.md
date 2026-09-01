# Trois corrections

1. le pied de page légal qui avait échoué dans `layout.tsx` ;
2. le réglage « Code de calcul » (MATLAB / Python) supprimé ;
3. **la langue enfin respectée par le chat.**

## Les étapes

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-fix.zip" -C .
node patch-fix.mjs
bun run verify
```

Trois lignes vertes attendues.

---

## 1. Le pied de page

Le motif cherchait la balise `<main>` avec ses classes exactes, et tes classes
avaient changé. Elle est maintenant repérée par sa **forme**
(`<main …>{children}</main>`), quelles que soient les classes.

## 2. « Code de calcul »

L'encart disparaît de la page Réglages.

Je retire l'encart, pas la plomberie : `codeLang` reste dans le store avec sa
valeur par défaut « python », et le serveur continue de l'accepter. Arracher la
chaîne entière toucherait cinq fichiers pour supprimer un encadré — le rapport
bénéfice/risque n'y est pas. Plus rien ne s'affiche, plus rien ne se règle : le
résultat visible est identique. Dis-moi si tu veux quand même le nettoyage
complet.

## 3. La langue — pourquoi ça ne marchait pas

J'ai retracé le chemin en entier. **La langue partait bien** du navigateur, et
le serveur la recevait bien. Le problème était ailleurs, et il est banal :

Une seule ligne demandait la langue — `Antworte in dieser Sprache: **Français**`
— au milieu de **cinq cents lignes d'instructions rédigées en allemand**,
suivies de tes documents de cours, eux aussi en allemand.

Un modèle de langue suit la langue dominante de ce qu'il lit. Une ligne contre
un mur d'allemand ne pèse rien.

Trois changements, tous fondés sur la même idée :

**La consigne est écrite dans la langue demandée.** « Tu réponds en FRANÇAIS »
en français bascule le modèle dès la lecture. La même phrase en allemand ne le
fait pas.

**Elle est placée en premier**, avant l'identité, avant tout le reste.

**Elle est répétée en dernier.** La fin d'un prompt est ce qu'un modèle suit le
mieux — mieux encore que le début.

### Un quatrième défaut trouvé au passage

Le mode Examen contenait `Antworte NUR auf Deutsch` : quelle que soit la langue
choisie, il imposait l'allemand. Corrigé — il suit maintenant ton choix.

### Ce que ça ne change pas

Les termes techniques allemands restent en allemand, avec leur traduction entre
parenthèses à la première mention. C'était voulu et ça le reste : un étudiant de
la FH Aachen passe sa Klausur en allemand.

---

## Comment vérifier

Après le déploiement : passe l'interface en français, ouvre une **nouvelle**
conversation (une conversation restaurée garde la langue dans laquelle elle a
été écrite) et pose une question. La réponse doit être en français, avec les
**Fachbegriffe** en allemand.
