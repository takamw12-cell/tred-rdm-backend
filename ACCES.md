# TRED — Verrouillage de l'accès

## Ce que ça fait

L'application est **fermée par défaut**. Personne ne peut créer de compte sans
un code d'invitation que tu génères toi-même. Tu peux couper l'accès d'un
compte existant en un clic, et la coupure est **immédiate** — toutes ses
sessions sont détruites, son navigateur ouvert ne peut plus rien appeler.

## Mise en service (5 min)

### 1. Variables sur Railway

```
ALLOW_PUBLIC_SIGNUP=false
ADMIN_EMAILS=ton.email@exemple.de
```

`ADMIN_EMAILS` accepte plusieurs adresses séparées par des virgules. Le compte
correspondant devient administrateur à sa prochaine connexion — il n'y a pas de
mot de passe admin séparé.

⚠️ Mets bien **l'email du compte avec lequel tu es déjà inscrit**, sinon tu
n'auras pas accès au panneau.

### 2. Créer les tables

```
bun run db:push
```

À lancer une fois, en local, avec le `.env` de production. Ça ajoute
`user_access` et `invite_code` sans toucher aux données existantes.

### 3. Déployer

```
railway up
```

### 4. Couper l'accès aux testeurs

Va sur `/admin`. Tu vois tous les comptes, le tien marqué « Betreiber ».
Clique **Sperren** sur chacun de tes amis. Ils sont éjectés dans la seconde.

## Comment ça marche

**Inscription** — Un middleware intercepte `POST /api/auth/sign-up/*` avant
better-auth. Sans code valide : `403 INVITE_REQUIRED`. Le code n'est consommé
qu'**après** une inscription réussie, donc une tentative ratée ne le gaspille
pas. Le compteur s'incrémente en condition SQL : deux inscriptions simultanées
ne peuvent pas épuiser deux fois un code à usage unique.

**Bannissement** — Un middleware sur `/api/*` vérifie le compte à chaque
requête. Il est posé au niveau de l'application, pas route par route : une
route ajoutée demain est protégée automatiquement. `/api/auth/*` reste
accessible pour que la déconnexion fonctionne, `/api/health` pour Railway.

**Effet immédiat** — `setActive(false)` supprime les lignes de la table
`session`. Le cookie du navigateur devient inutile sur-le-champ. Côté client,
le client API intercepte le `403 ACCOUNT_DISABLED` et recharge vers l'écran de
connexion.

## Codes d'invitation

Depuis `/admin` : bezeichnung libre (« FH Aachen TM2 WS26 »), nombre
d'utilisations, et le code est copiable d'un clic.

Alphabet sans `0 O 1 I` — les codes sont recopiés à la main depuis une
diapositive ou un papier.

Un code multi-usages sert un groupe entier : tu donnes un code à 40
utilisations à un chargé de TD, il le projette, ses 40 étudiants s'inscrivent.
Tu peux le désactiver ensuite sans toucher aux comptes déjà créés.

## Rouvrir au public plus tard

Passe `ALLOW_PUBLIC_SIGNUP=true` et redéploie. Le champ code disparaît du
formulaire, les codes existants continuent de fonctionner.

**Ne fais pas ça avant que la facturation existe.** Chaque utilisateur gratuit
consomme ton budget API.

## Choix techniques assumés

`user_access` est une table séparée plutôt que des colonnes ajoutées à `user` :
la table `user` appartient à better-auth et son générateur de schéma
l'écraserait. Un compte sans ligne dans `user_access` est considéré actif —
ainsi tes comptes existants continuent de fonctionner sans migration de
données.

Un administrateur ne peut pas se bannir lui-même (contrôle serveur, pas
seulement bouton grisé).

## Ce qui n'est PAS fait

- Envoi automatique des codes par email — tu les transmets à la main
- Expiration automatique des codes (le champ existe, l'interface ne l'expose pas)
- Journal des actions admin
