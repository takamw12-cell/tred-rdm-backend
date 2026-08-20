# 🚀 AeroStudy AI — Guide de déploiement autonome (sans Runable)

## Ce qui a été modifié dans le code
1. **IA** : le gateway Runable → API Anthropic directe (`packages/web/src/api/agent/gateway.ts`). Il te faut une clé `ANTHROPIC_API_KEY`.
2. **Auth** : plugin Runable supprimé. Email/mot de passe fonctionne tout de suite. Google OAuth est optionnel (bouton masqué tant que `VITE_AUTH_GOOGLE≠true`). Apple retiré (nécessite un compte développeur Apple payant).
3. **Badge « Made with Runable »** et script analytics Runable : supprimés.
4. **Performance** : bundle principal réduit de 2,7 Mo → 1,4 Mo (gzip 763 → 397 Ko) ; Mermaid (~3 Mo) chargé uniquement à la demande.

## Étape 1 — Les comptes gratuits (15 min)
1. **Turso** (base de données) : https://turso.tech → crée une DB → copie `DATABASE_URL` (libsql://...) et génère un `DATABASE_AUTH_TOKEN`.
2. **Anthropic** (IA) : https://console.anthropic.com → API Keys → crée `ANTHROPIC_API_KEY`. Mets ~5–10 € de crédit pour commencer.
3. **Cloudflare R2** (stockage PDF, 10 Go gratuits) : dashboard Cloudflare → R2 → crée un bucket `aerostudy` → crée un API Token (Access Key ID + Secret) → `S3_ENDPOINT` = https://<ACCOUNT_ID>.r2.cloudflarestorage.com

## Étape 2 — Configuration
```bash
cp .env.example .env
# Remplis toutes les valeurs, puis génère le secret d'auth :
openssl rand -base64 32   # → BETTER_AUTH_SECRET
```

## Étape 3 — Test en local
```bash
bun install
cd packages/web && bun run db:push && cd ../..   # crée les tables dans Turso
bun run dev                                       # → http://localhost:4200
```
Crée un compte email/mot de passe, upload un PDF, pose une question au tuteur.

## Étape 4 — Déploiement sur Railway (~5 €/mois)
Le projet contient déjà `railway.json` (commandes de build et de démarrage) et
`.railwayignore`. Aucun compte GitHub n'est nécessaire : on envoie le dossier directement.

1. Crée un compte sur https://railway.com (plan Hobby, ~5 €/mois, carte requise).
2. Ouvre une invite de commandes dans le dossier du projet, puis :
```
bunx @railway/cli login
bunx @railway/cli init
bunx @railway/cli up
```
3. Génère l'adresse publique :
```
bunx @railway/cli domain
```
→ note l'adresse obtenue, du type `https://aerostudy-production.up.railway.app`
4. Sur railway.com → ton service → onglet **Variables** → **Raw Editor** → colle le
   contenu de ton `.env`, avec ces deux différences :
   - `WEBSITE_URL=` l'adresse Railway de l'étape 3
   - **supprime la ligne `PORT`** (Railway fournit le port lui-même)
5. Enregistre : Railway redéploie automatiquement. C'est en ligne 🎉

Les tables existent déjà dans Turso : `db:push` n'est pas à refaire, et tes comptes,
cours et documents sont immédiatement disponibles en ligne.

Pour publier une mise à jour plus tard : `bunx @railway/cli up` depuis le dossier.

