# GUIDE FOUNDER — TRED / AeroStudy AI, de A à Z

> Mis à jour le 5 novembre 2026. Les prix viennent des pages tarifs et de comparatifs récents. **Vérifie toujours la page officielle avant de payer**, ils changent souvent.
>
> **Règle d'or des clés :** tu ne m'envoies **jamais** une clé dans le chat. Tu la colles dans `.env` (ignoré par git) et dans les variables Railway. Tu me dis juste « c'est fait ».

---

## 1. Ce qui est déjà en place (aucune action de ta part)

| Brique | Paquet / fichier | État |
|---|---|---|
| Animation | `framer-motion` 12, `lottie-react` 3.1.2 | installé |
| Effet « main qui dessine » | `roughjs` 4.6.6 | installé (remplace `react-rough`, abandonné depuis 2022 et limité à React 16) |
| Maths | `katex` | déjà là |
| Tableau blanc libre | `tldraw` 5.5.2 → `components/tafel-whiteboard.tsx` | squelette, non affiché |
| Avatar temps réel | `@heygen/liveavatar-web-sdk` 0.0.19 → `api/avatar/heygen.ts` | squelette (remplace `@heygen/streaming-avatar`, **déprécié** par HeyGen) |
| Voix premium | `@elevenlabs/elevenlabs-js` 2.73.0 → `api/avatar/elevenlabs.ts` | squelette prêt (SDK officiel ; `elevenlabs-js` sans scope n'est pas officiel) |
| Transport temps réel | `livekit-server-sdk`, `livekit-client`, `@livekit/components-react` → route `POST /api/livekit/token` | branché, répond 503 sans clés |
| Orchestration | `api/avatar/pipeline.ts` (LLM → TTS → Avatar → LiveKit) | squelette TypeScript (Pipecat n'existe qu'en Python, voir §5) |
| Stockage objet | `@aws-sdk/client-s3` (déjà là) → `lib/media-storage.ts` + route `POST /api/storage/upload` (admin) | branché, réutilise le bucket S3/R2 existant |
| Coûts avatar | `lib/avatar-cost.ts` + table `avatar_usage` | prêt, table à créer (§4) |
| OCR formules | `lib/mathpix.ts` | squelette |
| Erreurs / analytics | `@sentry/react` 11.8.0, `posthog-js` → `web/lib/observability.ts` | branché, ne fait rien sans clé |
| Figma | `.mcp.json` → serveur `figma-developer-mcp` 0.13.2 | prêt, attend ton token |
| Composants accessibles | Radix (14 paquets), `class-variance-authority`, `clsx`, `tailwind-merge` | déjà là |
| Backend | `hono`, `@orpc/*`, `drizzle-orm`, `@libsql/client`, `stripe`, `@ai-sdk/anthropic` | déjà là |
| UI Hörsaal | `virtual-classroom.tsx` : placeholders gris + slots `sidebar` / `board` / `avatar` + `data-slot` = noms des calques Figma | prêt |

Toutes les versions sont **exactes** (pas de `^`) et publiées depuis au moins 2 semaines, par prudence face aux paquets compromis.

---

## 2. Checklist des comptes à créer (dans cet ordre)

Coche au fur et à mesure. **Indispensable** = nécessaire pour le Hörsaal avec avatar. **Optionnel** = utile mais l'app vit sans.

| # | Service | Lien | Prix pour démarrer | Clés à récupérer → variable `.env` | Priorité |
|---|---|---|---|---|---|
| 1 | **Figma** | figma.com/pricing | Plan **Professional** avec un siège Dev ou Full (~15–25 $/mois) | Personal Access Token → `FIGMA_PERSONAL_ACCESS_TOKEN` | Indispensable |
| 2 | **HeyGen LiveAvatar** | liveavatar.com | Starter **19 $/mois** (200 crédits ≈ 200 min en mode Lite) | API key → `HEYGEN_API_KEY` · Avatar ID → `HEYGEN_AVATAR_ID` · Voice ID → `HEYGEN_VOICE_ID` | Indispensable |
| 3 | **LiveKit Cloud** | cloud.livekit.io | **Gratuit** (Build) : 100 connexions simultanées, 5 000 min WebRTC, 1 000 min d'agent/mois | `LIVEKIT_URL` · `LIVEKIT_API_KEY` · `LIVEKIT_API_SECRET` | Indispensable |
| 4 | **Cloudflare R2** | dash.cloudflare.com → R2 | **Gratuit** jusqu'à 10 Go, sans frais de sortie | `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET_NAME` | Optionnel (le bucket S3 actuel suffit) |
| 5 | **ElevenLabs** | elevenlabs.io/pricing | Creator **22 $/mois** (~100–200 k caractères) | API key → `ELEVENLABS_API_KEY` · Voice ID → `ELEVENLABS_VOICE_ID` | Optionnel (LiveAvatar a sa voix) |
| 6 | **Mathpix** | console.mathpix.com | **19,99 $** d'activation (une fois), puis ~0,002 $/image | `MATHPIX_APP_ID` · `MATHPIX_APP_KEY` | Optionnel (OCR de photos d'exercices) |
| 7 | **Sentry** | sentry.io/pricing | **Gratuit** (Developer) : 1 utilisateur, 5 000 erreurs/mois | DSN → `VITE_SENTRY_DSN` | Recommandé |
| 8 | **PostHog** | eu.posthog.com | **Gratuit** : 1 M d'événements/mois. Choisis la région **EU** | Project API key → `VITE_POSTHOG_KEY` | Recommandé |
| 10 | **Replicate** (images + vidéos IA) | replicate.com | **À l'usage** : ~0,003 $/image (Flux Schnell), ~0,05–0,25 $/s de vidéo selon le modèle. Pas d'abonnement | API token → `REPLICATE_API_TOKEN` | Recommandé (images/vidéos dans le tuteur) |
| 9 | **tldraw** | tldraw.dev/pricing | Essai 100 jours, puis licence commerciale **sur devis** | License key → `VITE_TLDRAW_LICENSE_KEY` | Plus tard (seulement si l'étudiant dessine) |

Comptes **déjà actifs** (rien à faire) : Anthropic, Turso, Railway, Stripe, Google (YouTube), S3/R2 pour les PDF.

### Pas à pas par compte

**1 — Figma (token)**
1. Figma → avatar en haut à gauche → **Settings** → **Security** → **Personal access tokens** → **Generate new token**.
2. Nom `aerostudy-claude`, expiration 90 jours, scopes **File content: Read-only** et **Dev resources: Read-only**.
3. Copie le token (affiché une seule fois) dans `.env` → `FIGMA_PERSONAL_ACCESS_TOKEN=figd_...`

**2 — HeyGen LiveAvatar**
1. Crée un compte sur **liveavatar.com**. C'est une console **séparée** de heygen.com, et les avatars HeyGen classiques n'y sont pas compatibles.
2. Choisis un avatar public ou crée ton professeur. Prends une **voix allemande**.
3. Note l'**Avatar ID** et le **Voice ID**, puis va dans **API Keys** → **Create**.
4. Valide la démo gratuite avant de payer : depuis février 2026, il n'y a plus de crédits API offerts.

**3 — LiveKit Cloud**
1. cloud.livekit.io → **Sign up** → crée un projet `tred`.
2. **Settings → API Keys** → **Create key**. Tu obtiens une API Key et un Secret (le secret ne s'affiche qu'une fois).
3. L'URL du projet a la forme `wss://tred-xxxx.livekit.cloud` → `LIVEKIT_URL`.

**4 — Cloudflare R2 (optionnel)**
1. dash.cloudflare.com → **R2 Object Storage** → **Create bucket** → nom `tred-media`, emplacement automatique.
2. **Manage R2 API Tokens** → **Create API token** → permission **Object Read & Write**, limitée au bucket `tred-media`.
3. Tu obtiens `Access Key ID` et `Secret Access Key`. L'**Account ID** est dans la colonne de droite du tableau de bord R2.
4. Si tu sautes cette étape, les médias vont dans ton bucket actuel, sous `media/`.

**5 — ElevenLabs (optionnel)** : elevenlabs.io → **Developers → API Keys → Create**. Puis dans **Voices**, choisis une voix allemande et copie son **Voice ID**.

**6 — Mathpix (optionnel)** : console.mathpix.com → règle les 19,99 $ → **API Keys** → copie `app_id` et `app_key`.

**7 — Sentry** : sentry.io → **Create project** → plateforme **React** → copie le **DSN**.

**8 — PostHog** : eu.posthog.com (région **EU**, important pour le RGPD) → **Project settings** → **Project API key** (`phc_...`).
  Pour le **Dashboard Admin** (`/admin/analytics`) : PostHog → **Settings → Personal API keys** → crée une clé avec le scope **query:read** → `POSTHOG_PERSONAL_API_KEY` (sur Railway, **sans** préfixe `VITE_`), et l'ID numérique du projet (dans l'URL `eu.posthog.com/project/12345`) → `POSTHOG_PROJECT_ID`. Dans PostHog → **Project settings** : active **Session replay** et **Heatmaps**, et coche **Discard client IP data** (RGPD). Rien n'est collecté tant que l'étudiant n'a pas cliqué « Analyse erlauben ».
