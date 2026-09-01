# Lot 1 (version complète) + correctif du lot 2

Un seul zip, deux commandes.

Le lot 1 n'avait jamais été appliqué : il n'y a **toujours pas de « mot de passe
oublié »** sur ton application. Un étudiant qui se trompe à l'inscription est
bloqué définitivement, et tu ne peux pas le débloquer non plus.

Cette version fait tout le branchement toute seule. La précédente laissait trois
raccords à faire à la main — ils sont automatisés ici.

---

## Les étapes

**Étape 1** — décompresse, à la racine du projet :

```
cd C:\dev\tred-rdm\aerostudy-ai
tar -xf "%USERPROFILE%\Downloads\tred-lot1-complet.zip" -C .
```

**Étape 2** — lance les deux scripts :

```
node patch-lot1.mjs
node fix-lot2.mjs
```

Le premier doit afficher **9 lignes vertes**, le second entre 1 et 4.

**Étape 3** — vérifie, puis déploie :

```
bun run verify
git add -A
git commit -m "lot 1 : mot de passe oublié, barriere d'erreur, consentement"
git push
```

`bun run verify` doit finir par **`0 fail`**.

---

## Ce que ça branche

| Où | Quoi |
|---|---|
| `api/auth.ts` | Better Auth envoie enfin le lien de réinitialisation |
| `api/lib/mail.ts` | Envoi par Resend, sans aucune dépendance ajoutée |
| `api/index.ts` | `/api/errors` — les erreurs du navigateur arrivent dans les journaux Railway |
| `app.tsx` | La route `/reset-password` **hors** de la zone connectée, et la barrière anti-page-blanche autour de l'application |
| `login.tsx` | Le lien « Passwort vergessen? » et l'envoi |
| `pricing.tsx` | Les deux cases § 356 Abs. 5 BGB, bloquantes avant le paiement |
| les 3 fichiers de langue | Les libellés, **dans les trois** |

Ce dernier point corrigeait un piège de la version précédente : elle n'ajoutait
les libellés qu'à l'allemand. Comme le type `Messages` est déduit de `de.ts`,
`tsc` aurait refusé de compiler et le déploiement aurait échoué.

Le zip apporte aussi la version corrigée de `search-sql.test.ts` (le lot 2) :
elle s'ignore proprement quand `@libsql/client` n'est pas installé sur ta
machine, au lieu de faire échouer toute la vérification.

---

## Après le déploiement — la seule chose que je ne peux pas faire

Sur Railway, deux variables d'environnement :

```
RESEND_API_KEY   ta clé sur resend.com — gratuit jusqu'à 3 000 e-mails/mois
MAIL_FROM        TRED <noreply@ton-domaine.de>
```

Le domaine doit être vérifié chez Resend, sinon l'envoi est refusé. Pour
essayer tout de suite sans domaine, `MAIL_FROM` peut valoir
`TRED <onboarding@resend.dev>` — c'est d'ailleurs la valeur par défaut.

Sans ces variables le serveur démarre quand même, mais aucun e-mail ne part et
tu liras `[mail] RESEND_API_KEY absente` dans les journaux Railway.

**Teste-le avant de le proposer à quelqu'un** : déconnecte-toi, clique
« Passwort vergessen? », et regarde si l'e-mail arrive.

---

## Deux détails de conception

**Le message est le même que le compte existe ou non.** Répondre « ce compte
n'existe pas » permettrait à n'importe qui de savoir qui est inscrit chez toi,
une adresse à la fois.

**Le bouton de paiement reste cliquable sans les cases cochées.** Il affiche un
message rouge sous les cases au lieu d'être grisé : un bouton mort n'explique
rien à celui qui le regarde.

---

## Si un bloc échoue

Le script te dit lequel et pourquoi, et applique quand même les autres. Envoie-
moi le fichier concerné, je réajuste. Chaque fichier modifié est sauvegardé en
`.bak` juste à côté.