## Étape 5 (optionnel) — Bouton « Continuer avec Google »
1. https://console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web).
2. Authorized redirect URI : `https://TON-URL/api/auth/callback/google`
3. Remplis `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, mets `VITE_AUTH_GOOGLE=true`, redéploie.

## Étape 6 (optionnel) — Bouton « Continuer avec Apple »
Nécessite le **Apple Developer Program (99 €/an)** : developer.apple.com → Certificates, Identifiers & Profiles →
1. Crée un **App ID** puis un **Services ID** (ex. `com.aerostudy.web`) avec « Sign in with Apple » activé ; Return URL : `https://TON-URL/api/auth/callback/apple`
2. Crée une **clé** « Sign in with Apple » (fichier .p8) et génère le client secret (JWT signé — je peux te donner un petit script pour ça le moment venu)
3. Remplis `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, mets `VITE_AUTH_APPLE=true`, redéploie.

## ⚠️ Données existantes
La base Turso et le bucket S3 actuels ont été provisionnés par Runable : tes comptes utilisateurs et documents actuels risquent de disparaître avec l'accès Runable. Si tu veux les récupérer, dis-le-moi — on peut faire un export tant que les identifiants de l'ancien `.env` fonctionnent encore.

## Nouvelles fonctionnalités (ajoutées après Runable)
- **Formelsammlung** : nouvelle page (Σ dans le menu) — génère un formulaire de révision compact depuis tes cours, exportable en PDF.
- **Erklärvideo (style Studyflix)** : dans le chat, le bouton « Als Video erklären » génère un mini-cours animé (5–7 scènes, schémas, formule clé) depuis tes documents, narré par la voix de l'appareil. Aucun coût vidéo.
- **Partage de semestre** : bouton « Teilen » sur un semestre → code à 6 caractères ; tes camarades cliquent « Code einlösen » et reçoivent une copie du semestre avec tous les documents.
- **Recherche de vidéos YouTube** : à côté de « Als Video erklären », le bouton « Video dazu finden » cherche des vidéos existantes (Studyflix, simpleclub, chaînes universitaires…) sur le sujet de la réponse. Lecture intégrée via `youtube-nocookie.com`. Nécessite `YOUTUBE_API_KEY` (voir ci-dessous).
- **Nouvelle identité visuelle** : le logo (aile + circuit + étincelle) est intégré partout — favicon, icône d'app, écran de connexion, onboarding, icône d'accueil iOS/Android via `manifest.webmanifest`.

### Activer la recherche de vidéos (5 min)
1. [console.cloud.google.com](https://console.cloud.google.com) → crée un projet.
2. *APIs & Services → Library* → active **YouTube Data API v3**.
3. *Credentials → Create credentials → API key*, puis restreins-la à cette seule API.
4. Sur Railway : *Variables* → `YOUTUBE_API_KEY=...` → redéploie.

Le quota gratuit de Google est de 10 000 unités/jour et une recherche coûte 100 unités, soit **~100 recherches par jour**. Le serveur met les résultats en cache 12 h (même sujet = 0 unité) et s'arrête à 9 000 unités (`YOUTUBE_DAILY_BUDGET`) pour éviter un blocage sec. Sans la clé, le bouton reste visible mais affiche un message clair.

### Remplacer le logo plus tard
Les fichiers de marque sont dans `packages/web/public/` : `icon.png` (tuile carrée, utilisée dans l'interface) et `logo.png` (aile détourée sur fond transparent, écran de connexion). Ce sont des extractions directes du fichier logo original. Pour changer le logo : remplace ces deux fichiers, puis régénère les déclinaisons `icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, `favicon-16/32` et `favicon.ico` à partir de `icon.png`.

## Corrections déjà incluses (jamais déployées chez Runable)
- Schémas : rendu SVG natif (fini le code TikZ brut affiché)
- Génération d'exercices/Klausuren : parsing corrigé (fini « Generierung fehlgeschlagen »)
- Visionneuse PDF + stockage des originaux sur S3
- Menu d'upload 3 options (fichiers / galerie / caméra), zoom texte, mode MATLAB/Python, scratchpad

## 📦 Récupérer tes données Runable (À FAIRE EN PREMIER, avant qu'elles disparaissent)
Sur ton ordinateur (installe Bun si besoin : https://bun.sh) :
```bash
# 1. Dézippe le projet, place l'ANCIEN .env de Runable à la racine, puis :
bun install
bun --env-file=.env scripts/export-runable-data.ts
# → crée ./export-runable/ (tables en JSON + tous tes PDF)
```
Garde ce dossier précieusement (c'est ta sauvegarde complète).

Plus tard, une fois tes nouveaux comptes créés (Turso + R2) et les tables créées (`db:push`) :
```bash
bun --env-file=.env scripts/import-data.ts   # avec le NOUVEAU .env
```
Tes utilisateurs, cours, chats et PDF seront restaurés à l'identique.
