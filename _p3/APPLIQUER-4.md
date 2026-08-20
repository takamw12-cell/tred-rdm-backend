# TRED — Quotas, plafond de tokens, notifications mobiles

## D'abord : ce que je n'ai pas fait, et pourquoi

Ton message demandait un champ `free_quota_remaining` dans une table
`student_profile`, un champ `subscription_status`, et des modifications dans
`api-index.ts`. **Ni `student_profile` ni `api-index.ts` n'existent dans ton
repo.** Construire dessus aurait produit du code qui ne compile pas.

J'ai donc traduit ton intention vers ton schéma réel. Le résultat fait ce que
tu demandes, avec moins de pièces.

| Ce que tu demandais | Ce que j'ai fait | Pourquoi |
|---|---|---|
| Colonne `free_quota_remaining` remise à 20 le 1er | Rien à ajouter — `usage_counter` compte déjà par mois | La clé `period` vaut `"2026-08"`. Le mois change, le compteur repart de zéro **sans cron**. Une colonne à décrémenter aurait besoin d'une tâche planifiée mensuelle : une pièce de plus, qui casse en silence si elle ne tourne pas |
| Table `student_profile` | `user_plan` + `usage_counter` | Elles existent et portent déjà tout |
| `api-index.ts` | `src/api/index.ts` | C'est le vrai nom |
| Champ `subscription_status` | Colonne `subscription_status` ajoutée à `user_plan` | Celle-là, oui — elle manquait vraiment |

## 1. Nouveaux quotas

```
GRATUIT : 20 chats · 5 exercices · 2 vidéos · 3 formulaires · 10 documents
PREMIUM : 500 chats · 100 exercices · 40 vidéos · 60 formulaires · 200 documents
```

Les 20 chats gratuits sont ton chiffre. Les autres valeurs, je les ai
déduites — tu ne me les avais pas données. Elles tiennent sur une ligne dans
`api/lib/plan.ts`, à ajuster librement.

Tu passes de 90 à 20 chats gratuits. C'est le bon sens du commerce : un
étudiant qui révise sérieusement épuise 20 messages en une soirée. Il se heurte
au mur au moment exact où ton produit lui est le plus utile — c'est là qu'on
paie, pas quand on n'a jamais senti la limite.

## 2. Le plafond de tokens

**100 000 tokens de sortie par utilisateur et par mois**, en plus des compteurs.

Les deux schémas ne protègent pas contre la même chose. Le compteur de messages
limite le NOMBRE d'appels. Le plafond de tokens limite leur TAILLE : une seule
requête qui déclenche huit étapes d'outils avec de longues réponses coûte
plusieurs fois une question courte. C'est ce plafond-là qui borne ta facture
Anthropic en euros.

**Comment c'est mesuré.** Les tokens sont comptés pour de vrai, pas estimés.
La route de chat passe par `createAgentUIStreamResponse`, qui expose un
`onStepEnd` livrant l'`usage` réel de chaque étape. Les routes exercice,
formules et vidéo lisent l'`usage` retourné par `generateText`.

**Où c'est stocké.** Dans `usage_counter`, sous la métrique `tokens_out`. La
colonne `metric` est du texte libre : **aucune migration nécessaire**, et la
remise à zéro mensuelle est celle qui existe déjà.

Quand le plafond est atteint, les routes IA renvoient un 402 avec :

```json
{ "error": "TOKEN_CAP_REACHED", "used": 100420, "cap": 100000 }
```

## 3. Notifications mobiles

Deux fichiers à poser dans ton app Expo :

```
lib/push.ts               autorisation + récupération du token + envoi au serveur
hooks/use-notifications.ts  écouteurs et navigation au tap
```

Branchement, dans ton composant racine :

```tsx
import { useNotifications } from "./hooks/use-notifications";

export default function RootLayout() {
  const { isSignedIn } = useSession();   // adapte à ton hook Better Auth
  useNotifications(isSignedIn);
  // ...
}
```

Trois pièges que le code gère, et qu'on découvre normalement en production.

**L'autorisation ne se demande qu'une fois sur iOS.** Si tu la demandes au tout
premier lancement, avant que l'utilisateur ait vu ce que l'app fait, il refuse —
et tu ne pourras plus jamais lui redemander depuis l'app. Le code ne
redemande que si `canAskAgain` est vrai. **Appelle `useNotifications(true)`
après la connexion**, pas sur l'écran d'accueil.

**Une app lancée depuis une notification (app fermée) ne déclenche pas le
listener** : au moment de l'événement, ton composant n'est pas encore monté.
D'où l'appel séparé à `getLastNotificationResponseAsync`. C'est l'oubli
classique — le tap ouvre l'app sur l'écran d'accueil au lieu de la Klausur.