⚠️ La capture reste **désactivée** jusqu'à ce que l'étudiant accepte une bannière de consentement. Cette bannière n'existe pas encore : c'est une décision produit (texte, design) qui te revient.

**10 — Replicate (génération d'images et de vidéos)**
1. replicate.com → **Sign in** (avec GitHub, c'est le plus rapide).
2. **Account → Billing** : ajoute une carte et, surtout, fixe une **limite de dépense mensuelle** (ex. 20 $). C'est ton filet de sécurité.
3. **Account → API tokens** (replicate.com/account/api-tokens) → **Create token** → nom `tred-prod` → copie le token `r8_...`.
4. Colle-le dans `.env` **et** dans les variables Railway → `REPLICATE_API_TOKEN=r8_...`.
5. Pour que Claude Code puisse aussi utiliser Replicate (MCP, `.mcp.json`) : `setx REPLICATE_API_TOKEN "r8_..."` puis rouvre le terminal.
6. Garde-fous déjà en place : **2 vidéos et 20 images par étudiant et par jour** (`MEDIA_VIDEO_PER_DAY`, `MEDIA_IMAGE_PER_DAY`). Une génération ratée est rendue au quota.

**9 — tldraw** : seulement le jour où l'on veut que l'étudiant dessine. Fais une demande de licence sur tldraw.dev (tarif startup possible sur demande).

---

## 3. Préparer ton fichier Figma

Je lis l'arbre des calques. Un fichier propre me permet un code au pixel près, un fichier en vrac m'oblige à deviner.

```
📄 Page « Hörsaal »
 └─ 🖼 Frame « VirtualClassroom / Desktop 1440 »
     ├─ Sidebar                 (Auto Layout vertical)
     │   ├─ Sidebar/Logo
     │   ├─ Sidebar/NavItem       (variantes : default / active / hover)
     │   └─ Sidebar/Footer
     ├─ Tafel                   (Auto Layout vertical)
     │   ├─ Tafel/Header
     │   ├─ Tafel/Steps           (pastilles des étapes)
     │   └─ Tafel/CurrentStep     (variantes : writing / done)
     └─ Professor               (Auto Layout vertical)
         ├─ Professor/AvatarSlot  (rectangle vide au ratio exact de la vidéo)
         ├─ Professor/AudioBar
         └─ Professor/Bubble
📄 Page « Components »   ← composants maîtres
```

Ces noms correspondent déjà aux `data-slot` du code (`sidebar`, `tafel`, `tafel-steps`, `tafel-current-step`, `professor`, `avatar-video`, `audio-bar`, `professor-bubble`).

1. **Auto Layout partout.** Tes paddings et gaps deviennent directement du Tailwind.
2. **Nommage `Zone/Élément`** en anglais. Jamais `Frame 427`.
3. **Composants + variantes** pour tout ce qui se répète. Nomme les propriétés comme des props (`state=active`).
4. **Variables Figma** pour couleurs, espacements et rayons (`color/sidebar/bg`, `radius/card`). Garde la charte crème / jaune / encre actuelle, ou change-la ici : c'est **ta** décision.
5. **Styles de texte nommés** avec des polices disponibles sur Google Fonts (sinon fournis le `.woff2`).
6. **Une frame par taille** : `Desktop 1440`, `Mobile 390`.
7. **Tous les états** : vide, écriture en cours, prof qui parle, erreur.
8. **Exports** : icônes en SVG, images en PNG @2x. Dépose-les dans `packages/web/src/web/assets/figma-exports/`.
9. **Animations** : décris-les dans une note (« fade-in 300 ms, puis tracé 800 ms »). Un fichier Lottie `.json` exporté depuis After Effects ou LottieFiles est aussi accepté.

Récupère le lien avec un clic droit sur la frame → **Copy link to selection** (il contient `?node-id=`).

---

## 4. Me transmettre le tout (le jour J)

### 4.1 Remplir `.env`
Copie les blocs de `.env.example` dans `.env` et remplis ce que tu as. Les champs vides désactivent proprement la brique correspondante.

### 4.2 Rendre le token Figma visible pour moi
Claude Code ne lit **pas** `.env`. Le serveur MCP déclaré dans `.mcp.json` lit la variable dans ton terminal. Avant de lancer `claude` :

```powershell
# PowerShell (Windows), une fois pour toutes :
setx FIGMA_PERSONAL_ACCESS_TOKEN "figd_..."
# puis ferme et rouvre le terminal
```
```bash
# WSL / bash : ajoute à ~/.bashrc
export FIGMA_PERSONAL_ACCESS_TOKEN="figd_..."
```

Au lancement, Claude Code te demandera d'approuver le serveur `figma` du projet : réponds **oui**. Tape ensuite `/mcp` : `figma` doit apparaître comme connecté.

*Alternative sans token : le serveur officiel de Figma via OAuth, `claude mcp add --transport http figma-official https://mcp.figma.com/mcp`, puis autorise dans le navigateur.*

### 4.3 ter — Activer le vestiaire des professeurs (JUSTE APRÈS LE DÉPLOIEMENT)
```powershell
node C:\dev\tred-rdm\aerostudy-ai\migre-professeur.mjs
```
Ajoute la colonne `professor_id`. Tant qu'elle manque, le choix du professeur échoue (avec un message), le tuteur garde « Prof. Kenta », et l'export RGPD des données échoue.

### 4.3 bis — Passer les comptes existants en style « Interaktiv » (une fois)
Les nouveaux comptes sont déjà en « Interaktiv ». Pour les comptes existants encore en « Ausgewogen » :
```powershell
node C:\dev\tred-rdm\aerostudy-ai\migre-style-interactif.mjs
```
⚠️ Ce script bascule aussi ceux qui avaient choisi « Ausgewogen » exprès : on ne peut pas les distinguer. Chacun peut revenir en arrière dans les réglages.

### 4.3 Créer la table des coûts (une fois)
```powershell
node C:\dev\tred-rdm\aerostudy-ai\migre-avatar-usage.mjs
```

### 4.4 Le message à m'envoyer
```
FIGMA_LINK = https://www.figma.com/design/XXXX/...?node-id=12-345
FRAMES     = Desktop 1440, Mobile 390
CLÉS       = remplies dans .env : HEYGEN, LIVEKIT, (R2), (ELEVENLABS), (MATHPIX), (SENTRY), (POSTHOG)
ASSETS     = N fichiers dans packages/web/src/web/assets/figma-exports/
TABLE      = migre-avatar-usage.mjs lancé : oui/non
```

### 4.5 Ce que je ferai ensuite
1. Je lis la frame Figma par MCP et je te montre les tokens extraits **avant** de coder.
2. Je travaille sur une branche `feat/hoersaal-figma`, rien sur `main` sans ton accord.
3. Je code l'UI Hörsaal fidèle à la frame, via les slots déjà prêts, sans réécrire `chat.tsx`.
4. J'implémente l'étage HeyGen (`api/avatar/heygen.ts`) d'après la doc LiveAvatar du jour.
5. J'active l'avatar avec `VITE_AVATAR_ENABLED=true`, d'abord en local.
6. Je compare des captures Playwright avec ta frame et j'itère.
7. `typecheck`, `build` et tests verts, puis je te montre le **diff et les captures** avant de pousser.

---

## 5. Coûts récapitulatifs (ordre de grandeur)

| Service | Unité | Prix indicatif | Pour 100 sessions de 10 min / mois |
|---|---|---|---|
| HeyGen LiveAvatar, mode Lite | minute d'avatar | ~0,10 $/min (abonnement 19 $/mois) | ~1 000 min → plan Essential **99 $/mois** |
| HeyGen « Avatar Realtime » à l'usage | seconde | **~0,05 $/s = 3 $/min** | ~3 000 $ ⚠️ à éviter, préférer LiveAvatar |
| ElevenLabs (si utilisé) | 1 000 caractères | ~0,08–0,10 $ | ~150 k caractères → ~15 $ |
| LiveKit Cloud | — | **gratuit** sous 100 connexions simultanées | 0 $ |
| Cloudflare R2 | Go stocké | gratuit jusqu'à 10 Go | 0 $ |
| Mathpix | image | ~0,002 $ | négligeable |
| Sentry / PostHog | — | gratuit sur les plans de base | 0 $ |

`lib/avatar-cost.ts` calcule par défaut avec le tarif **pessimiste** (0,05 $/s) pour ne jamais sous-estimer. Quand tu es sur LiveAvatar Lite, mets `AVATAR_PRICE_USD_PER_SEC=0.0017` dans `.env`.

**À propos de Pipecat :** c'est un framework **Python**, sans version serveur TypeScript. Avec LiveAvatar en mode Lite, on n'en a pas besoin : LiveAvatar fait déjà la voix et le transport LiveKit. Si un jour on veut maîtriser chaque étage (notre propre TTS, notre propre room), on déploiera un petit service Python Pipecat à part sur Railway. `pipeline.ts` a été écrit pour que ce changement ne touche rien d'autre.

---

### Sources
[Figma MCP](https://help.figma.com/hc/en-us/articles/35281350665623) · [LiveAvatar](https://help.heygen.com/en/articles/12758516-introducing-liveavatar) · [LiveAvatar SDK](https://github.com/heygen-com/liveavatar-web-sdk) · [Revue LiveAvatar 2026](https://www.liforma.ai/resources/heygen-liveavatar-review) · [HeyGen API pricing (G2)](https://www.g2.com/articles/heygen-api-pricing) · [LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/) · [LiveKit pricing](https://livekit.com/pricing) · [Mathpix pricing](https://mathpix.com/pricing/api) · [tldraw licence](https://tldraw.dev/sdk-features/license-key) · [ElevenLabs pricing 2026](https://www.activepieces.com/blog/elevenlabs-pricing-2026-plans-credits-and-costs.md) · [PostHog free tier](https://costbench.com/software/product-analytics/posthog/free-plan/) · [Sentry free plan](https://costbench.com/software/developer-tools/sentry/free-plan/) · [D-ID pricing](https://www.spatius.ai/blog/d-id-pricing-2026/)

---

## Activer les vraies voix de professeur (ElevenLabs) — 10 minutes

Sans clé, le bouton « Anhören » utilise la voix de l'appareil (souvent robotique) et l'indique discrètement : « Premium-Stimme nicht eingerichtet ». Avec la clé, chaque professeur parle avec SA voix : **Prof. Kenta** (jeune, dynamique), **Prof. Ren** (charismatique), **Dr. Aiko** (posée), **Sensei Haruto** (grave, calme).

1. **Compte** : va sur https://elevenlabs.io → *Sign up* (Google possible).
2. **Abonnement** : le plan *Free* (≈ 10 000 caractères/mois) suffit pour essayer, mais il interdit l'usage commercial et exige d'attribuer ElevenLabs. Pour la bêta avec tes amis, prends **Starter** (≈ 5 $/mois, ≈ 30 000 caractères, licence commerciale). Vérifie les montants sur la page *Pricing*. Une réponse lue ≈ 1 000–1 500 caractères.
3. **Clé API** : en bas à gauche, clique sur ton profil → **API Keys** (parfois sous *Developers*) → **Create API Key** → nom « TRED » → autorise au minimum **Text to Speech** → **Create** → copie la clé `sk_…` (elle ne s'affiche qu'une fois). **Ne la colle jamais dans le chat.**
4. **En local** : ouvre `C:\dev\tred-rdm\aerostudy-ai\.env` et ajoute la ligne `ELEVENLABS_API_KEY=sk_…`.
5. **Sur Railway** : projet *aerostudy* → service **TRED** → onglet **Variables** → **New Variable** → nom `ELEVENLABS_API_KEY`, valeur `sk_…` → **Add**, puis **Deploy** pour appliquer.
6. **(Optionnel) Changer une voix** : ElevenLabs → **Voices** → **Voice Library** → filtre *German* ou *Educational*, écoute, **Add to my voices** → dans *My Voices*, menu « ⋯ » → **Copy Voice ID** → variable Railway `ELEVENLABS_VOICE_KENTA` (ou `_REN`, `_AIKO`, `_HARUTO`).
7. **Budget** : chaque étudiant est plafonné à `ELEVENLABS_DAILY_CHARS` caractères par jour (défaut 20 000). Une même réponse réécoutée ne coûte rien (cache). Au-delà du plafond, la voix de l'appareil prend le relais.

**Tester la différence** : *Einstellungen* → « Stimme des Professors ».
- Choisis une voix « Stimmen dieses Geräts » dans la liste → **Stimme testen** : c'est la voix robotique.
- Puis, dans « Echte Professorenstimmen », clique **▶** sur Prof. Kenta, Prof. Ren, Dr. Aiko : c'est la voix premium.
- Dans le chat, **Anhören** sous une réponse lit TOUTE la réponse avec la voix du professeur choisi dans le vestiaire.