**Le token appartient à l'appareil, pas au compte.** À la déconnexion, le hook
appelle `unregisterToken`. Sans ça, le prochain utilisateur du même téléphone
recevrait les notifications du précédent.

Dépendances à installer côté mobile :

```
npx expo install expo-notifications expo-device expo-constants
```

Et dans `app.json`, vérifie que `extra.eas.projectId` existe — sans lui,
`getExpoPushTokenAsync` échoue en build de production (pas en développement,
d'où la mauvaise surprise au lancement).

## 4. Migration `subscription_status`

Ton `drizzle-kit` ne fonctionne pas sur cette machine (lien symbolique Bun
cassé). On reprend la méthode qui a marché pour `push_token` :

```
mkdir C:\tmp-migr
cd C:\tmp-migr
npm init -y
npm install @libsql/client
copy C:\dev\tred-rdm\aerostudy-ai\.env .
copy C:\dev\tred-rdm\aerostudy-ai\_patch4\migration\add-subscription-status.mjs .
node --env-file=.env add-subscription-status.mjs
```

Le script vérifie d'abord si la colonne existe, donc tu peux le relancer sans
risque. Supprime `C:\tmp-migr` après — il contient une copie de tes identifiants.

**Ce champ ne décide de rien.** L'accès reste déterminé par `plan` +
`validUntil`. `subscription_status` sert à l'affichage et au support : savoir
qu'un compte est `past_due` explique pourquoi un client râle, sans avoir à
ouvrir Stripe.

## 5. Paiement — vérifié

- `createCheckout` n'accepte que les deux `price_` configurés, et refuse tout
  autre identifiant qu'un client tenterait de glisser
- le webhook écrit `plan`, `validUntil`, `subscriptionId` **et** désormais
  `subscription_status`
- l'essai de 14 jours n'est accordé qu'au premier abonnement

## 6. Variables Railway

Aucune nouvelle variable obligatoire. Récapitulatif complet :

| Variable | Statut |
|---|---|
| `STRIPE_SECRET_KEY` | ✅ en place (`sk_test_` de la sandbox) |
| `STRIPE_WEBHOOK_SECRET` | ✅ en place |
| `STRIPE_PRICE_PRO_MONTHLY` | ✅ en place |
| `STRIPE_PRICE_PRO_SEMESTER` | ✅ en place |
| `STRIPE_TRIAL_DAYS` | optionnel, défaut `14` |
| `WEBSITE_URL` | ✅ déjà là |
| `ANTHROPIC_API_KEY` | ✅ déjà là |

## Fichiers

```
packages/web/src/api/index.ts                  [MODIFIÉ]  plafond + comptage
packages/web/src/api/lib/plan.ts               [MODIFIÉ]  quotas + tokens
packages/web/src/api/lib/billing.ts            [MODIFIÉ]  écrit le statut
packages/web/src/api/database/schema.ts        [MODIFIÉ]  + subscription_status
packages/web/src/api/routes/subscriptions.ts   [MODIFIÉ]  expose la conso tokens
packages/web/src/web/pages/pricing.tsx         [MODIFIÉ]  textes alignés
mobile : lib/push.ts, hooks/use-notifications.ts  [NOUVEAUX]
```

`tsc --noEmit` passe sur tout le backend.

## Installation

```
cd C:\dev\tred-rdm\aerostudy-ai
powershell -Command "Expand-Archive -Path '%USERPROFILE%\Downloads\tred-quotas-v3.zip' -DestinationPath '.\_patch4' -Force"
xcopy /E /Y /I _patch4\api packages\web\src\api
xcopy /E /Y /I _patch4\web packages\web\src\web
railway up
```

Les fichiers mobiles sont dans `_patch4\mobile` — à copier à la main dans ton
projet Expo, dont je ne connais toujours pas l'arborescence.

⚠️ Ton dernier `railway up` a échoué sur `ghcr.io/railwayapp/railpack-builder`,
une panne côté Railway. Vérifie [status.railway.com](https://status.railway.com)
avant de conclure que quelque chose ne va pas dans ce lot.

## Ce qui reste

**Les textes en dur.** Toujours pas passés par `t()`. Dette assumée, dix minutes
de travail quand tu voudras.

**Le tableau de bord ne montre pas le plafond de tokens.** La page tarifs le
reçoit (`sub.tokens.used` / `sub.tokens.cap`) mais ne l'affiche pas encore. À
mon avis c'est bien ainsi : c'est une protection contre les abus, pas un chiffre
à mettre sous les yeux d'un client honnête, qui n'y comprendrait rien.
