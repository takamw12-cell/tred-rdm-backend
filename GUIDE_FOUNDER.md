# GUIDE FOUNDER — TRED, de A à Z

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
| UI Hörsaal | `virtual-classroom.tsx` + `hoersaal-stage.tsx` : une seule scène plein écran (Tafel 100 %, professeur flottant déplaçable, barre de chat en verre en bas) + slots `board` / `avatar` + `data-slot` = noms des calques Figma | prêt |

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
  Pour le **Dashboard Admin** (`/admin/analytics`). **Important : après avoir ajouté ou modifié une variable sur Railway, valide le bandeau « Deploy » / « Apply changes ». Sans un NOUVEAU déploiement, rien ne change.** `VITE_POSTHOG_KEY` est figée dans le bundle au moment du build ; les deux autres variables sont lues au démarrage du serveur. La page /admin/analytics indique quelles variables manquent (nom seulement, jamais la valeur), et les journaux Railway affichent `[analytics] PostHog config {...}`. PostHog → **Settings → Personal API keys** → crée une clé avec le scope **query:read** → `POSTHOG_PERSONAL_API_KEY` (sur Railway, **sans** préfixe `VITE_`), et l'ID numérique du projet (dans l'URL `eu.posthog.com/project/12345`) → `POSTHOG_PROJECT_ID`. Dans PostHog → **Project settings** : active **Session replay** et **Heatmaps**, et coche **Discard client IP data** (RGPD). Rien n'est collecté tant que l'étudiant n'a pas cliqué « Analyse erlauben ».
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
     ├─ Tafel                   (plein cadre : 100 % largeur × 100 % hauteur)
     │   ├─ Tafel/Header
     │   ├─ Tafel/Steps           (pastilles des étapes)
     │   ├─ Tafel/CurrentStep     (variantes : writing / done)
     │   └─ Tafel/Ledge           (rebord : couleurs du tableau)
     ├─ Professor               (calque flottant, posé sur la Tafel — position libre)
     │   ├─ Professor/AvatarSlot  (carré, variantes : back / front)
     │   └─ Professor/NamePill
     └─ ChatDock                (barre flottante en bas, centrée, verre dépoli)
         ├─ ChatDock/Messages
         └─ ChatDock/Composer
📄 Page « Components »   ← composants maîtres
```

Ces noms correspondent aux `data-slot` du code (`hoersaal-stage`, `tafel-frame`, `tafel-ledge`, `floating-professor`, `chat-dock`, `chat-composer`, `professor-bubble`). Pas de colonnes : un seul cadre, la Tafel en fond, le reste posé dessus.

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

### 4.3 sexies — Activer les Karteikarten (V2, une fois, AVANT d'en parler aux étudiants)

```
node C:\dev\tred-rdm\aerostudy-ai\migre-flashcards.mjs
```

Ce script crée la table `flashcard` sur Turso. Il est idempotent : tu peux le relancer sans risque. Ensuite :
- la page **/flashcards** apparaît dans le menu ;
- le bloc « Heute zu wiederholen » s'affiche sur le tableau de bord ;
- les étudiants peuvent créer des cartes depuis un document ou une réponse du chat.

Tant que la table n'existe pas, le bloc reste masqué et la création répond « nicht verfügbar ». Le reste de l'app fonctionne normalement.

Coût : un appel IA (Sonnet) par création de cartes, et rien pour la révision. Chaque compte est limité à 20 créations par heure, et le plafond de tokens de son abonnement s'applique.

*Facultatif, sans effet visible pour l'instant :* `node C:\dev\tred-rdm\aerostudy-ai\migre-shared-knowledge.mjs` crée les tables de l'intelligence collective (Pilier 4). Le plan complet de la V2 est dans `docs/V2_ARCHITECTURE.md`.

### 4.3 quinquies — Recherche web du tuteur (optionnel)

Quand l'étudiant n'a pas son cours, TRED cherche lui-même dans **Wikipedia** (aucune clé, aucun coût) : rien à faire.
Pour ajouter une **recherche web** (normes, fiches techniques, articles) :
1. Crée un compte sur https://app.tavily.com, puis **API Keys → Create**.
2. Ajoute `TAVILY_API_KEY` sur Railway (Variables) et dans ton `.env` local.
- **Prix :** offre gratuite « Researcher » à 1 000 crédits par mois, 1 crédit par recherche simple. Au-delà, 0,008 $ par crédit ou un forfait (« Project » à 30 $/mois pour 4 000 crédits). Vérifié le 7 novembre 2026 sur docs.tavily.com.
- **Données envoyées :** seul le terme de recherche part chez Wikipedia ou Tavily, jamais le nom, l'e-mail ni la conversation.
- **Avant d'activer Tavily :** ajoute-le à la liste des sous-traitants de la page Datenschutz (je ne l'ai pas modifiée, c'est un texte juridique).

### 4.3 quater — Activer le feedback des bêta-testeurs (une fois)

```
node C:\dev\tred-rdm\aerostudy-ai\migre-feedback.mjs
```

Crée la table `feedback` sur Turso (idempotent : le relancer ne coûte rien).
Les étudiants envoient un retour depuis le bouton jaune en bas à droite ou
l'entrée « Feedback geben » de la barre latérale ; tu les lis et les marques
« Erledigt » dans **/admin/feedback** (lien depuis /admin). Sans la table, la
modale affiche « Senden fehlgeschlagen » et le reste de l'app marche.

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

---

## Hébergement : région UE (RGPD)

Depuis le 5 nov. 2026, le service **TRED** tourne à **Amsterdam** (Railway *EU West*, `europe-west4-drams3a`), à côté de la base Turso (`aws-eu-west-1`, Irlande). Railway → service TRED → *Settings* → *Regions* : laisse **EU West** uniquement. Un simple *Redeploy* réutilise la région de l'ancien déploiement : après un changement de région, c'est un **nouveau commit** (ou *Deploy latest*) qui l'applique.

## Publicité — activer les régies (quand tu le décides)

**Règle d'or, codée dans `packages/web/src/web/lib/ad-mediation.ts` (et testée) :**
- jamais de pub dans le Hörsaal, le Chat ou un examen en cours ;
- jamais pour un abonné ;
- trois emplacements seulement : l'encart du Dashboard, l'écran de fin de session (fermable après 5 s, au plus 1 toutes les 30 min et 3 par jour) et la vidéo récompensée, toujours volontaire (+1 crédit, 15 s, 3 par jour).

Sans aucune clé, rien ne change : le Dashboard garde les ressources partenaires « maison », sans script tiers.
Les comptes ci-dessous sont gratuits (aucun abonnement). Les régies se rémunèrent par une part des revenus publicitaires.

### Web — Google AdSense (encart + fin de session)
1. Ouvre un compte sur https://adsense.google.com et ajoute le site `tred-tutor.de`. Google vérifie le site, ce qui prend quelques jours.
2. Va dans **Annonces → Par bloc d'annonces** et crée deux blocs :
   - un bloc « Display » responsive pour le Dashboard → `VITE_ADSENSE_SLOT_NATIVE` ;
   - un bloc « Display » pour la fin de session → `VITE_ADSENSE_SLOT_INTERSTITIAL`.
3. Ton ID éditeur `ca-pub-…` va dans `VITE_ADSENSE_CLIENT_ID`.
4. **Obligatoire en UE :** va dans **Confidentialité et messages → RGPD**, crée le message et publie-le. C'est la CMP certifiée de Google : elle demande le consentement aux pubs.
5. Une fois ces variables sur Railway, fais un nouveau déploiement : les `VITE_*` sont intégrées au build.

### Web — vidéo récompensée (Google Ad Manager)
AdSense ne propose pas de vidéo récompensée pour un site : il faut Google Ad Manager (https://admanager.google.com, gratuit pour les petits éditeurs).
1. Crée un bloc d'annonces au format « Rewarded ».
2. Mets son chemin (`/1234567/tred_rewarded`) dans `VITE_GAM_REWARDED_AD_UNIT`.
3. Mets `ADS_REWARDED_ENABLED=true` côté serveur.

**Tester le parcours sans régie :** mets `ADS_TEST_MODE=true` et `VITE_ADS_TEST_MODE=true`. Une fausse vidéo de 15 s, marquée « Testanzeige », crédite réellement +1 : à ne jamais laisser actif en production.

### Mobile — AppLovin MAX (médie AdMob et Unity Ads)
1. Ouvre un compte sur https://dash.applovin.com et récupère la « SDK Key » → `EXPO_PUBLIC_APPLOVIN_SDK_KEY`.
2. Crée les blocs interstitiel et récompensé, iOS et Android → `EXPO_PUBLIC_APPLOVIN_*`.
3. Dans **MAX → Mediation → Manage networks**, active **Google AdMob** et **Unity Ads**. Pour cela, il faut un compte sur https://admob.google.com et un sur https://dashboard.unity3d.com : MAX les met en concurrence à chaque affichage.
4. Dis-moi quand c'est fait. J'installerai alors le SDK natif `react-native-applovin-max`, je brancherai `packages/mobile/lib/ads.ts` (les wrappers sont prêts) et un build EAS sera nécessaire, car Expo Go ne charge pas les modules natifs.

### Ce que mesure PostHog (avec consentement analytique)
`ad_impression`, `ad_click` et `rewarded_ad_completed`, avec la régie, le format, l'emplacement et le sponsor, sans aucun identifiant publicitaire.
Les clics à l'intérieur d'une pub Google (iframe) ne sont pas visibles par TRED : AdSense les compte de son côté.

## Vitesse du chat — la lire et la mesurer

Chaque réponse du tuteur écrit une ligne `[perf]` dans les logs Railway (Deployments → View logs, filtre `[perf]`) :

```
[perf] tier=concept model=claude-sonnet-4.6 thinking=off … first_text=1800ms total=9100ms … cache_read=17900tok
```

- `tier` : `smalltalk` (Haiku, sans réflexion), `concept` (Sonnet, sans réflexion) ou `complex` (Sonnet avec réflexion — calculs, formules, photos). Le choix est automatique (`lib/chat-routing.ts`) ; les solveurs sont les mêmes dans les trois cas.
- `first_text` : temps avant le premier mot affiché à l'étudiant.
- `cache_read` : tokens relus depuis le cache Anthropic. `0` sur la première question d'une session, puis environ 18 000 sur les suivantes (pendant 1 h).

Mesure contrôlée (appels réels, environ 0,5 à 1 €) : mets `ANTHROPIC_API_KEY` dans `C:\dev\tred-rdm\aerostudy-ai\.env` (jamais commité), puis
`cd C:\dev\tred-rdm\aerostudy-ai\packages\web` et `bun --env-file=../../.env scripts/bench-chat-latency.ts`.

---

## Les solveurs — ce que TRED calcule lui-même

Le modèle ne calcule jamais lui-même : il pose le problème, un solveur (du code, testé sur des valeurs de manuel) calcule, et le tuteur explique avec ces chiffres. Dans le chat, un badge « Berechnet mit dem Löser » le montre ; les courbes marquées « automatique » apparaissent sans que le modèle les dessine.

| Matière | Outil | Ce qu'il calcule | Phrase pour tester |
|---|---|---|---|
| Électrotechnique (formules) | `elektro_berechnen` | Ohm et puissance, circuit RLC (f₀, Q), charge RC (courbe automatique), diviseur, système de Kirchhoff | « Reihenschwingkreis R = 10 Ω, L = 10 mH, C = 1 µF: Resonanzfrequenz und Güte? » |
| Matériaux | `werkstoff_berechnen` | Hooke, σ = F/A, dilatation thermique, contrainte de flexion, coefficient de Poisson | « Stahlschiene 1 m, α = 12·10⁻⁶ 1/K, um 100 K erwärmt: Längenänderung? » |
| Chimie | `chemie_berechnen` | masse molaire, concentration, stœchiométrie (refuse une équation non équilibrée), pH, tampon, gaz parfaits | « pH einer Essigsäure mit c = 0,1 mol/L, pKs = 4,76? » |
| Finance | `wirtschaft_berechnen` | intérêts composés, VAN, TRI (signale plusieurs TRI), annuité et tableau d'amortissement | « Kapitalwert und interner Zinsfuß für −1000, 500, 400, 300 bei 10 %? » |
| Lycée | `schule_berechnen` | second degré (forme exacte, formule p-q, sommet, parabole automatique), Pythagore | « Löse x² − 2x − 1 = 0 mit der p-q-Formel. » |

Les solveurs plus anciens (mécanique, circuits complets, thermo, physique, maths, cyber, IA, Collatz) sont listés dans le prompt du tuteur (`api/agent/index.ts`, tableau « FACHLÖSER »). Aucun ne demande de clé ni ne coûte rien de plus.

---

## Agent de rétention — TRED va chercher l'étudiant

Un « battement de cœur » dans le serveur (`lib/retention/heartbeat.ts`) se réveille tous les quarts d'heure et fait un cycle toutes les 12 h, entre 9 h et 20 h à Berlin. Pour chaque étudiant, `lib/retention/agent.ts` prend **une** décision écrite noir sur blanc, sans IA :

| Situation | Action | Ce que l'étudiant voit |
|---|---|---|
| inactif depuis plus de 3 jours | `send_push_notification` | une relance (avec le nombre de révisions en attente) |
| une lacune (exercice raté) de plus de 48 h, sans cartes | `create_flashcard` | « Karteikarten zu … ? » — **Ja, erstellen** ou **Nein danke** |
| des cartes ou lacunes dues aujourd'hui | `send_daily_digest` | le récapitulatif du jour |

Règles de politesse : au plus **1 notification par jour** et par étudiant ; pas deux relances à moins de 3 jours ; plus rien après 3 relances sans retour ou 2 relances refusées en 30 jours ; une proposition refusée n'est jamais refaite. Sur mobile, la notification part par Expo **et** arrive dans la boîte de réception ; sur le web, seulement dans la boîte de réception (tableau de bord, « Vorschläge von TRED »). Quand l'agent est actif, la relance de 19 h n'envoie plus que l'alerte de quota (le récapitulatif vient de l'agent).

**L'activer (une fois) :**
1. `node C:\dev\tred-rdm\aerostudy-ai\migre-retention.mjs` — crée `user_notifications` et `retention_setting`. L'agent est créé **en pause**.
2. Ouvre https://www.tred-tutor.de/admin/retention → **Vorschau** : la liste exacte de qui recevrait quoi, et pourquoi. Rien n'est envoyé.
3. Si la liste te convient : **Agent aktivieren**. Le premier cycle part au quart d'heure suivant (entre 9 h et 20 h). **Pause** l'arrête à tout moment.

Réglages Railway (facultatifs) : `RETENTION_INTERVAL_HOURS` (12 par défaut, de 1 à 168), `DISABLE_RETENTION_AGENT=true` pour le couper complètement. Logs : filtre `retention`.

---

## Identité visuelle — logo et palette

Le symbole retenu est le **concept A, « Boutons-Toque »**. Le kit logo est dans `packages/web/public/brand/` ; pour tout voir, ouvrir `public/brand/preview.html`.

| Format | Fichiers |
|---|---|
| Icône d'app (fond Nuit, coins arrondis par l'OS) | `tred-app-icon.svg`, `tred-app-icon-1024.png` (sans transparence, pour l'App Store) |
| Logo horizontal / vertical | `tred-logo-horizontal.svg`, `tred-logo-vertical.svg` (fond clair) et `…-on-dark.svg` (fond sombre) |
| Favicon (dessiné pour 16 px) | `tred-favicon.svg` |
| Monochrome | `…-black.svg`, `…-white.svg` (symbole, horizontal, vertical) |
| Transparent | `tred-symbol.svg`, `tred-symbol-1024.png` |

Le mot « TRED » est en Poppins Bold (licence OFL), converti en tracés : aucune police n'est nécessaire. Pour optimiser les SVG avec SVGO, désactiver `mergePaths` et les simplifications de courbes de `convertPathData` ; sinon le monochrome et le logo vertical bougent légèrement. Les concepts écartés restent dans `public/brand/concepts/`. La palette officielle s'appelle **« TRED Signal »** : Orange Signal `#FF6B00`, Or Toque `#EAB308`, Cyan Précision `#00D4FF` sur Nuit `#0A0A0A`. Planche de contrôle : `packages/web/public/brand/palette-preview.html`, à ouvrir dans le navigateur. Elle montre toutes les couleurs, les deux modes côte à côte, chaque ratio de contraste et la simulation du daltonisme.

| Fichier | Rôle |
|---|---|
| `src/web/styles/brand/palette.json` | **la seule source** (format du skill brand-identity) |
| `src/web/styles/brand/tokens.css` | variables `--tred-*` : `:root` = clair, `[data-theme="dark"]` ou `.dark` = sombre (généré) |
| `src/web/styles/brand/theme.css` | Tailwind v4 `@theme inline` : `bg-tred-primary`, `text-tred-text-muted`… (généré) |
| `scripts/brand-palette.mjs` | regénère les trois fichiers et **refuse** toute paire sous le seuil WCAG AA |

**Changer une couleur :** modifier `palette.json`, puis lancer `bun scripts/brand-palette.mjs` depuis `packages/web`. Ne jamais modifier `tokens.css` ni `theme.css` à la main. Contrôle croisé avec le skill : `python3 .claude/skills/brand-identity/scripts/palette_audit.py packages/web/src/web/styles/brand/palette.json`.

**Dans l'app (décision du 2026-11-08) :**
- **Couleurs inchangées :** l'app garde crème `#FDFBF7`, encre `#1A1A1A`, jaune `#EAB308`, et le bleu nuit `#0F172A` en sombre (`styles.css`). La palette « TRED Signal » est mise de côté : elle reste dans `styles/brand/`, mais n'est importée nulle part. Pour la brancher plus tard, ajouter `@import "./styles/brand/theme.css";` après `@import "tailwindcss";`, puis faire pointer les variables shadcn vers les rôles `--tred-*`.
- **Logo :** le nouveau logo est en place (`components/logo.tsx`, tracés dans `components/logo-paths.ts`). Dans l'app, les losanges et le mot « TRED » suivent la couleur du texte : encre sur crème, blanc sur la barre latérale bleu nuit. Le gland garde le jaune `#EAB308`. L'orange du kit jurait à côté du jaune de l'interface.
- **Icônes :** le favicon, `favicon.ico`, l'icône Apple, les icônes PWA et le manifest suivent la même règle que le logo : losanges encre et gland jaune sur une tuile crème. Sources : `public/brand/tred-app-icon-ink.svg` (+ `tred-app-icon-ink-1024.png`) et `tred-favicon-ink.svg`. Le kit orange d'origine reste dans `public/brand/`, mis de côté avec la palette.

**Nom officiel : TRED (2026-11-09).** Tout ce que voit l'utilisateur dit « TRED » : titre de l'onglet, nom sur l'écran d'accueil (manifest et `apple-mobile-web-app-title`), fichiers téléchargés (`tred-code.*`, `tred-image.png`), image de partage. « AeroStudy » ne reste que dans des noms techniques invisibles, gardés exprès : le dossier `aerostudy-ai`, les clés `aerostudy-*` du navigateur (les renommer effacerait thème, langue et brouillons de chaque utilisateur), les balises `[[AEROSTUDY]]` des réponses de l'IA (déjà enregistrées dans les conversations), et l'adresse Railway `aerostudy-production-….up.railway.app`.

**Image de partage** (aperçu WhatsApp, iMessage, LinkedIn) : `public/og-image.png` (1200 × 630), source `public/og-image.svg` (logo vertical, encre et gland jaune sur crème). Son URL dans `index.html` est absolue, sinon les messageries l'ignorent. WhatsApp garde un aperçu en cache plusieurs jours : un lien déjà partagé peut montrer l'ancien.

**Après un changement d'icône :** incrémenter le `?v=` des liens d'icônes dans `index.html` (`?v=2` aujourd'hui). Sur un iPhone ou un iPad où TRED est déjà sur l'écran d'accueil, il faut supprimer l'icône puis refaire Partager → « Sur l'écran d'accueil » : iOS ne met jamais à jour une icône déjà posée.

**Outil installé :** le skill `brand-identity` (fatihaydost/brand-identity-skill) est dans `.claude/skills/brand-identity`, installé avec `npx skills@1.7.4 add fatihaydost/brand-identity-skill -s brand-identity -a claude-code --copy`. Ses scripts couleur n'ont besoin que de Python 3. Les parties logo et polices demandent `fonttools`, `uharfbuzz` et `skia-pathops`, qu'il ne faut installer que si on s'en sert.

## Spécialisations avancées (Master / Doctorat)

Quand une question porte sur une spécialisation (aérodynamique, droit des sociétés, neurologie…), TRED charge une méthode propre à ce sous-domaine. Il passe aussi en **mode Vorlesung** : le ton d'un professeur en cours de Master, une dérivation complète, les hypothèses et les limites de validité. La règle est « **Skripte d'abord** » : il cherche d'abord dans les documents de l'étudiant, fait les calculs avec les solveurs, et dit clairement quand un document manque. Une question de base (« Was ist ein Vertrag? ») ou une question de lycée ne déclenche jamais ce mode.

| Famille | Sous-domaines | Spécialisations (un fichier chacune) |
|---|---|---|
| Ingénierie | aerospace, fluid_dynamics, mechanical, electrical, civil | `aerodynamics`, `compressible_flow`, `finite_elements`, `power_electronics`, `reinforced_concrete` |
| Droit | corporate, criminal, international | `corporate_law`, `criminal_law`, `international_law` |
| Médecine | cardiology, neurology, surgery | `cardiology`, `neurology`, `surgery` |

Les fichiers sont dans `packages/web/src/api/lib/domains/` :
- `taxonomy.ts` : la méthode de chaque sous-domaine.
- `specializations/*.ts` : un fichier par spécialisation, avec ses mots-clés pondérés et `rules: []` pour les règles métier à ajouter plus tard.
- `specialization-router.ts` : la détection.

**Ajouter une spécialisation :**
1. Copier un fichier existant dans `specializations/`.
2. Ajouter son identifiant à `SpecializationId` dans `types.ts` et au registre dans `index.ts`.
3. Lancer `bun test`. Les tests vérifient que chaque identifiant a son fichier et que chaque outil cité existe vraiment.

## Schémas des PDF, sous-questions et voix du prof (2026-11-11)

**Le bug :** sur « Uebungsaufgaben Elektrotechnik V3 », Aufgabe 5, le tuteur a résolu e) et f) avec le circuit de a)–d). La cause : les valeurs de e) et f) (R₁, R₂, I₁, I₂) sont **dans les schémas**, et la couche texte du PDF n'en contient aucune. Le tuteur devinait.

**Ce qui est en place :**
- **À l'import** (`src/api/lib/extract.ts`), chaque page qui porte un schéma (image ou dessin vectoriel, logo répété exclu) est décrite par la vision Claude. La description est rattachée à sa sous-question et donne une netlist (quel composant entre quels nœuds). Elle est ajoutée au texte sous la forme `[Abbildung — zu Aufgabe 5 f) — …]`. Coût : environ 0,01 $ par page à schéma, 20 pages au maximum par document.
- **Avant chaque réponse** (`src/api/lib/task-context.ts`), une ligne `⟪NEUER KONTEXT ab Aufgabe 5 e): … (R1 = 20 Ω, …)⟫` est insérée devant chaque sous-question qui commence par « Gegeben ist folgende Schaltung », « Nun gilt », etc.
- **Prompt NIVEAU 4 :** changement de contexte obligatoire. Avant de calculer, le tuteur fait une Selbstprüfung : il résume les données lues, et l'étudiant peut le corriger. Il ne redessine jamais un schéma du document (il montre l'original avec « Im Skript anzeigen »), et il pose la question s'il hésite entre deux schémas.
- **Test réel du 11/11 :** e) I₁ = I₂ = 100 mA, I = 200 mA ; f) I = 100 mA, U₀ = 10 V. C'est identique au corrigé du PDF, sans aucun schéma inventé.
- ⚠️ **Les documents déjà importés n'ont pas les descriptions de schémas.** Pour en profiter, il faut les ré-importer (supprimer puis recharger le PDF).

**Outil de contrôle (PyMuPDF) :** il extrait tous les schémas d'un PDF en PNG, avec page, position et sous-question.
```
uv run --with pymupdf python packages/web/scripts/extract-pdf-images.py COURS.pdf --out figures/
```
Sur le PDF d'ET, il trouve 14 schémas, dont les 3 de l'Aufgabe 5 (circuit de base, e et f).

**Mathpix `v3/pdf` : pas branché, volontairement.** Il convertit un PDF en Markdown + LaTeX, mais ses schémas ressortent comme des **images recadrées** hébergées chez Mathpix, pas en SVG. Il ne « vectorise » pas un circuit. Pour notre problème (connaître les valeurs du schéma), la vision fait mieux. L'endpoint `v3/text` reste utilisé pour l'OCR des photos.

**Voix du prof — `[[PROFESSEUR]]` (NIVEAU 7) :** le tableau reçoit les formules en silence. Le prof ne dit que le bloc `[[PROFESSEUR]]` : l'intuition, une analogie, une question, sans formule. `lib/speech.ts → professorSpeech()` n'envoie à ElevenLabs que ce bloc, nettoyé de toute formule. Sans ce bloc, il dit le texte hors tableau ; à défaut, il se tait. Il ne lit **jamais** le tableau.

## Vidéos promotionnelles — Remotion (`packages/video`)

Les vidéos TikTok / Reels de TRED sont du **code React** : elles réutilisent les vrais composants de l'app (la Tafel, le professeur, le logo, le solveur de Technische Mechanik). Choix fait le 2026-11-10 après comparaison de Remotion, Revideo et HyperFrames (voir `CLAUDE.md`, Règle de Veille Technologique).

- **Rien à installer côté serveur.** `packages/video` n'est ni un workspace de l'app, ni dans l'image Docker (`.dockerignore`). Railway ne le déploie pas.
- **Refaire la vidéo** (WSL ou Linux, Node 22) :
  ```bash
  cd packages/video
  npm install --legacy-peer-deps   # une fois ; React vient de l'app (une seule copie)
  npm run studio                   # aperçu interactif dans le navigateur
  npm run render                   # → out/tred-hoersaal-15s.mp4 (1080×1920, 15 s)
  ```
- **Les 3 vidéos « filières » (30 s, voix off, sous-titres, musique)** — `FR-Medizin-Recht`, `DE-Elektro-Informatik`, `EN-Mechanik-Aerospace` :
  - **Voix off : ElevenLabs** (clé `ELEVENLABS_API_KEY` du `.env`, modèle `eleven_multilingual_v2`, les voix par défaut déjà utilisées par les profs). Les textes sont dans `src/voiceovers.mjs`. `npm run voiceover` ne génère que ce qui manque (`-- fr --force` pour refaire une langue). Coût : ~300 caractères par vidéo, facturés sur ton compte ElevenLabs. Les MP3 générés sont versionnés : refaire le rendu ne coûte rien.
  - **Sous-titres** : horodatage mot par mot renvoyé par ElevenLabs, mis en page par `@remotion/captions` (style TikTok, mot prononcé en jaune).
  - **Musique et effets (clic, succès, souffle)** : synthétisés par code (`npm run audio`, `scripts/audio.py`) — aucun échantillon, aucune licence tierce.
  - **Circuit (vidéo DE)** : schemdraw (`npm run circuit`), symboles DIN/EN. La prod rend les circuits avec CircuiTikz, mais il faut TeX et une session ; schemdraw donne un schéma normalisé équivalent hors ligne.
  - Rendu : `npm run render:fr` / `render:de` / `render:en` → `out/` (1080 × 1920, 30 s).
- **Série « université universelle » (6 × 45 s, EN et DE)** — dossier `src/series/` : `english.tsx` (Beyond Engineering, Universal Tutor, Future of Learning) et `german.tsx` (Jura & Medizin, Wirtschaft & Technik, Alle Fächer). Le moteur (`engine.tsx`) découpe la voix off en segments et les répartit sur 45 s : une scène par segment, la signature sur l'outro. Contenus réels : taxonomie des filières, solveur financier (VAN, taux interne), textes du sélecteur de style d'apprentissage. Voix à vitesse 0,95. `npm run audio:series` régénère les 6 musiques ; `npm run render:series` refait les 6 vidéos (puis normaliser le son à −14 LUFS).
- **Campagne « parle comme un ami » (10 × 30 s, EN et DE, 2026-11-11)** — dossier `src/campaign/` : 5 concepts (Seien wir ehrlich / universalité, le prof qui te comprend / Hörsaal, zéro blabla / solveurs, Klausur dans deux jours, le vibe / design), chacun en anglais et en allemand.
  - **Voix :** ElevenLabs **`eleven_v4`** (le modèle le plus naturel du compte), stabilité 0,3 et style 0,35 pour garder l'émotion, `language_code` fixé (phonétique allemande pour les vidéos DE). Une voix « conversational » différente par vidéo : Chris, Jessica, Will, Charlie, Laura (EN) ; Eric, River, Roger, Hale, Liam (DE). Les textes sont ceux du fondateur, dans `src/voiceovers.mjs` (`CAMPAIGN`). Environ 4 350 caractères pour les 10.
  - **Rythme (version 2, 2026-11-11) :** les textes font 70 à 75 mots et la voix couvre toute la vidéo, de 0,4 s à 28,9 s. Le moteur (`src/campaign/engine.tsx`, `spreadVoice`) répartit les phrases régulièrement : la marge devient des respirations entre les phrases ; si la parole dépasse la fenêtre, la voix est lue un peu plus vite, hauteur conservée (concept 1 : +9 % en anglais, +12 % en allemand). Une scène s'ouvre par phrase, synchronisée sur les mots clés. Les concepts 4 et 5 disent leur dernière phrase sur l'outro TRED. La première version (35 mots) laissait 15 s sans voix : elle a été remplacée.
  - **Images :** les fonds FLUX de l'app (`packages/web/public/backgrounds/`), avec zooms, travellings et coupes « punch ». Contenus réels : le vrai Hörsaal (Tafel, professeurs), Technische Mechanik (poutre sur deux appuis, A = B = ql/2 = 4 kN), le tampon « Berechnet mit dem Löser », le solveur financier.
  - **Refaire :** `npm run voiceover:campaign` (ne régénère que ce qui manque), `npm run audio:campaign` (musiques, puis conversion en MP3), `npm run render:campaign`, qui écrit dans `out/campaign/`. Le son est ensuite normalisé à −14 LUFS.
  - **Mémoire :** le rendu tourne en `--concurrency=1` (une image à la fois). Sans cette limite, Remotion ouvre plusieurs onglets Chrome en parallèle et WSL (7,6 Go) est tué par Windows faute de mémoire. Mesuré le 2026-11-11 : pic de 3,7 Go, environ 3 min 20 par vidéo.
- **Campagne V3 « démonstration » (10 × 30 s, EN et DE, 2026-11-11)** — `src/campaign/demo.tsx` : 5 concepts qui montrent l'app (le parcours taper → envoyer → tableau, les schémas des solveurs, « Als Video erklären », le cours interactif, le tableau de bord), avec un curseur animé qui clique.
  - Le tableau (Hörsaal, KaTeX, schéma de poutre du solveur) est fait des vrais composants de l'app ; l'écran de chat, le lecteur vidéo et le tableau de bord sont des maquettes dans la charte.
  - Structure : carte logo + titre (2,4 s), démonstration, outro « tred-tutor.de » (3,5 s). Les textes font 38 à 57 mots : la voix garde sa vitesse et respire 0,5 à 1,6 s entre les phrases, pendant que l'écran agit.
  - Refaire : `npm run voiceover:demo`, puis `npm run render:demo` → `out/campaign-v3/`.
- **Campagne V4 « Studyflix » (6 × 30 s, 3 EN + 3 DE, 2026-11-12)** — `src/campaign/v4.tsx` : The Research (recherche → page exacte du PDF → formule surlignée), The Workflow (« Explain as video » → vidéo avec le schéma → sauvegarde), The Expansion (bouton Feedback → message → inviter un ami), Die Altklausur-Suche (demande → documents parcourus → solution au tableau), Deep Work (mode immersif → solveur), Die Fachschaft (partage du lien → badge Beta-Tester).
  - Textes : les tiens, mot pour mot (`src/voiceovers.mjs`, `V4`). Voix ElevenLabs conversationnelles (Chris, Jessica, Will, Eric, River, Liam), environ 300 caractères facturés par vidéo.
  - Le curseur guide l'œil et chaque clic déclenche une réaction ; les animations sont calées sur les mots prononcés.
  - Dans « Die Fachschaft », la FH Aachen apparaît en monogramme « FH », comme dans le profil de l'app, et non avec son logo officiel : utiliser le logo d'une Hochschule dans une publicité demande son accord écrit. Si tu l'obtiens, le bloc à changer est `BetaTester` dans `v4.tsx`.
  - Refaire : `npm run voiceover:v4`, puis `npm run render:v4` → `out/campaign-v4/` (une vidéo à la fois, `--concurrency=1`).
  - **Avant de publier D3 et D5 :** elles montrent la vidéo explicative et la section « Meine Erklärvideos », qui ne sont pas encore en ligne (backend fait, lecteur et tableau de bord à venir).
- **Courts-métrages « Cinematic » (12 × 30–35 s, 2026-11-13)** — dossier `src/cinematic/` : format paysage 1920 × 1080, image en 2.35:1 (bandes noires), sous-titres dans la bande du bas. Textes : les tiens, mot pour mot (`src/voiceovers.mjs`, `CINE_A` et `CINE_B`).
  - **Série A, l'étudiant au centre** (`series-a.tsx`) : The Night Before, The Group Project, The Transfer Student (EN) ; Die Nacht vor der Klausur, Die Lerngruppe, Der Austauschstudent (DE). Trois ambiances : nuit ambrée, lumière du jour à accents jaunes, nuit froide.
  - **Série B, « Tech Premium »** (`series-b.tsx`) : The Magic Button, Zero Hallucination, The Universal Brain, en EN et en DE. Mode sombre de l'app, néon jaune, maquette de laptop dessinée en CSS (aucune marque).
  - **Le moteur** (`engine.tsx`, composition `CinematicShort`) : toute l'image passe par `<HtmlInCanvas>` et reçoit `colorCorrection()`, `vignette()` et `noise()` (le grain) de **`@remotion/effects`** ; chaque changement de scène se fait sous un `<LightLeak>` de **`@remotion/light-leaks`** (`hueShift` 0 = chaud, 190 = bleu froid ; 240, essayé d'abord, donne un voile vert). Deux paquets officiels de Remotion, version 4.0.539 comme le reste, même licence que Remotion (voir ci-dessous). La durée de chaque film se déduit de la voix.
  - **L'interface montrée est la vraie** : `scripts/cinematic-captures.mjs` joue les scénarios dans l'app locale (base de test, étudiante fictive « Lena Keller ») et enregistre les écrans : tableau de bord, question, Tafel, courbes du solveur, « Als Video erklären », lecteur. Les réponses du tuteur et la leçon vidéo y sont **simulées** au format exact de l'app (aucun appel au modèle, aucun coût) ; les chiffres sont calculés dans le script. `--dark` refait les captures en mode sombre (série B).
  - **Plans d'ambiance** : `scripts/cinematic-broll.mjs` (Replicate, `lightricks/ltx-2.3-pro`, 6 s, 1080p, sans son) : 9 clips. **Musiques** : `scripts/cinematic-music.mjs` (Replicate, `stability-ai/stable-audio-2.5`, 46 s) : 6 pistes. Les deux sont facturés à l'usage sur ton compte Replicate ; les fichiers sont versionnés, donc refaire un rendu ne coûte rien. **Avant de diffuser, relis les conditions de licence de ces deux modèles sur leur page Replicate** (usage commercial des sorties) : je ne les ai pas vérifiées pour toi.
  - **Voix** : ElevenLabs `eleven_v4`. Série A : Brian, Jessica, George (EN), Eric, River, Liam (DE). Série B (stabilité 0,35, clarté 0,75, comme demandé) : Sarah, Daniel, Charlotte (EN), Matilda, Bill, Lily (DE). Environ 3 300 caractères facturés pour les 12.
  - **Refaire** : `npm run voiceover:cine`, puis `npm run render:cine` → `out/cinematic/` (un film à la fois, `--concurrency=1`, environ 13 min par film : l'étalonnage se calcule sans carte graphique). Débit fixé à 14 Mbit/s : avec le grain, un réglage de qualité constante donnait 17 Mo pour 3 secondes.
  - **À savoir avant de publier** : les personnes des plans d'ambiance sont générées par IA (aucune personne réelle) ; les captures montrent des documents et des exercices d'exemple, pas des données d'étudiants. En mode sombre, les libellés des axes des graphiques de l'app sont presque illisibles (défaut de l'app vu pendant les captures, pas corrigé ici).
- **Licence (vérifiée le 2026-11-10).** Gratuite pour une personne seule et pour les entreprises de **3 personnes au plus**, y compris en usage commercial. **Dès la 4ᵉ personne dans l'entreprise, une « Company License » est obligatoire.** Les prix publiés par des sites tiers se contredisent (de 25 $ à 100 $ par mois et plus) : vérifier le tarif officiel sur https://www.remotion.pro/license le jour de la 4ᵉ embauche. Aucun compte ni aucune clé ne sont nécessaires aujourd'hui.

## « Als Video erklären » — vidéo explicative sur mesure (backend, 2026-11-11)

Plan complet : `docs/VIDEO_EXPLAINER_ARCHITECTURE.md`. Le backend est en place ; le lecteur dans le chat et la section du tableau de bord suivent.

- **À faire une fois :** lancer `node C:\dev\tred-rdm\aerostudy-ai\migre-generated-video.mjs` (crée la table `generated_video`, sans risque à relancer). Tant que ce n'est pas fait, la génération répond `not_migrated` et le bouton garde son comportement actuel.
- **Aucun nouveau compte, aucune nouvelle clé.** La fonction utilise `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` et le bucket des médias (`S3_*` ou `R2_*`). Variables optionnelles : `ELEVENLABS_VIDEO_MODEL_ID`, `ELEVENLABS_VIDEO_VOICE_<LANGUE>` (une voix native par langue).
- **Zéro invention :** sans document de cours, la vidéo est refusée et l'étudiant est invité à déposer son cours. Avec documents, chaque scène doit citer un passage mot pour mot, et chaque nombre doit figurer dans le cours ; un programme le vérifie (`api/lib/video-script.ts`, 21 tests) et supprime les scènes non prouvées.
- **Durée et langue :** la vidéo dure le temps de la voix (30 s à 3 min) ; script et voix sont dans la langue d'interface de l'étudiant.
- **Coût :** la voix est facturée au caractère par ElevenLabs (jusqu'à environ 2 700 caractères pour 3 minutes). Le plafond quotidien par étudiant (`ELEVENLABS_DAILY_CHARS`) et le quota « vidéo » de l'abonnement s'appliquent.
- **Solveurs (2026-11-11) :** chaque calcul réussi d'un solveur dans le chat (Technische Mechanik, thermo, circuits… 16 solveurs) est enregistré avec son entrée et sa sortie (table `solver_result`). La vidéo reçoit ces chiffres avec la consigne « utilise exclusivement ces chiffres calculés par nos solveurs », et le validateur rejette tout nombre qui n'est ni dans les documents ni dans une sortie de solveur. Les arrondis et les changements d'unité d'une valeur calculée sont acceptés (4166,67 N → 4,17 kN), une autre valeur non.
  - **À faire une fois :** lancer `node C:\dev\tred-rdm\aerostudy-ai\migre-solver-result.mjs`. Tant que ce n'est pas fait, les calculs ne sont pas conservés et la vidéo ne s'appuie que sur les documents.
  - Seuls les calculs faits **après** cette mise en ligne sont enregistrés ; les anciennes conversations n'en ont pas.
  - Suppression de compte : `generated_video` et `solver_result` sont effacées avec le reste (`api/lib/gdpr.ts`).
- **Lecteur et tableau de bord (2026-11-11) :** le bouton « Als Video erklären » du Hörsaal appelle la nouvelle route, affiche la préparation (« Drehbuch wird geschrieben », « Stimme wird aufgenommen »), puis joue la vidéo dans une fenêtre, avec le bouton « Im Dashboard speichern ». Le tableau de bord a une section « Meine Erklärvideos ». Tous les textes passent par `t()` dans les 12 langues (`explainer.*`).
  - **Composition :** `packages/web/src/web/video/dynamic-explanation.tsx` (vrais composants du tableau, KaTeX, source citée ou tampon du solveur, sous-titres mot à mot). Verticale sur téléphone, horizontale sur ordinateur. Sa durée est celle de la voix. Elle est aussi enregistrée dans `packages/video` (`DynamicExplanation`) pour l'aperçu et un futur export.
  - **Nouvelle dépendance de l'app :** `@remotion/player` et `remotion` 4.0.539 (version exacte, publiée le 26 oct. 2026, la même que le paquet vidéo). Même licence que plus haut : gratuite jusqu'à 3 personnes dans l'entreprise, payante dès la 4ᵉ. Aucun compte, aucune clé. Le lecteur est chargé à la demande (environ 360 Ko), seulement quand une vidéo est ouverte.
  - **Repli :** si la fonction n'est pas configurée sur le serveur (clé absente, table absente), le bouton rouvre l'ancien diaporama.
- **Démonstration visuelle, toutes filières (2026-11-11) :** la vidéo n'est plus une suite de diapositives. Pour chaque scène, le modèle **choisit** un visuel dans une bibliothèque fermée (`api/lib/video-visuals.ts`) et le code le dessine ; il ne dessine jamais lui-même.
  - **Visuels :** texte de loi ou définition avec mots-clés surlignés (`highlight`), enchaînement d'étapes (`flowchart`), formule tapée caractère par caractère (`formula`), poutre qui se dessine et charges qui arrivent (`beam`, `loads`), vrai schéma du solveur (`solver_plot`), courbe de principe offre et demande (`chart`), image d'illustration (`real_image`), feuille de texte (`text`).
  - **Animations :** les cases surgissent quand la voix les nomme (instant pris dans les mots horodatés), les flèches se tracent, la case active a un halo jaune qui s'éteint à la suivante.
  - **Images :** 26 images des fonds de l'app, par mot-clé (pont, tribunal, marteau de juge, cœur, bloc opératoire, bourse…), plus une image de contexte très sombre derrière les diagrammes. Aucun service d'images extérieur. Ce sont des images générées (FLUX), pas des photographies.
  - **La poutre est toujours calculée :** soit un calcul déjà fait dans le chat, soit l'exemple chiffré du cours que le modèle recopie et que le solveur calcule (chaque valeur doit figurer dans le cours). Sans chiffres : un croquis de principe marqué « Prinzipskizze », sans valeur ni diagramme.
  - **Exemples du quotidien :** deux scènes au plus (« comme un pont qui porte les voitures »), marquées « Beispiel aus dem Alltag », sans aucun chiffre ni formule. C'est la seule partie de la vidéo qui ne cite pas le cours.
  - **Pas de schéma d'anatomie :** ni le modèle ni le code n'en dessinent. La médecine utilise des enchaînements d'étapes et des images d'illustration.
  - **Essai réel sans compte :** `bun --env-file=../../.env scripts/explainer-trial.ts <dossier>` (dans `packages/web`) passe trois questions (mécanique, droit, médecine) au vrai modèle, au validateur et au solveur ; un appel au modèle par question.
- **Pas encore fait :** aucun MP4 n'est produit (le lecteur joue le script et l'audio) ; pas de téléchargement ni de partage de la vidéo. Seule l'économie a une courbe de principe ; les autres courbes de solveurs ne sont pas encore reliées à la vidéo.

## Page d'accueil (refonte du 2026-11-11)

`packages/web/src/web/pages/landing.tsx`, servie sur `/` et `/landing` aux visiteurs sans compte.

- **Aucun prix** : TRED est en bêta, l'accès est annoncé gratuit. Les tarifs et le paiement restent sur `/pricing`, dans l'app ; la page d'accueil n'appelle plus Stripe.
- **Vocabulaire** : jamais « RDM » (Technische Mechanik en allemand, Engineering Mechanics en anglais et en français), aucune comparaison avec un autre assistant. Un test le vérifie (`tests/landing-page.test.ts`), ainsi que l'absence de prix, de témoignage et de nombre d'utilisateurs.
- **Sections** : hero (deux boutons « Kostenlos testen » et « Anmelden »), quatre cartes (Hörsaal, solveurs, vidéos explicatives, toutes les matières), trois étapes, bloc bêta. En-tête collant avec le bouton d'inscription.
- **Langues** : allemand, anglais, français, espagnol (`landing.*`). Les huit autres langues affichent l'allemand tant qu'elles ne sont pas traduites. Le pré-rendu SEO et ses métadonnées sont en allemand.
- **Avant de quitter la bêta** : la page promet un accès gratuit sans donnée de paiement. Le jour où l'offre change, ces textes (`landing.beta`, `landing.note`, `landing.whyText`, `landing.p1`) doivent changer en même temps.

## Sécurité — protocole du 2026-11-09

- **Documents piégés :** chaque extrait de PDF est enfermé dans un bloc `<dokument>` que le contenu ne peut ni fermer ni imiter (`lib/untrusted.ts`). Le prompt (NIVEAU 10) dit que les documents sont des données, jamais des instructions, et qu'il n'existe pas de « code admin ».
- **Schémas SVG :** le nettoyage (`web/lib/svg-sanitize.ts`) résiste maintenant aux formes que le navigateur accepte :
  - `<svg/onload=…>` ;
  - `href=javascript:…` sans guillemets ;
  - entités du type `&#106;avascript:` ;
  - `<iframe srcdoc>`.

  Les SVG des vidéos explicatives passent aussi par ce nettoyage. 21 attaques sont testées dans `tests/svg-sanitize.test.ts`.
- **Comptes bloqués :** un compte bloqué pouvait se reconnecter et garder l'accès à toutes les procédures `/api/rpc/*`. C'est corrigé : la connexion est refusée et chaque procédure vérifie que le compte est actif.
- **Entrées :** chaque champ texte des procédures oRPC a une longueur maximale, et un test refuse tout nouveau champ sans borne.
- **Solveurs :** un solveur qui plante renvoie un résultat propre. TRED dit alors « je ne peux pas calculer cela pour l'instant » et explique la théorie, sans inventer de chiffre.
- **Affichage :** un schéma, un message, la Tafel ou le professeur qui plante ne fait plus tomber la page. Seule la partie fautive affiche « Dieser Teil konnte nicht angezeigt werden ».
- **Typecheck :** `bun run typecheck` vérifie vraiment le code. Avant, `tsc --noEmit` ne contrôlait **aucun** fichier, à cause des références de `tsconfig.json`.

## Maintenance mensuelle et mises à jour automatiques
Tout est dans **`MAINTENANCE.md`** : ce qui tourne tout seul (Dependabot chaque lundi, CI sur chaque modification, scan de sécurité le 1er du mois), les 5 actions du début de mois, et comment changer de modèle d'IA ou de voix sans toucher au code (`PRIMARY_AI_MODEL`, `FAST_AI_MODEL`, `ELEVENLABS_VOICE_*`).

## Fonds d'écran : 10 images par filière, rotation de 10 s (2026-11-11)

- **Modèle :** FLUX 1.1 Pro Ultra sur Replicate (≈ 0,06 $ l'image, vérifié le 2026-11-11), choisi par toi face à FLUX.2 Pro et Imagen 4 Ultra. Style commun : sombre, cinématographique, reflets dorés.
- **Générer :** recharge le crédit sur https://replicate.com/account/billing (il était à 0 le 11 nov. : réponse 402), puis :
  - une filière (test, ~0,60 $) : `bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs aerospace`
  - toutes (23 filières, 230 images, ~14 $) : `bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs --all --budget=15`
  - Le script reprend où il s'est arrêté, n'écrase jamais une image, écrit les WebP (qualité 85) dans `packages/web/public/backgrounds/<filière>/<filière>-uNN(-p).webp` et met à jour `packages/web/src/web/data/universal-backgrounds.json`. Ensuite : `bun test tests/background-sets.test.ts`, commit, push.
- **État au 11 nov. 2026 (fin d'après-midi) :** 227 images en ligne, sur les 23 filières, pour environ 13,70 $ au total. 3 images ont été retirées car hors charte : languages-u01 et languages-u08 (texte illisible), psychology-u05 (presque noire). Leurs prompts sont corrigés, et les filières concernées tournent sur 9 images en attendant. Pour les refaire (environ 0,18 $) : `bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs languages psychology --budget=0.20`.
- **Bascule automatique :** dès qu'une filière a 3 images universelles ou plus, elle ne tourne plus que sur elles. Avant : ses anciennes photos (rien ne casse).
- **Rotation :** toutes les 10 s, fondu d'1 s, ordre aléatoire re-tiré à chaque tour, image suivante préchargée. Bouton Pause discret au-dessus du bouton de retours ; en pause par défaut si l'appareil demande « moins d'animations ». Test rapide : `?bg=3` dans l'URL.
- **Cache :** `/backgrounds/*.webp` est servi avec `Cache-Control: public, max-age=31536000, immutable`. Conséquence : **ne jamais remplacer une image sous le même nom**, toujours lui en donner un nouveau.
- **Nouvelles filières reconnues :** Biologie, Psychologie, Philosophie, Sprachen/Übersetzen, Geschichte (fond général en attendant leurs images).

## Profil d'études synchronisé (12 nov. 2026)

Filière, Hochschule, semestre, niveau et style d'apprentissage sont enregistrés dans `user_access` et suivent l'étudiant sur tous ses appareils. Aucun compte à créer, aucune clé, aucun coût.

- **À lancer une fois** : `node C:\dev\tred-rdm\aerostudy-ai\migre-profil-complet.mjs` (idempotent). Tant qu'il n'a pas tourné, le profil reste dans le navigateur, comme avant, et rien ne casse.
- **Routes** : `account.getProfile` et `account.updateProfile` (`api/routes/account.ts`).
- **Règle** : à la connexion, le profil du serveur gagne. S'il n'y en a pas, celui du navigateur y est envoyé une fois (jamais l'ancien profil de démonstration). Détail dans `api/lib/stored-profile.ts`.
- **Non synchronisés** : langue maternelle et niveau d'allemand saisis à l'onboarding (ils ne servent à rien d'autre pour l'instant).
- Les nouvelles colonnes ne sont volontairement pas dans le schéma Drizzle : voir `api/lib/stored-profile-db.ts`.

## Tarifs, essai et paiement (12 nov. 2026)

> **MODE BÊTA GRATUIT (décision du 12 nov. 2026, pour environ 2 mois).** La grille ci-dessous est prête mais **pas activée**. Tant que la variable `BILLING_ENABLED` ne vaut pas `true` dans Railway :
> - tous les comptes non abonnés ont le tarif « beta » : compteurs illimités en pratique (garde-fou anti-abus : 3000 chats, 150 vidéos, 600 exercices par mois, plus le plafond de tokens) ;
> - aucun paiement ne peut démarrer, ni abonnement ni crédits, même par appel direct à l'API ;
> - l'essai de 14 jours ne commence pas : il est gardé intact pour le lancement ;
> - `/pricing` affiche « Phase de Bêta : TRED est 100% gratuit… », les boutons sont grisés (« Au lancement officiel »), et le bandeau « Il te reste X jours d'essai » est masqué.
>
> **Le jour du lancement :** revois les montants dans `PRICING` (`packages/web/src/api/lib/plan.ts`), crée les prix Stripe, puis mets `BILLING_ENABLED=true`. Rien d'autre à changer. Tu n'as donc **pas** besoin de configurer Stripe maintenant.

**La grille** (une seule source dans le code : `packages/web/src/api/lib/plan.ts`, `PRICING` et `LIMITS`) :

| Offre | Prix | Par mois |
|---|---|---|
| Free | 0 € | 50 chats, 5 vidéos, 10 exercices |
| Étudiant mensuel | 14,99 € / mois | 1000 chats, 50 vidéos, 200 exercices |
| Étudiant semestriel | 59,99 € / 6 mois (9,99 € / mois, badge « -30 % ») | idem |
| Crédits à l'unité | 5 € = 50 crédits | 1 chat = 1 crédit, 1 exercice = 2, 1 vidéo = 10 |

**L'essai de 14 jours.** Sans carte, une seule fois par compte. Un nouveau compte le commence à l'inscription ; un compte plus ancien le lance depuis `/pricing` ou depuis la fenêtre de limite. À la fin, le compte redevient Free tout seul : le serveur compare la date à chaque requête, aucune tâche planifiée. Pendant l'essai l'app affiche « illimité » ; un garde-fou anti-abus reste en place (3000 chats, 150 vidéos, 600 exercices et le plafond de tokens), qu'un étudiant n'atteint pas en 14 jours. Pour le changer : `LIMITS.trial` et `TOKEN_CAPS.trial`.

**Ce que tu dois faire dans Stripe** (dashboard.stripe.com, je ne crée rien à ta place) :
1. Catalogue de produits → produit « TRED Étudiant » avec deux prix récurrents : 14,99 € par mois, et 59,99 € tous les 6 mois.
2. Produit « TRED Crédits » avec un prix **unique** de 5,00 €. Sur ce **prix**, ajoute la métadonnée `credits` = `50`. Sans elle, le paquet est ignoré.
3. Développeurs → Webhooks → endpoint `https://www.tred-tutor.de/api/subscriptions/webhook`.
4. Copie dans Railway : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_SEMESTER`, `STRIPE_PRICE_CREDITS_SMALL`. Laisse `STRIPE_TRIAL_DAYS` à `0` (sinon Stripe ajoute son propre essai par-dessus celui de l'app).

Si un prix Stripe ne correspond pas à la grille, la page affiche le prix Stripe (celui qui sera encaissé) et le serveur l'écrit dans les logs (`ne correspond pas à la grille`).

**Migration à lancer une fois :** `node migre-trial.mjs` (ajoute `user_access.trial_ends_at`). Tant qu'elle n'a pas tourné, il n'y a pas d'essai et rien ne casse.

**AGB.** Le § 4 (Testphase) a été réécrit : l'essai ne se transforme plus en abonnement. Le § 10 t'oblige à prévenir les comptes existants par e-mail ; fais relire le texte avant de l'envoyer.

## « Als Video erklären » — mini-leçon animée (12 nov. 2026)

Chaque vidéo suit désormais quatre temps, dans l'ordre : **la question mystère** (elle s'écrit en grand, lettre après lettre), **l'explication pas à pas**, **l'exemple concret**, **le récapitulatif** (les points se cochent un par un). Une étiquette (« Die Frage », « Schritt 2 », « Beispiel », « Merke ») indique où l'on en est.

- Le script (JSON) porte pour chaque scène `stage` et `visual_cues` : des ordres comme `ask_question`, `draw_flowchart`, `write_equation`, `show_beam`, `apply_loads`, `plot_curves`, `check_recap`. Le modèle donne l'ordre ; c'est le code qui dessine et anime (liste fermée dans `packages/web/src/api/lib/video-visuals.ts`).
- Animations : cases du diagramme une par une au moment où la voix les nomme, équations à la machine à écrire, poutre et courbes du solveur qui se tracent, fonds sombres à halos jaunes, sous-titres mot à mot en bas.
- Le contrôle « zéro invention » est inchangé : chaque scène cite sa source, chaque nombre est vérifié. La question mystère ne cite rien, donc elle ne peut contenir aucun chiffre.
- Les vidéos déjà enregistrées se lisent comme avant (sans étiquette d'étape).
- Aperçu : dans `packages/video`, `npx remotion studio src/index.ts`, composition `DynamicExplanation`.
- Je n'ai pas lancé d'essai avec le vrai modèle (il coûte un appel par question) : la première vraie vidéo générée est à regarder de près.

## Administration : réservée à ton compte (12 nov. 2026)

`/admin` et toutes les données d'administration ne s'ouvrent que si DEUX conditions sont remplies, vérifiées sur le serveur (`packages/web/src/api/lib/admin-guard.ts`) :
1. l'e-mail de la session figure exactement dans `ADMIN_EMAILS` (Railway → Variables) ;
2. le compte a le rôle `admin` en base (attribué automatiquement à la prochaine connexion d'une adresse de la liste) et il est actif.

- `ADMIN_EMAILS` vide ou mal écrite : personne n'entre, toi compris. Vérifie qu'elle contient bien l'e-mail de ton compte.
- Retirer une adresse de la liste ferme son accès tout de suite, même si son rôle est resté en base.
- Un visiteur reçoit 404 sur la page et 401 sur l'API ; un étudiant connecté reçoit 404 partout (jamais 403, qui confirmerait que la page existe).
- Quand la vérification des adresses par e-mail est active (clé Resend), l'adresse doit être confirmée.
- Le test `tests/admin-guard.test.ts` échoue si une route `/api/admin/*` est ajoutée sans garde.

## « Als Video erklären » — la main-feutre (prototype, 12 nov. 2026)

Choix validé : rester dans Remotion (aucun nouvel outil, aucune dépendance) plutôt qu'un post-traitement sur images. Une main qui tient un feutre suit le bout du trait pendant que le schéma se dessine.

- Prototype sur la scène de la poutre (`beam`, `loads`) : la main trace la poutre, passe sur les appuis, puis accompagne chaque flèche de charge.
- Calée sur la voix : quand poutre et charges sont dans la même scène, les charges arrivent au moment où la voix dit « charge » / « Last » / « load ».
- La main ne calcule rien et ne lit aucune valeur : `packages/web/src/web/video/marker-hand.ts` ne fait que suivre le tracé existant. Positions et valeurs restent celles du solveur ; le contrôle anti-invention n'est pas touché.
- Non-régression : `tests/marker-hand.test.ts` vérifie, sur le script réel de référence (`tests/fixtures/explainer-flexion.json`), que les 8 scènes sont là, dans l'ordre, avec le même texte.
- Pour étendre la main à d'autres visuels (courbes du solveur, formules) : `HAND_VISUALS` dans `marker-hand.ts`, puis une fonction de position par visuel.

## Compte de test en production (à supprimer avant l'ouverture publique)

Créé le 12 nov. 2026 pour valider « Als Video erklären » de bout en bout sur tred-tutor.de, à ta demande. Ce n'est pas ton compte.

- **Nom affiché :** « Test Pipeline ». **Adresse :** une boîte jetable `tredtest…@fldubai.com` (service mail.tm).
- **Identifiants :** dans `C:\Users\HP\AppData\Local\Temp\tred-perf\prod-test\creds.json` sur ton PC (adresse, mot de passe du compte TRED, mot de passe de la boîte jetable). Ce fichier n'est pas dans le dépôt et ne doit jamais y entrer. Le dossier `prod-test\profile` à côté contient la session du navigateur de test. Attention : c'est un dossier temporaire de Windows ; si tu veux garder le compte longtemps, copie `creds.json` dans ton gestionnaire de mots de passe.
- **Ce qu'il contient en production :** un document (`TM2_Testskript_Biegung`, un chapitre écrit pour le test) et une vidéo explicative (« Biegung eines Balkens – Schritt für Schritt »).
- **Ses droits :** un compte étudiant ordinaire (tarif « beta »). Il n'est pas dans `ADMIN_EMAILS` et n'a aucun accès à l'administration.

**Pour le supprimer le moment venu**, au choix :
1. Te connecter avec ce compte (identifiants de `creds.json`), puis Einstellungen → « Konto löschen » et taper `LÖSCHEN`. C'est le parcours RGPD normal : le compte, son document, sa vidéo et le fichier audio sont effacés.
2. Ou demander à Claude Code : « supprime le compte de test de production » ; il utilisera le même parcours avec la session gardée dans `prod-test\profile`.

Ensuite, supprime le dossier `C:\Users\HP\AppData\Local\Temp\tred-perf\prod-test`. La boîte jetable disparaît d'elle-même.

## Montée en charge : file Redis et service worker (14 nov. 2026)

**Le problème.** L'import d'un document était traité dans la requête HTTP : pendant l'extraction (jusqu'à plusieurs minutes pour un scan), le service web gardait le fichier en mémoire et son processeur occupé. À quelques dizaines d'imports en même temps, tout le site ralentit.

**Ce qui change.** Le service web valide le fichier, le range dans le stockage objet (R2), dépose un travail `import-pdf` dans Redis et répond tout de suite avec un `jobId`. Un second service, le **worker** (même dépôt, point d'entrée `packages/web/src/worker.ts`), fait l'extraction. Le navigateur suit l'avancement sur `GET /api/jobs/:jobId` (`pending` → `processing` → `done` ou `failed`).

**Tant que tu n'as rien fait, rien ne change** : sans `REDIS_URL`, l'import est traité comme avant. Si Redis tombe un jour, le site retombe tout seul sur ce chemin.

### Mise en service sur Railway : un clic (préparé le 14 nov. 2026)

Tout est **déjà préparé dans ton projet Railway, en modifications en attente** (« staged changes », 37 lignes). Rien n'est créé ni facturé tant que tu ne les appliques pas :

1. Ouvre le projet `aerostudy` sur Railway, environnement `production`. Un bandeau annonce les modifications en attente.
2. Relis-les : un service **Redis** (image `redis:8.2`, volume `redis-volume`), un service **worker** (même dépôt, branche `master`, commande `bun packages/web/src/worker.ts`, une réplique, région `europe-west4`, dix variables dont huit relisent celles du service web par `${{TRED.NOM}}`), et `REDIS_URL = ${{Redis.REDIS_URL}}` sur le service web **TRED**.
3. Clique sur **Deploy**. Redis démarre en une minute, le worker se construit en une dizaine de minutes (même image Docker que le web), le service web redéploie.
4. **Vérifier le worker.** Ses journaux affichent `[worker] prêt — files : import-pdf ×1, generate-video ×3`.
5. **Vérifier un import.** Importe un PDF : les journaux du worker affichent `[worker] import imp_… : terminé (N pages)`.

Coût : Redis et le worker sont facturés à l'usage (mémoire, processeur, disque), tarifs sur https://railway.com/pricing. Le plan Hobby inclut 5 $ d'usage par mois (documentation Railway, lue le 14 nov. 2026).

Pour ne PAS le faire : dans le même bandeau, « Discard changes ».

**Filet de sécurité.** Le service web ne dépose un travail que s'il voit un worker vivant (un « battement » posé dans Redis toutes les 10 secondes). Worker arrêté, en cours de déploiement ou planté : en moins de 40 secondes le site retraite l'import dans la requête, comme avant. Personne ne reste devant une barre de progression immobile.

**Deux points Railway à connaître (lus dans leur documentation le 14 nov. 2026).**
- Les fichiers `railway.json` (« Config as Code ») sont **dépréciés** : ils ne fonctionnent plus pour un nouveau service, et cessent de fonctionner pour les services existants le **1er décembre 2026**. C'est pour cela que la commande de démarrage du worker se règle dans ses Settings. Le fichier `railway.worker.json` du dépôt ne sert donc à rien : tu peux le supprimer.
- Le service web utilise encore `railway.json` (constructeur Dockerfile, commande de démarrage). Après le 1er décembre, Railway devrait se rabattre sur le `Dockerfile` de la racine, qui lance la même commande : rien ne devrait changer. À vérifier ce jour-là (un schéma électrique dans le chat doit toujours se compiler), ou à régler avant en demandant la migration vers `.railway/railway.ts`.

**Revenir en arrière** : supprime `REDIS_URL` du service web. L'import redevient synchrone au redéploiement.

**Aucune table à créer.** L'état des travaux vit dans Redis (une heure après la fin, un jour après un échec).

| Variable | Service | Rôle |
|---|---|---|
| `REDIS_URL` | web + worker | active la file |
| `WORKER_IMPORT_CONCURRENCY` | worker | imports en parallèle par réplique (défaut 1 depuis le 14 nov. 2026 : un document à la fois) |
| `WORKER_VIDEO_CONCURRENCY` | worker | vidéos en parallèle par réplique (défaut 3) |

### « Als Video erklären » passe par la même file

Le clic dépose un travail `generate-video`. Le worker enchaîne script (Claude) → contrôle par du code → voix (ElevenLabs) → stockage, et le navigateur affiche la vidéo dès qu'elle est prête (`GET /api/jobs/gv_…` pour l'état, `GET /api/video/gv_…` pour le contenu).

- **Reprises.** Une panne passagère (Claude, ElevenLabs ou le stockage ne répondent pas) est reprise **2 fois**, après 5 s puis 10 s. Au troisième échec, la vidéo est marquée `failed` et l'étudiant voit « Das Video konnte nicht erstellt werden. ».
- **Pas de reprise pour un refus.** Un script que le contrôle n'a pas pu prouver (`not_grounded`) ou le plafond quotidien de voix (`daily_limit`) sont des décisions : les rejouer paierait un appel de plus pour la même réponse.
- **Une reprise ne coûte pas deux fois.** Le script validé est gardé entre deux essais : si seule la voix a échoué, on ne repaie pas Claude.
- **Limite à connaître.** Le plafond quotidien de caractères ElevenLabs (`ELEVENLABS_DAILY_CHARS`) est compté en mémoire, par processus. Avec le worker, les vidéos ont donc leur propre compteur, séparé de la lecture à voix haute du chat, et chaque réplique a le sien. Les quotas du tarif (vidéos par mois) restent, eux, en base et exacts.


### Le film d'attente pendant un import

Pendant qu'un import tourne, l'écran de chargement montre un film TRED de 10 s en boucle, **vertical** (9:16), muet (ses sous-titres sont dans l'image), et une barre qui suit l'état du travail. Dès que le travail est `done`, l'écran disparaît. « Ausblenden » ou Échap le masque sans arrêter l'import.

- Fichier : `packages/web/public/videos/import-wait-v2.mp4` (0,8 Mo, 720 × 1280) et son image `import-wait-v2.webp`. Source : le pilote `SK-1-Die-Klausur-morgen.mp4`, de 6,2 s à 16,2 s (« 0 Ahnung » → le trait orange → la question dans TRED → la Tafel).
- Ce film porte les couleurs de la campagne (orange) à l'intérieur de l'app. Si tu préfères un film aux couleurs de l'app, il suffit d'en mettre un autre (ci-dessous).
- **Changer de film** : exporte 10 s en 720 × 1280 sans piste son, nomme-le `import-wait-v3.mp4` (le numéro compte : le fichier est mis en cache un an) et change les deux constantes en tête de `web/components/import-wait-overlay.tsx`.

## Import par lot : plusieurs fichiers d'un coup (14 nov. 2026)

L'étudiant peut choisir (ou glisser-déposer sur le panneau « Meine Kurse ») **jusqu'à 5 fichiers, 100 Mo en tout** ; chaque fichier reste limité à 50 Mo. Un seul fichier garde l'écran d'avant (film d'attente + Prof. Kenta). À partir de deux, l'écran d'attente montre **la file** : une ligne par fichier avec son statut — *Wartet*, *Wird hochgeladen …*, *Wird gelesen …*, *Fertig*, *Fehler*.

**La règle : un lot est une suite d'imports indépendants.** Chaque fichier a son `documentId`, sa clé de stockage (`documents/<compte>/<document>.<ext>`) et son travail dans la file. Un fichier refusé n'arrête pas les autres ; sa ligne dit pourquoi, et la liste reste affichée dans le panneau tant qu'il reste un échec à lire.

| Cas | Ce que voit l'étudiant |
|---|---|
| PDF protégé par mot de passe | « Diese PDF ist mit einem Passwort geschützt. Entferne den Schutz und lade sie erneut hoch. » |
| Fichier abîmé (structure PDF illisible) | « Diese Datei ist beschädigt und lässt sich nicht öffnen. » |
| Plus de 5 fichiers, ou plus de 100 Mo | refus avant tout envoi : « Höchstens 5 Dateien auf einmal. » / « Zusammen höchstens 100 MB auf einmal. » |
| Limite d'imports (10 par heure et par compte) atteinte au milieu du lot | les fichiers déjà acceptés passent, les suivants affichent le message de limite |

Ces deux messages (mot de passe, fichier abîmé) valent aussi pour l'import d'un seul fichier, qui affichait jusque-là une erreur technique.

**Deux chemins, le même résultat :**
- **file active** (Redis + worker déployés) : le lot part en un envoi, `POST /api/documents/upload-batch`, qui répond tout de suite `202 { results: [{ name, jobId, documentId, error }], jobIds }` ; le navigateur suit chaque travail par `GET /api/jobs/:jobId` ;
- **sans file** (l'état de la production tant que les changements Railway ne sont pas déployés) : la route répond `503 queue_unavailable` et le navigateur dépose les fichiers un par un par `POST /api/documents/upload`. Rien à régler : il lit `importQueue` dans `/api/config`.

**Formats.** Le lot accepte les mêmes formats que l'import d'un fichier (PDF, Word, PowerPoint, texte, images), avec le même contrôle du contenu réel — pas seulement les PDF : refuser dans un lot une diapositive acceptée seule aurait été incompréhensible.

**Worker.** Il lit **un document à la fois** par défaut (`WORKER_IMPORT_CONCURRENCY=1`). Pour aller plus vite sans risque pour la mémoire : une réplique de plus (voir « Avant un pic »).

**Mémoire du service web.** Un lot de 100 Mo est reçu en entier avant d'être distribué : compte jusqu'à 200 Mo de mémoire pendant quelques secondes pour un lot maximal. Si le service web est sur une petite instance et que beaucoup d'étudiants déposent de gros lots en même temps, c'est le premier chiffre à surveiller dans Railway → TRED → Metrics.

Où est quoi : `api/lib/import-batch.ts` (le lot, côté serveur), `web/lib/import-batch.ts` (la file, côté navigateur), `web/components/import-queue.tsx` (les lignes), tests dans `tests/import-batch.test.ts`.

## Fidélité aux documents : extraits tracés, citations vérifiées, lecteur PDF (15 nov. 2026)

**Le principe.** TRED ne doit jamais attribuer à un document ce qui vient d'un autre, ni citer une page au hasard. Trois garde-fous, sans aucun service payant en plus :

1. **Chaque extrait remis au tuteur porte son document et sa page.** Le texte d'un document garde une marque `[[SEITE n]]` au début de chaque page ; un extrait pris au milieu d'une page redit maintenant sa page en tête. (Avant, il arrivait sans numéro, et le tuteur citait la page de l'extrait précédent.) Chaque document reste enfermé dans son enveloppe `<dokument titel="…">`.
2. **La consigne du tuteur (NIVEAU 4)** : toujours citer le document ET la page, ne jamais deviner une page, ne jamais mélanger deux documents, et signaler une contradiction entre deux documents au lieu d'en choisir un en silence.
3. **Chaque citation est vérifiée par le serveur** avant de devenir une référence cliquable (voir ci-dessous).

**Ce que voit l'étudiant.** Quand le tuteur cite son cours, un badge apparaît sous le passage, dans la Tafel comme dans le chat : `Thermo_Kapitel_3 · S. 12 ✓`. Un clic ouvre **le PDF d'origine à cette page**, dans le lecteur de l'app (flèches, saisie du numéro de page, zoom, ajustement à la largeur, Échap pour fermer ; ← → et + − au clavier). L'onglet « Extrahierter Text » reste là, avec la phrase surlignée.

| Ce que le serveur constate | Ce que montre le badge |
|---|---|
| la phrase est dans le document, à la page annoncée | titre, page, coche verte |
| la phrase y est, mais sur une autre page | titre, **la vraie page**, coche verte (l'info-bulle dit que la page a été corrigée) |
| le document existe, la phrase n'y est pas mot pour mot (reformulation) | titre et page, **sans coche** |
| aucun document de l'étudiant ne correspond | « Quelle nicht gefunden », non cliquable |

Avant ce changement, la page citée était ignorée, et un titre qui ne correspondait à rien ouvrait le premier document de la liste.

**Format de citation : inchangé.** Le tuteur écrit toujours `[[QUELLE doc="<titre>" seite=<n>]]phrase exacte[[/QUELLE]]`. Je n'ai pas créé le format `[CITE:id|page|texte]` du brief : le modèle produit déjà l'actuel correctement en production, un nouveau format ne pouvait pas être essayé sur le vrai modèle sans dépense, et faire recopier un identifiant technique à un modèle est une source d'erreurs. Le document est retrouvé par son titre puis confirmé par la phrase.

**Sécurité de l'original.** Le lecteur lit le fichier par `GET /api/documents/:id/stream`, sur notre propre domaine : il faut être connecté ET propriétaire. Pour tout autre compte la réponse est `404`, la même que pour un identifiant inventé (on ne confirme pas qu'un document existe) ; sans session, `401`. Le fichier part par morceaux (seules les pages affichées sont téléchargées) et ne peut pas s'exécuter comme une page de TRED. **Rien à régler sur R2** : pas de CORS, pas de lien public.

**Lecteur PDF : choix de l'outil** (registre npm vérifié le 14 nov. 2026).

| Option | Licence | Verdict |
|---|---|---|
| `pdfjs-dist` 6.4.299 (PDF.js, Mozilla) | Apache-2.0, gratuit | **retenu** : déjà dans le projet, aucun paquet ajouté ; marche sur téléphone |
| `react-pdf` 11.0.0 | MIT, gratuit | enveloppe du même moteur, mais embarque sa propre copie dans une autre version (6.3.289) : deux PDF.js dans l'app |
| EmbedPDF 3.2.0 | Apache-2.0, gratuit | autre moteur (PDFium), plus lourd ; version publiée 3 jours plus tôt (règle des 14 jours) |
| `react-pdf-viewer` | — | dernière version en 2023, dépôt archivé d'après un guide de 2026 |
| Apryse WebViewer, Nutrient | payants, sur devis | hors sujet pour afficher une page |

**Recherche vectorielle : pas ajoutée, à décider.** TRED choisit les extraits par correspondance de mots (BM25), et le tuteur peut relancer lui-même une recherche avec d'autres mots. Des embeddings trouveraient mieux les synonymes, mais demandent un service payant qui recevrait les cours des étudiants (un sous-traitant de plus à déclarer), un stockage vectoriel et une réindexation de tous les documents. Si tu veux y aller, je te prépare la comparaison chiffrée de trois options avant d'écrire une ligne.

**Limites connues.**
- Dans le PDF, la phrase n'est pas encore surlignée (elle l'est dans l'onglet texte) : le lecteur ouvre la bonne page.
- Les documents importés avant que les originaux soient gardés, et les fichiers Word ou PowerPoint, n'ont pas de PDF à afficher : le badge ouvre alors le texte extrait, à la phrase.
- Le premier affichage charge PDF.js (environ 400 Ko, une seule fois, et seulement à l'ouverture d'un document).

Où est quoi : `api/lib/retrieval.ts` (extraits et pages), `api/lib/citations.ts` (vérification), `api/lib/document-stream.ts` et `document-owner.ts` (accès à l'original), `web/lib/citations.ts`, `web/components/citation-badge.tsx`, `web/components/pdf-viewer.tsx`, `vite/pdfjs-assets-plugin.ts` (polices et décodeurs de PDF.js copiés au build). Tests : `retrieval-pages`, `citations`, `citation-badge`, `document-stream`.

## Sécurité et limites — durcissement du 14 nov. 2026

| Point | Ce qui est en place | Où |
|---|---|---|
| Taille d'un fichier | **50 Mo** au plus. Refusé sur la taille annoncée, avant de lire le corps, puis sur la taille réelle. Le navigateur refuse aussi avant l'envoi. | `api/lib/upload-guard.ts` |
| Type réel | La **signature** du fichier (ses premiers octets) doit correspondre à l'extension : `%PDF-`, zip Office contenant `word/` ou `ppt/`, en-têtes PNG / JPEG / WebP / HEIC, texte sans octet nul. Un exécutable renommé « cours.pdf » est refusé (415). | `api/lib/upload-guard.ts` |
| Limite par compte | **10 imports par heure**, **5 vidéos par jour**, comptés sur l'identifiant du compte (se reconnecter ne remet rien à zéro). Réglables : `IMPORT_RATE_PER_HOUR`, `VIDEO_RATE_PER_DAY`. | `api/middleware/rate-limit.ts` (`userRateLimit`) |
| Limite de rafale | Déjà là pour l'import ; ajoutée sur `/api/video/generate` et `/api/storage/upload`. | `api/index.ts` |
| Stockage | Les fichiers des étudiants ne touchent jamais le disque du service : originaux et voix dans le stockage objet (R2), lus par **URL signée d'une heure**. Seul LaTeX écrit sur le disque (fichiers de travail et cache de schémas, recalculables). | `api/routes/documents.ts`, `api/lib/tikz.ts` |
| CORS | Restreint aux origines de confiance (le site, l'app mobile, le local en développement, `TRUSTED_ORIGINS`). Une écriture venue d'un autre site reçoit `403 ORIGIN_NOT_ALLOWED` ; une lecture est servie sans en-têtes CORS, donc illisible pour lui. Avant : n'importe quel site pouvait appeler l'API avec le cookie de l'étudiant. | `api/lib/security-headers.ts`, `__server.ts` |
| En-têtes | `X-Content-Type-Options`, `X-Frame-Options`, HSTS (déjà là) + **Content-Security-Policy**. | `__server.ts` |
| Secrets | Aucun dans le bundle du navigateur : contrôlé à chaque build par la CI. | `scripts/check-bundle-secrets.ts` |
| Garde-fou | Un test échoue si une route d'import ou de génération vidéo n'a pas de limite. | `tests/rate-limit-coverage.test.ts` |

### La Content-Security-Policy : en observation d'abord

Une CSP fausse d'une seule adresse éteint la publicité, le professeur virtuel ou Python pour tout le monde. Elle est donc livrée en deux étages :

- **le socle, toujours appliqué** : pas de plugin, pas de `<base>` étranger, pas d'affichage dans le cadre d'un autre site ;
- **la politique complète, en observation** (`Content-Security-Policy-Report-Only`) : le navigateur signale ce qu'elle bloquerait, sans rien bloquer. Chaque signalement est une ligne `[csp] directive ← adresse` dans les journaux Railway.

**Pour la rendre bloquante** : après quelques jours d'usage réel (publicité, Python, tableau blanc, professeur virtuel), s'il n'y a plus de ligne `[csp]`, ajoute `CSP_ENFORCE=true` sur le service web. S'il y en a, donne-moi la ligne : j'ajoute l'adresse légitime à la politique. Pour revenir en arrière, supprime la variable.

Vérifié en local le 14 nov. 2026 sur l'accueil, la connexion, les tarifs, le tableau de bord, le chat, les Karteikarten et les réglages : aucun blocage. Non vérifiables en local (pas de clés) : AdSense, PostHog, Sentry, HeyGen. C'est la raison de l'étage d'observation.

**Contrôler les secrets à la main** : `bun run build:web` puis `bun packages/web/scripts/check-bundle-secrets.ts`.

## Suivi des campagnes : quelle vidéo amène quelle inscription (14 nov. 2026)

**Le principe.** Chaque lien de campagne porte des paramètres UTM. Quand un visiteur arrive par ce lien puis s'inscrit, TRED range ces paramètres sur son compte (colonnes `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_at` de la table `user`). `utm_content` désigne la vidéo.

**À lancer une fois** (sinon rien n'est enregistré, et rien ne casse) :

```
node C:\dev\tred-rdm\aerostudy-ai\migre-utm.mjs
```

### Les liens à utiliser

| Où | Lien |
|---|---|
| Profil TikTok | `https://www.tred-tutor.de/?utm_source=tiktok&utm_medium=social&utm_campaign=survive-klausur&utm_content=bio` |
| Snapchat, vidéo 1 | `https://www.tred-tutor.de/?utm_source=snapchat&utm_medium=social&utm_campaign=survive-klausur&utm_content=sk1` |
| Snapchat, vidéo 2 | `…&utm_content=sk2` |
| Snapchat, vidéo 3 | `…&utm_content=sk3` |
| Publicité TikTok (une URL par annonce) | `…?utm_source=tiktok&utm_medium=paid&utm_campaign=survive-klausur&utm_content=sk1` |

**Limite à connaître.** Sur TikTok, « Link im Profil » est UN seul lien pour toutes les vidéos : en organique, tu sauras que l'inscription vient de TikTok, pas de quelle vidéo. Pour distinguer les vidéos il faut un lien par vidéo : c'est possible sur Snapchat (lien joint à chaque Snap) et en publicité TikTok (une URL par annonce). Autre moyen sans budget : changer `utm_content` du lien du profil à chaque vidéo publiée (`bio-sk1`, puis `bio-sk2`) et noter la date.

### Où lire le résultat

- `/admin/analytics` → carte « Anmeldungen nach Video » (90 jours).
- Ou en SQL sur Turso : `SELECT utm_source, utm_content, count(*) FROM user WHERE utm_at IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC;`

### Ce qui est gardé, et où (RGPD)

- **Premier contact** : le premier lien de la visite compte, et un compte déjà attribué ne change plus.
- **Rien sur l'appareil sans consentement** (§ 25 TDDDG) : sans accord pour l'analyse, les UTM restent dans la mémoire de la page (ils survivent à la navigation dans l'app, pas à un rechargement). Avec accord, ils sont aussi dans `sessionStorage`, jusqu'à la fermeture de l'onglet. Aucun cookie.
- Les valeurs viennent de l'URL : elles sont nettoyées (lettres, chiffres, `. _ ~ -`, 80 caractères).
- L'export RGPD du compte les contient (`herkunft`) ; la suppression du compte les efface.
- **À faire de ton côté** : ajouter une phrase à la Datenschutzerklärung (« Herkunft der Registrierung: Kampagnenparameter des Links, über den du gekommen bist », base légale à valider : intérêt légitime, art. 6 (1) f DSGVO). Je ne l'ai pas modifiée : c'est un texte juridique, il attend ta validation.

## Avant un pic : test de charge et répliques du worker (14 nov. 2026)

### Passer à 2 ou 3 répliques du worker (rentrée, veille de Klausuren)

Le service web ne fait que déposer des travaux : c'est le **worker** qui limite le débit. Une réplique traite 2 imports et 3 vidéos à la fois. Pour absorber un pic, on en ajoute, sans toucher au code ni au service web :

1. Railway → projet TRED → service **worker** → **Settings** → **Scaling** (« Replicas »).
2. Passe de `1` à `2` ou `3`, puis valide. Railway démarre les nouvelles répliques en une à deux minutes ; chacune se sert dans la même file, sans réglage.
3. Vérifie : les journaux du worker montrent plusieurs lignes `[worker] prêt — files : import-pdf ×1, generate-video ×3` (une par réplique).
4. **Après le pic, reviens à `1`** : chaque réplique est facturée tant qu'elle tourne (mémoire et processeur à l'usage, tarif sur https://railway.com/pricing).

Repères (mesurés avec 2 imports en parallèle par réplique ; le réglage par défaut est maintenant 1, donc compte environ le double) : avec 1 réplique, 100 imports de PDF texte déposés au même instant sont traités en moins d'une minute ; un scan (OCR) prend jusqu'à plusieurs minutes à lui seul. Si la rentrée amène beaucoup de scans, 3 répliques.

**Quand en ajouter ?** Ouvre `https://www.tred-tutor.de/api/admin/queues` (connecté avec ton compte administrateur). `waiting` est le nombre de travaux qui attendent un worker. S'il reste au-dessus de 20 pendant plusieurs minutes, ajoute une réplique.

**Ne pas confondre** avec les réglages `WORKER_IMPORT_CONCURRENCY` / `WORKER_VIDEO_CONCURRENCY` : ils augmentent le travail d'UNE réplique (plus de mémoire par conteneur). Ajouter des répliques est plus sûr.

**Le service web**, lui, peut rester à 1 réplique : il ne garde plus de fichier en mémoire pendant l'extraction. Les limites de débit sont en base (Turso), donc justes même avec plusieurs répliques web.

### Le test de charge

`packages/web/loadtest/import-and-video.k6.js` lance **100 imports au même instant**, puis **50 générations vidéo au même instant**, pendant qu'une sonde interroge l'API dix fois par seconde. Il échoue si 95 % des réponses ne sont pas sous **500 ms** (dépôt d'un import ou d'une vidéo, suivi d'un travail, API).

**Jamais contre la production** : cinquante vidéos = cinquante appels payants à Claude et à ElevenLabs, et dix comptes de test dans ta vraie base. On le lance sur un serveur local ou de recette :

1. Installer k6 (gratuit, https://grafana.com/docs/k6/latest/set-up/install-k6/) : `winget install k6`.
2. Démarrer le serveur de test avec `REDIS_URL`, `S3_*` et une base de test, plus le worker. Pour ne mesurer que la file, donner au worker des clés **factices** (`ANTHROPIC_API_KEY=sk-ant-test`, `ELEVENLABS_API_KEY=test`) : les vidéos échouent alors sans rien coûter, la route répond comme en vrai.
3. `k6 run -e BASE=http://localhost:3000 packages/web/loadtest/import-and-video.k6.js`
4. Dans un second terminal, la taille de la file : `bun packages/web/loadtest/queue-watch.ts` (mêmes variables d'environnement que le worker).

Le test garde les limites de la production (10 imports par heure, 5 vidéos par jour et par compte) : il utilise dix comptes, et un `429` inattendu le fait échouer.

### Ce qui a été mesuré (14 nov. 2026)

**En local** (k6 2.3.0, serveur + 1 worker sur le portable, base de test SQLite, Redis local, faux stockage) :

| Mesure | Résultat |
|---|---|
| Imports acceptés / traités | 100 / 100, aucun échec |
| Dépôt → document prêt (100 imports lancés ensemble, 1 worker) | 1,9 s au pire |
| Vidéos acceptées | 50 / 50 |
| API pendant la charge (`/api/health`, 10 req/s) | 95 % sous 1,2 ms |
| Suivi d'un travail (`GET /api/jobs/:id`) | 95 % sous 114 ms |
| Dépôt d'UN import, seul | 11 à 15 ms |
| Dépôt, 100 lancés au même instant | 95 % sous 624 ms : **au-dessus des 500 ms** |
| File Redis au plus haut | 71 imports en attente, vidée en moins de 2 s ; 31 vidéos en attente (clés factices : chaque vidéo échoue et est reprise 2 fois) |

Le dernier chiffre de latence tient à la base de test : un fichier SQLite écrit de façon bloquante, deux écritures par dépôt (les compteurs de débit). Cent dépôts simultanés s'y mettent en file. Turso, en production, ne bloque pas ainsi.

**En production** (mesures Railway des 3 derniers jours, AVANT la file) : `get-session` répond en 260 ms au milieu (415 ms au 95e centile), et `POST /api/documents/upload` en **30 secondes**. Un aller-retour vers Turso (Irlande) depuis Railway (Pays-Bas) coûte donc une cinquantaine de millisecondes. Avec la file, le dépôt enchaîne cinq à six allers-retours en base (neuf à dix avant l'optimisation du 14 nov.), le dernier en même temps que l'envoi à R2 : **attendu entre 0,3 et 0,5 s**, contre 30 s aujourd'hui. Ce n'est pas mesuré : à lire dans Railway (Observability → HTTP, chemin `/api/documents/upload`) une fois la file en service.

**Pour descendre sous 200 ms**, il faudrait ne plus lire la session en base à chaque requête (cache de session signé de Better Auth, `session.cookieCache`) ou rapprocher la base (réplique embarquée Turso). Les deux changent le comportement de l'authentification ou l'hébergement : à décider ensemble, je ne les ai pas faits.

## Campagne TikTok / Snapchat « Survive Your Klausur » — 3 pilotes verticaux (14 nov. 2026)

Trois vidéos 1080 × 1920 (9:16), en allemand, livrées dans `C:\Users\HP\Downloads\TRED-TikTok-Campaign\` :

| Fichier | Durée | Fil |
|---|---|---|
| `SK-1-Die-Klausur-morgen.mp4` | 20 s | panique → 80 pages qui défilent → freeze + trait orange → la question dans TRED → la Tafel pas à pas → soulagement, « Link im Profil » |
| `SK-2-Physik-verstehen.mp4` | 20 s | un VRAI turboréacteur d'avion de ligne (soufflante qui tourne au sol) → schéma animé du compresseur (pression, température) → freeze + trait orange → la Tafel : 288 K → 761 K, 475 kJ/kg |
| `SK-3-Founder-Story.mp4` | 25 s | ce que tu étudies (le vrai moteur — ou ton clip face caméra, s'il est déposé) → bureau, code → freeze + trait orange → Prof. Kenta en hologramme, qui va se poser sur son portrait dans l'app → démo (Tafel, « Als Video erklären », lecteur) → « Ich baue TRED. » (ou ton clip de fin) |

**L'univers de la campagne** : bleu nuit `#0A0E27`, orange `#FF5722`, jaune doré `#FFC107`. Il ne concerne que ces vidéos : l'app garde ses couleurs. **La signature** : au moment où l'on passe de « je ne comprends pas » à « TRED m'explique », l'image se fige, un trait orange la traverse, elle se fend en deux et l'écran de TRED apparaît dessous (avec un son). **Les sous-titres** : deux ou trois mots à la fois, très gros, le mot prononcé sur un aplat orange.

**Le visage de la campagne : Prof. Kenta**, « Das junge Genie » — le plus jeune des quatre professeurs de l'app, et celui que tout nouvel inscrit a par défaut. Toutes les captures le montrent sur la Tafel et dans le lecteur vidéo ; dans SK-3, au moment où la voix dit « Sie heißt TRED. », il apparaît en hologramme (mêmes couleurs que dans le Hörsaal), puis vient se poser exactement sur son portrait dans l'interface. Dans l'app, l'écran d'attente de l'import l'affiche à son tour, avec la bulle « Ich lese dein Skript … einen Moment bitte. » (traduite en anglais, français, espagnol) : l'étudiant retrouve dans TRED celui qu'il a vu sur TikTok. Il y est toujours affiché, quel que soit le professeur choisi pour le Hörsaal (`WAIT_PROFESSOR` dans `packages/web/src/web/components/import-wait-overlay.tsx`).

**Tout ce qu'on voit de TRED est la vraie interface**, capturée en mode sombre dans une fenêtre verticale (1000 × 1778) : la réponse entière de la Tafel tient alors sur un écran 9:16. Les nombres du tableau sont calculés par le script de capture (compresseur idéal, rapport de pression 30, κ = 1,4), pas tapés à la main.

### Où est quoi (`packages/video`)

- `src/tiktok/` : `kit.tsx` (palette, plans, étiquettes), `captions.tsx` (sous-titres), `slash.tsx` (la signature, une transition `@remotion/transitions`), `scenes.tsx` (caméra sur les captures, PDF qui défile, compresseur, éditeur de code, cartes de fin), `engine.tsx`, `videos.tsx` (les trois vidéos, calées sur la voix).
- `src/voiceovers.mjs` → `TIKTOK` : tes textes, mot pour mot, et la voix de chacun.
- `src/assets/tiktok/` : le vrai plan du moteur (Pexels), les 3 plans Replicate (étudiant, bureau), les captures de l'app, et `CREDITS.md` (d'où vient chaque image, avec quels droits).
- `public/facecam/` : tes clips face caméra pour SK-3 (voir plus bas).

### Refaire un rendu (depuis WSL, dans `packages/video`)

```
TIKTOK_DELIVER="/mnt/c/Users/HP/Downloads/TRED-TikTok-Campaign" npm run render:tiktok
```

Environ 5 à 7 minutes par vidéo. Le script rend en `crf 18`, preset `veryslow`, puis écrit dans le dossier une copie prête à publier (son à −15 LUFS, en-tête en début de fichier pour une lecture immédiate). Sans `ffmpeg` dans le PATH de WSL : `FFMPEG=/chemin/vers/ffmpeg.exe`.

| Pour changer… | Commande |
|---|---|
| un texte ou une voix | modifier `TIKTOK` dans `src/voiceovers.mjs`, puis `node scripts/voiceover.mjs t-de1 --force` (facturé par ElevenLabs au caractère ; les 3 voix actuelles = 983 caractères) |
| un plan d'ambiance généré (étudiant, bureau) | modifier le texte dans `scripts/tiktok-broll.mjs`, puis `node scripts/tiktok-broll.mjs desk --force` (facturé par Replicate, 6 s par plan). Le moteur, lui, est un vrai clip : voir `src/assets/tiktok/CREDITS.md` |
| les sons (alarme, trait, son d'interface) | `npm run audio:tiktok` (synthétisés par code, libres de droits) ; les nappes sortent en WAV, à convertir en MP3 avec ffmpeg |
| une capture de l'app | serveur local + `scripts/cinematic-captures.mjs sk2 de1 --dark` avec `CINE_VIEWPORT=1000x1778 CINE_SCALE=2.5 CINE_PROFESSOR=genius` (Prof. Kenta partout) |

### Tes clips face caméra (vidéo 3)

Dépose tes fichiers dans `packages/video/public/facecam/` avec ces noms, puis relance le rendu : ils prennent leur place tout seuls, sans toucher au code.

| Fichier | Où il passe | Durée |
|---|---|---|
| `intro.mp4` | au début, à la place du plan du moteur — la voix dit « Ich studiere Luft- und Raumfahrttechnik in Deutschland. » | 5 s (2 s au minimum) |
| `outro.mp4` | à la fin, à la place de la carte « Ich baue TRED. » — la voix dit « Wenn du studierst, probier TRED aus … » | 4 s (2 s au minimum) |

- `.mov` (iPhone) et `.webm` marchent aussi, majuscules comprises. Un seul des deux clips suffit.
- Filme à la verticale, les yeux vers 40 % de la hauteur ; laisse libre le tiers du bas (sous-titres) et, pour `outro`, le quart du haut (logo et « Link im Profil »).
- **Le son de tes clips n'est pas utilisé** : la voix off continue par-dessus. Évite donc de parler à l'image. La voix de cette vidéo est une voix ElevenLabs neutre, en attendant : l'idéal reste d'enregistrer la tienne — dis-le, c'est un réglage à part.
- Un clip plus court que sa place ne fige pas l'image : le script de rendu mesure sa durée, et la scène suivante commence plus tôt (début) ou la démonstration dure un peu plus (fin).
- Les clips restent sur ta machine : le dossier a son `.gitignore`, rien ne part sur GitHub.
- Le mode d'emploi complet est dans le dossier : `packages/video/public/facecam/README.md`.

### Avant de publier

- **Étiquette « contenu généré par IA »** : les plans de l'étudiant (SK-1) et du bureau (SK-3) sont générés (Replicate), les trois voix aussi (ElevenLabs). TikTok demande de l'indiquer quand une vidéo montre des scènes réalistes générées : active l'option au moment de publier. Le turboréacteur, lui, est un vrai moteur filmé.
- **Le plan du moteur vient de Pexels** (licence gratuite, publicité comprise, sans mention obligatoire). Il est recadré pour que ni la livrée de la compagnie, ni l'immatriculation, ni la personne visible dans le fichier d'origine n'apparaissent : la licence interdit de laisser croire qu'une marque soutient TRED. Détails dans `packages/video/src/assets/tiktok/CREDITS.md`.
- **Lien** : voir « Suivi des campagnes » plus haut (un seul lien de profil sur TikTok).
- Zones sûres : les textes évitent le haut (barre TikTok), la droite (boutons) et le dernier quart (légende).

## Résumé du matin : l'e-mail de 8 h (15 nov. 2026)

**Ce que tu reçois.** Chaque jour à 8 h (heure de Berlin), le serveur envoie aux adresses de `ADMIN_EMAILS` :

> 12 visiteurs, 3 inscriptions, 5 imports, 2 vidéos générées

sur les dernières 24 h, puis une ligne par lien de campagne — donc par vidéo — avec visiteurs et inscriptions, sur 24 h et sur 7 jours. C'est là que tu vois si la vidéo 1 amène plus de trafic que la 2 ou la 3.

**D'où viennent les chiffres.**

- Inscriptions, imports, vidéos générées : la base de TRED. Exacts, pour tous les comptes. « Vidéos générées » = les « Als Video erklären » terminées ; celles en échec sont signalées à part.
- Visiteurs : PostHog, donc **seulement les personnes qui ont accepté la mesure d'audience**. C'est un minimum, pas un total — l'e-mail le rappelle. Pour comparer deux vidéos entre elles, le chiffre reste valable.

**Pour comparer les vidéos, il faut un lien par vidéo** (`utm_content=sk1`, `sk2`, `sk3`) : voir « Suivi des campagnes » plus haut. Avec le seul lien du profil TikTok, tout arrive sur la ligne `bio`.

**Réglages** (rien à faire, tout est déjà en place sur Railway) : `ADMIN_EMAILS` (destinataires), `RESEND_API_KEY` + `MAIL_FROM` (envoi), `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` (visiteurs ; sans elles l'e-mail part quand même, avec « visiteurs non disponibles »). Pour couper l'e-mail : `DISABLE_MORNING_DIGEST=true`.

**Comment ça marche.** Même construction que la relance du soir : une boucle dans le serveur, vérifiée toutes les cinq minutes (l'e-mail part donc entre 8 h 00 et 8 h 05), et un verrou en base (`job_run`, clé `morning_digest`) pour un seul envoi par jour. Si le serveur redémarre à 8 h, l'envoi est rattrapé jusqu'à midi. Dans les journaux Railway : `[resume] … — 1/1 e-mail(s) partis`. Code : `packages/web/src/api/lib/morning-digest.ts` (calcul et texte) et `morning-digest-job.ts` (boucle, envoi).

**À la demande**, depuis ta machine (Railway CLI) :

```
railway run bun packages/web/scripts/resume-lancement.ts            # l'affiche
railway run bun packages/web/scripts/resume-lancement.ts --envoyer  # l'envoie aussi
```

## Lecteur PDF et R2 : ce qui est testé, et comment le vérifier en production (15 nov. 2026)

**Ce qui est testé automatiquement** (`tests/document-stream-r2.test.ts`, à chaque push). Le test lance un faux R2 local qui répond comme le vrai (requêtes signées obligatoires, plages d'octets, erreurs en XML) et fait passer dessus le vrai code : la requête de propriété, la route, le lecteur de stockage et le client S3 construit comme en production. Il garantit que :

- seule la propriétaire fait partir une requête vers R2 ;
- une autre étudiante connectée reçoit **404**, la même réponse que pour un identifiant inventé, et R2 ne voit passer **aucune** requête ;
- la clé lue dans R2 vient de la base, jamais de l'adresse appelée ;
- un original disparu donne 404, un R2 en panne ou des identifiants refusés donnent 502, sans rien révéler.

**Ce que ce test ne prouve pas** : que TON bucket, TES clés et TON endpoint répondent. Ça, seul un essai réel le dit. Deux minutes :

1. Connecte-toi sur www.tred-tutor.de, ouvre le Hörsaal, « Meine Kurse », et clique l'œil d'un PDF importé récemment (ou un badge de citation dans une réponse).
2. Le PDF s'affiche page par page : R2 répond. C'est tout.
3. S'il ne s'affiche pas : dans les journaux Railway du service TRED, cherche `[stream]`. `stockage indisponible` suivi d'un nom (`InvalidAccessKeyId`, `SignatureDoesNotMatch`, `NoSuchBucket`…) désigne la variable `S3_*` en cause. Aucune ligne `[stream]` et pas de PDF : le document a été importé avant que les originaux soient gardés (il n'a que son texte) — réimporte-le.

Déjà vérifié sans compte : sans session, la route répond 401.

## Lisibilité : textes mesurés contre le fond réel (15 nov. 2026)

Le panneau « Meine Kurse » du Hörsaal était posé à même la photo sombre avec l'encre du thème clair. Il est maintenant en verre bleu nuit, texte blanc et gris clair, dans les deux thèmes.

Pour « toutes les zones où le texte pourrait être illisible », chaque texte visible des pages principales a été mesuré contre les pixels réellement affichés derrière lui (photo, voile, verre compris), en thème clair et sombre. Corrigé :

- **Thème sombre, tableau blanc** : le gras était jaune sur blanc, les en-têtes de tableau encre sur bleu nuit, « Vorlesen » et « Melden » gris clair sur blanc. Le tableau blanc garde désormais les couleurs du thème clair.
- **Pied de page** (Impressum, Datenschutz, AGB, Widerruf) : gris sur la photo, à peine lisible dans la salle sombre. Blanc dans la salle sombre, encre du thème ailleurs.
- **Sous-titres et notes posés sur la photo** (Einstellungen, Übungen, Wörterbuch, Credits, Preise) : même traitement.
- **Badges « In Bearbeitung » / « Gemeistert »** et chiffres jaunes de la page Credits en thème clair : jaune ou vert pâle sur fond clair, remplacés par un ambre et un vert foncés.
- **Tableau** : gris des libellés un cran plus foncé ; texte d'invite de la zone de saisie ; sous-titre du professeur.
- **Recommandations du Dashboard** : fond plus opaque derrière le texte blanc.
- Champ de recherche du Wörterbuch, prix barré de la page Preise, ligne choisie des Einstellungen en thème sombre.

Restent volontairement pâles : les boutons désactivés.

**Complément du 15 nov. (après-midi) — ce que cette mesure ne voyait pas.** Elle avait trois angles morts : elle ne tournait qu'avec le tableau blanc, elle ne faisait pas défiler le tableau (tout ce qui est sous sa première hauteur échappait), et elle ne voit pas les graphiques, dessinés sur un canevas et non écrits en texte. Remesuré sur les trois tableaux, dans les deux thèmes, avec une réponse complète :

- **Graphiques.** En thème sombre, titre, légende et graduations étaient à 1,3–1,4:1 sur les trois tableaux — invisibles. En plein écran, la première courbe était noire sur bleu nuit. Sur les tableaux vert et sombre, le jaune TRED ressortait brun. Le graphique se dessine maintenant pour la surface où il est posé : tous ses textes sont au-dessus de 5,8:1, chaque courbe au-dessus de 3:1, et le jaune reste le jaune TRED. L'image téléchargée reçoit un fond plein. Sur tableau blanc en thème clair, rien ne change.
- **Termes du dictionnaire** (mots au soulignement pointillé) sur les tableaux vert et sombre : ils prenaient la couleur du thème de l'app — encre noire en thème clair, soit 2,2:1 sur le vert et 1,2:1 sur le sombre. Ils suivent maintenant la craie du tableau.
- **Rangée du haut du tableau vert** : le compteur de pages (« 2 / 2 ») était à 4,1:1 ; éclairci.

Non traité : les anciens schémas « mermaid » (le tuteur n'en produit plus depuis le 5 nov.).


## Sprint « tuteur intelligent » — chantier 1 : le modèle de l'apprenant (15 nov. 2026)

**Ce que TRED faisait déjà.** Le tuteur retient les *lacunes* d'un étudiant (une idée fausse, en une phrase : « verwechselt Spannung und Dehnung ») et les lui rappelle au bon moment — c'est la table `misconception`, avec sa répétition espacée.

**Ce qui est nouveau.** Une mesure : pour chaque concept que l'étudiant travaille (« Wärmekapazität », « Momentengleichgewicht »), un score de maîtrise de 0 à 1 et le compte de ses erreurs par type (signe, unité, formule confondue, erreur de calcul, notions confondues, mauvaise approche).

- **Mise à jour automatique** : quand l'étudiant répond, calcule ou explique lui-même, le tuteur le signale par un outil interne (`lernstand_melden`). Aucun appel de modèle en plus, donc aucun coût en plus. Une bonne réponse monte le score, une mauvaise le descend ; la dernière réponse pèse 30 %, pour qu'une étourderie n'efface pas dix réussites.
- **Avant chaque réponse** : les trois concepts les plus fragiles de l'étudiant sont remis au tuteur (NIVEAU 2b), avec ses erreurs typiques. Consigne : sur ces concepts, expliquer plus lentement, ajouter une analogie, vérifier le prérequis, et faire découvrir l'erreur typique avant qu'elle ne revienne. Le tuteur ne reçoit aucun chiffre et a interdiction de citer la liste : l'étudiant n'entend jamais « tu es à 28 % ».
- **Données personnelles** : la table est exportée et effacée avec le compte, comme les lacunes.

**À lancer une fois** (sinon rien n'est enregistré, et rien ne casse) :

```
node C:\dev\tred-rdm\aerostudy-ai\migre-concept-mastery.mjs
```

**Limite à connaître.** C'est le modèle qui juge si une réponse était juste, comme pour les lacunes. Je n'ai pas pu l'essayer sur le vrai modèle (chaque essai coûte) : le calcul du score, l'enregistrement et le texte remis au tuteur sont testés ; la régularité avec laquelle il appelle l'outil se verra à l'usage, dans la table.

Code : `packages/web/src/api/lib/concept-mastery.ts`, outil dans `src/api/agent/index.ts`. Les barres « par matière » du Dashboard arrivent au chantier 4.

## Cinq professeurs de plus au vestiaire (15 nov. 2026)

Le vestiaire passe de quatre à neuf professeurs. Les cinq nouveaux sont des **archétypes à nous** — un rôle, un ton, une méthode — pas des personnages repris d'une œuvre :

| Professeur | Archétype | Ton et méthode | Voix par défaut |
|---|---|---|---|
| Prof. Daichi | Der Stratege | visionnaire, structuré : état des lieux, plan par étapes, budget de temps, prochaine action | `ELEVENLABS_VOICE_DAICHI` |
| Prof. Kazu | Der Spaßvogel | ludique, rapide, analogies drôles — puis la version propre (formule, unité, résultat) | `ELEVENLABS_VOICE_KAZU` |
| Sensei Sora | Der Beobachter | socratique : une question ciblée, attendre, reformuler ; droit, philosophie | `ELEVENLABS_VOICE_SORA` |
| Dr. Mio | Die Ärztin | rigoureuse et rassurante ; médecine, biologie, anatomie | `ELEVENLABS_VOICE_MIO` |
| Prof. Shun | Der Analytiker | froid, logique, direct : données, inconnue, méthode, calcul, contrôle | `ELEVENLABS_VOICE_SHUN` |

- **Où** : page « Mein virtueller Professor » (`/professors`) et bouton de changement dans le Hörsaal — le sélecteur existait, il affiche maintenant les neuf. Le choix s'applique dès la question suivante : le serveur relit le professeur à chaque requête.
- **Avatars** : générés comme les quatre premiers (Flux Schnell sur Replicate, `scripts/generate-avatars.mjs`, environ 0,003 $ pièce, cinq images). Les prompts décrivent un rôle, un âge et une tenue de tous les jours. J'ai volontairement écarté tout signe distinctif d'un personnage connu (uniforme, cape, créature, marque au front, couettes, uniforme scolaire) et regardé chaque image avant de la garder. Le « farceur » est donc un humain excentrique, pas une créature jaune : cette silhouette-là aurait été reconnaissable.
- **Garde-fous écrits dans les rôles** : l'humour ne vise jamais la personne ; l'observateur donne la solution si on la lui demande expressément ; la médecin explique le cours mais ne pose aucun diagnostic et ne donne aucun avis médical personnel ; le stratège parle en images de planification, jamais guerrières.
- **Voix** : chacun a une voix par défaut d'ElevenLabs, modifiable par sa variable. Rien à configurer.
- **Crédits** : `packages/web/public/avatars/CREDITS.md`. Un test refuse tout nom de personnage ou d'œuvre connue dans le vestiaire et dans ce fichier.
- Les films promotionnels gardent les quatre professeurs du lancement (`LAUNCH_PROFESSOR_IDS`) : leurs plans sont composés pour quatre.

## Sprint « tuteur intelligent » — chantier 2 : le mode socratique (15 nov. 2026)

**Où.** Dans le Hörsaal, à gauche de la zone de saisie : un bouton en forme de bulle avec un point d'interrogation, à côté du mode calcul. Le choix est retenu sur l'appareil.

**Ce qui change quand il est allumé.**

- Le tuteur ne donne plus le résultat ni le corrigé — même si l'étudiant le demande.
- Chaque réponse se termine par une seule question, puis il attend.
- À chaque essai manqué, un indice plus fort : niveau 1 (où regarder), niveau 2 (l'approche ou la formule, sans les nombres), niveau 3 (l'étape suivante presque faite).
- Au-dessus de la saisie : « Versuche: 1/3 », et le bouton **« Ich gebe auf »**. S'il clique, le tuteur donne la solution complète et ajoute une note : l'endroit précis où ça a bloqué, et « lies dieses Kapitel morgen noch einmal ». Sans reproche.
- S'il trouve seul : « Selbst gelöst ».

**Qui compte les essais.** Le tuteur : lui seul sait si un message est un essai ou une nouvelle question. Il écrit le compteur en dernière ligne de sa réponse (`[[SOKRATES versuch=1 von=3]]`) ; l'interface le lit et ne le montre jamais.

**Ce que j'ai vérifié, et ce que je n'ai pas pu.** Dans le navigateur, avec des réponses simulées au format demandé au modèle : le compteur passe de 0/3 à 1/3, le marqueur n'apparaît jamais à l'écran, l'abandon n'est envoyé au serveur que pour le clic (la question suivante repart en mode normal). Sur le vrai modèle, rien : chaque essai coûte. Le respect de l'interdiction et la qualité des trois niveaux d'indice sont donc à juger sur une vraie conversation.

**Avec le Prüfungsmodus** : le mode socratique n'y est jamais appliqué. Les douze langues ont leurs textes.

Code : `packages/web/src/api/lib/socratic.ts` (consigne), `src/web/lib/socratic.ts` (lecture du compteur), bouton et barre dans `src/web/pages/chat.tsx`.

## Sprint « tuteur intelligent » — chantier 3 : l'ancrage réel (15 nov. 2026)

**Ce que TRED faisait déjà.** La filière de l'étudiant (Studiengang, saisi à l'inscription ou dans les réglages) partait déjà au tuteur, avec une consigne molle : « choisis exemples et vocabulaire selon cette filière ».

**Ce qui est nouveau.**

- **Une règle, plus une suggestion** : pour chaque concept *abstrait*, UN exemple concret de la filière — une vraie pièce, un système, un cas réaliste — et l'image avant la formule. Les deux exemples de ton brief y figurent comme repères (le compresseur d'un turboréacteur pour la thermo en aéronautique, le vol à l'étalage pour le droit).
- **Garde-fou** : aucun chiffre inventé pour faire « réel ». Le tuteur ne cite un nombre que s'il vient des documents de l'étudiant ou d'un outil de calcul. J'ai écrit « turboréacteur » et non une référence de moteur précise dans la règle : nommer un modèle pousse le tuteur à en réciter les caractéristiques de mémoire.
- **Mission pratique** : quand un thème est bouclé (exercice résolu, chapitre résumé), le tuteur ajoute une petite tâche à faire avec ses *propres* chiffres — quelque chose à mesurer ou à choisir soi-même —, dit ce qu'il faut déterminer et comment reconnaître un résultat plausible, et ne la résout pas. Une seule par thème, jamais sur une question courte ni au milieu d'un calcul.
- **Bouton « Praxis-Mission »** sous chaque réponse, à côté de « Ingenieur-Denkweise », pour en demander une à tout moment.

Rien de tout cela en Prüfungsmodus. Sans filière renseignée, seule la mission pratique s'applique.

Non essayé sur le vrai modèle (coût) : le texte remis au tuteur et le branchement sont testés ; la pertinence des exemples se juge sur une vraie conversation.

Code : `packages/web/src/api/lib/real-world.ts`.

## Sprint « tuteur intelligent » — chantier 4 : la mémoire à long terme (15 nov. 2026)

**Ce que TRED faisait déjà — presque tout le brief.**

- **Créer des cartes depuis une explication** : le bouton « Karteikarten » existe sous chaque réponse du Hörsaal (et sur chaque document, et pour chaque lacune). Le tuteur écrit la question courte et la réponse. Rien à ajouter.
- **Répétition espacée** : les cartes sont déjà planifiées par un algorithme de type SM-2 (facilité de 1,3 à 3,0, intervalle qui s'allonge à chaque réussite, retour au lendemain après un oubli). La page Karteikarten et le bloc « Heute zu wiederholen » du Dashboard s'en servent.

**Ce qui est nouveau.**

- **Les cinq cartes du jour.** Parmi les cartes dues, le Dashboard en propose cinq, choisies d'après les concepts fragiles du chantier 1 : d'abord les cartes qui *nomment* un concept fragile (le plus fragile en premier), puis celles de la même matière, puis les plus en retard et les plus souvent ratées. S'il y en a davantage : « +2 weitere fällig ».
- **La section « Mein Fortschritt »** sur le Dashboard : à gauche la maîtrise par matière en barres (rouge sous 40 %, jaune sous 70 %, vert au-delà, avec le nombre de concepts), à droite les cartes du jour et le bouton de révision. Elle ne s'affiche que s'il y a quelque chose à montrer — comme les autres blocs.

**À savoir.**

- Les barres viennent de la table du chantier 1 : elles restent vides tant que `migre-concept-mastery.mjs` n'a pas tourné, puis se remplissent au fil des conversations. Les cartes du jour, elles, s'affichent tout de suite.
- Ici l'étudiant voit son pourcentage — c'est le tableau de bord, il vient le chercher. Le tuteur, lui, ne le prononce jamais.
- Aucune migration de plus pour ce chantier.

Code : `packages/web/src/api/lib/daily-review.ts` (choix des cartes), route `flashcards.progress`, `src/web/components/progress-section.tsx`.

## Sprint « tuteur intelligent » — chantier 5 : les détails (15 nov. 2026)

1. **Panneau « Meine Kurse »** : corrigé et en production depuis la nuit du 14 au 15 (voir « Lisibilité » plus haut), avec toutes les autres zones mesurées.
2. **Citation surlignée dans le PDF** : quand un badge de citation ouvre le lecteur, la phrase citée est maintenant surlignée en jaune sur la page, comme dans l'onglet « Extrahierter Text ». Le lecteur lit le texte de la page affichée, y retrouve la phrase (une césure en fin de ligne, la casse ou la ponctuation ne le gênent pas) et pose le jaune dessus ; le texte reste lisible dessous. Si la phrase n'y est pas mot pour mot — une formule que le tuteur a réécrite — son début et sa fin suffisent. Sur un PDF scanné sans texte, rien n'est surligné : la page s'ouvre comme avant.
3. **Flux PDF et R2** : test d'intégration contre un R2 simulé à chaque push (voir « Lecteur PDF et R2 » plus haut), et le scénario complet rejoué en local contre un stockage qui sert des plages d'octets : propriétaire 200 / 206, autre compte 404, sans session 401. Reste ton essai de deux minutes sur le vrai bucket — je ne peux pas le faire sans compte.
4. **File d'attente** : elle tourne. Depuis ton clic « Deploy », le site annonce `importQueue: true`, le worker écrit `[worker] prêt — files : import-pdf ×1, generate-video ×3` à chaque démarrage et se relaie proprement à chaque déploiement (`arrêt après les travaux en cours`). Un import par lot réel est passé par la file la nuit du 15.

Code du surlignage : `packages/web/src/web/lib/pdf-highlight.ts`, branché dans `components/pdf-viewer.tsx`.

## Sessions de chat par document (15 nov. 2026)

**Ce qui se passait vraiment — reproduit avant de corriger.**

- Cliquer un autre document vidait bien le tableau… sauf pendant qu'une réponse s'écrivait. Le flux n'était pas arrêté : la réponse du document A continuait de s'écrire sous le document B, puis était **enregistrée dans l'historique de B**. C'est le mélange que tu as vu.
- Revenir sur un document donnait un tableau vide : sa conversation existait dans l'historique, mais n'était pas reprise.
- L'adresse restait `/chat`, quel que soit le document.

**Ce qui change pour l'étudiant.**

- **Une session par document.** Cliquer un document dans « Meine Kurse » rouvre SA dernière conversation, et seulement la sienne. Aucune conversation pour ce document : le tableau affiche « Die Tafel ist bereit ». « Alle Materialien » a sa propre session, à part.
- **Le badge sur le tableau** : « Kurs: Elektrotechnik 1 – Skript » (ou « Alle Materialien »), sous le titre quand le tableau est vide, en haut à gauche ensuite. Il suit les trois couleurs de tableau.
- **L'adresse porte le document** : `/chat?doc=<identifiant>`. Recharger la page, enregistrer le lien ou utiliser le bouton « Retour » du navigateur ramène au bon document avec sa conversation. Un lien vers un document supprimé ou d'un autre compte retombe sur « Alle Materialien ».
- **« Neuer Chat »** vide le tableau et garde le document : c'est une nouvelle branche. L'ancienne reste dans l'historique.
- **Le tiroir « Verlauf »** montre d'abord les conversations du document ouvert ; « Alle Unterhaltungen » montre tout, avec le document de chacune.
- **Changer de document pendant une réponse** l'arrête. Elle n'est enregistrée nulle part : la question est à reposer.
- **Supprimer le document ouvert** ramène à « Alle Materialien ».

**Ce que TRED faisait déjà (écarts avec ton brief).**

- La table `chat_conversation` avait déjà `user_id` et `document_id` : **aucune migration**.
- Le contexte envoyé au tuteur était déjà limité au document choisi : extraits, inventaire et recherche ne lisent que lui, chaque extrait dans sa balise `<dokument titel="…">`. Je n'y ai pas touché.
- L'app parle à son serveur par oRPC : la route est `chats.forScope`, pas `GET /api/chats?documentId=…`. L'adresse de la page est `/chat?doc=…`, pas `/hoersaal`.
- Aucune conversation vide n'est créée au clic : elles rempliraient le tiroir d'historique. Le tableau vide n'est enregistré qu'au premier échange.

**À savoir.**

- La mémoire de l'étudiant (lacunes, concepts fragiles) le suit d'un document à l'autre : c'est son profil, pas le texte d'un cours.
- Une conversation enregistrée garde son document pour toujours, même si un appareil l'enregistre avec une autre portée. La ligne `[chats] … portée d'origine gardée` dans les journaux signale ce cas.
- **App mobile** : elle rouvrait une conversation sans son document, donc la suite partait avec tous les documents pour contexte. Corrigé dans le code (`packages/mobile/app/chat/[id].tsx`), mais sans essai sur un téléphone, et il faut un nouveau build pour que cela arrive aux étudiants. Par ailleurs `bun run typecheck` de l'app mobile signale 3 erreurs plus anciennes (authentification), à regarder avant ce build.
- Le comportement est vérifié dans le navigateur avec des réponses simulées (le vrai modèle coûte) : sessions, enregistrement et historique sont réels, seul le texte du tuteur est fabriqué.

Code : `packages/web/src/api/lib/chat-sessions.ts` (session d'une portée, règle d'enregistrement), route `chats.forScope`, `src/web/lib/chat-sessions.ts`, `src/web/pages/chat.tsx` (« La session »), badge dans `components/tafel-board.tsx`.

## Téléphone : le bouton d'envoi tient dans l'écran (15 nov. 2026)

Depuis l'ajout du bouton du mode socratique (nuit du 15), la ligne de saisie du Hörsaal dépassait de l'écran sur téléphone : le bouton d'envoi était à moitié caché à 390 px de large, hors de l'écran à 360 px.

Corrigé : la saisie rétrécit avec l'écran et le bouton d'envoi reste dans le rebord (mesuré à 390, 360 et 320 px). Le champ de texte est étroit sur un petit téléphone (110 px à 360 px), parce que la ligne porte maintenant trois boutons avant lui. **À toi de voir** : ranger « Rechenmodus » et le mode socratique dans le menu du trombone sur téléphone libérerait la place.

## Documents et conversations liés au module (15 nov. 2026)

Dans l'app, ton « module » s'appelle un **Fach** (« Matière » en français) : TZ, ELT… Il se choisit dans le sélecteur en haut du Hörsaal, à côté de « Kontext ».

**Ce qui se passait.** Le tuteur respectait déjà le module choisi : avec « TZ », il ne lisait que les documents de TZ. Mais le panneau « Meine Kurse » listait tous les documents du semestre, donc ceux d'ELT aussi ; l'import ne rangeait le document dans aucun module ; et changer de module laissait la conversation au tableau.

**Ce qui change.**

- **Le panneau suit le module.** Avec « TZ » en haut, il ne liste que les documents de TZ. Aucun : « Noch keine Unterlagen in diesem Fach. Lade eine hoch. », et une ligne dit combien de documents du semestre n'ont pas encore de module et où les trouver. « Ganzes Semester » liste tout le semestre.
- **Un document importé va dans le module choisi.** Fichier seul, lot ou glisser-déposer. Le serveur vérifie que le module est bien à ce compte.
- **Changer de module réinitialise le tableau.** Chaque module a sa session, comme chaque document : revenir sur ELT rouvre la conversation d'ELT, jamais celle de TZ. « Ganzes Semester » a la sienne.
- **Le badge du tableau** dit « Fach: TZ ».

**Écarts avec ton brief.**

- Aucune colonne à ajouter sur `document` : `semester_id` et `subject_id` existaient déjà. Le Dashboard permettait déjà de ranger des documents dans un module.
- La migration ajoute une colonne ailleurs : `chat_conversation.subject_id`, pour savoir sous quel module une conversation a été tenue.

**Migration : `migre-documents-contexte.mjs`.**

1. Schéma, à lancer une fois : `node C:\dev\tred-rdm\aerostudy-ai\migre-documents-contexte.mjs`. Tant qu'il n'a pas tourné, rien ne casse : un module ouvre un tableau vide au lieu de reprendre sa conversation.
2. Tes documents existants vers ELT : ajoute `--module=ELT --email=<ton adresse>` pour voir la liste, puis `--appliquer` pour l'écrire. Le script ne touche que le compte de cette adresse, que ses documents sans module, et que le semestre du module. `--sans-semestre` prend aussi les documents sans semestre. Pour défaire : le Dashboard.

**À savoir.** Les documents des autres étudiants importés avant aujourd'hui n'ont pas de module : ils les voient sous « Ganzes Semester » et peuvent les ranger depuis le Dashboard.

Code : `packages/web/src/api/lib/import-scope.ts`, `api/lib/chat-sessions.ts` (module d'une conversation), `src/web/components/document-library.tsx`, `src/web/pages/chat.tsx`.

**État au 15 nov. au soir.** Les deux migrations de schéma ont été lancées sur la base de production (`concept_mastery` créée, `chat_conversation.subject_id` ajoutée). L'étape 2 n'avait rien à écrire : tes 8 documents sont déjà rangés dans « ELT (SEMESTRE 1) ». À noter : ton compte garde 7 modules dont le semestre a été supprimé (ELK, ELT, Elektrotechnik, GWF, PHYSIK, TM2, TZ), vides et invisibles dans l'app ; ils ne gênent rien.

## Latence du Hörsaal : d'où venaient les 36 secondes (15 nov. 2026)

**Le constat, dans les journaux de production.** La question lente du 15 nov. à 07:58 a envoyé 292 547 tokens au modèle en un seul appel, premier signe de vie après 29 s, premier mot après 36 s. Ce n'était pas la recherche dans les documents :

| Ce que le modèle reçoit | Taille |
|---|---|
| Règles du tuteur (bloc fixe, mis en cache 1 h) | ≈ 88 000 caractères |
| Outils (23 : solveurs, recherche, schémas…) | ≈ 50 000 caractères |
| **Les deux ensemble, mesurés en production** | **≈ 54 000 tokens** |
| Extraits du cours choisis pour la question | 24 000 caractères au plus (16 extraits, ≈ 9 500 tokens) |
| **Un PDF joint à la question par le trombone** | **≈ 230 000 tokens ce jour-là** |

Un PDF joint au trombone partait entier au modèle, page par page, texte et image (jusqu'à 20 Mo). Et le navigateur le renvoyait ensuite avec chaque question suivante, pour que le serveur le jette à l'arrivée.

**Une question normale est déjà rapide** : premier mot en 1,2 à 3,5 s (cache chaud : 1,2 à 2 s). Les cas lents sont les pièces jointes, les calculs (le tuteur réfléchit avant d'écrire : 5 à 50 s) et les questions où il cherche dans le cours avant de répondre (2 à 5 s par recherche).

**Ce qui change.**

- **20 pages de PDF au plus par question**, tous fichiers confondus. Le navigateur compte les pages à l'ajout (le fichier ne quitte pas le téléphone pour être refusé), et le serveur recompte avant de décompter une question du quota. Au-delà : « „Skript.pdf“: 120 PDF-Seiten sind zu viel für eine Frage (höchstens 20). Importiere das Dokument unter „Meine Kurse“ … ». Le seuil est `MAX_ATTACHED_PDF_PAGES` dans `packages/web/src/api/lib/chat-attachments.ts` : dis-moi si tu veux un autre chiffre.
- **Une pièce jointe ne voyage qu'avec sa question.** Les questions suivantes ne la renvoient plus.
- **Dix secondes sans un mot** : le tableau écrit « Ich lese dein Skript, noch einen Moment … » (« Je lis ton cours, encore un instant … »). Avec un fichier joint : « Ich lese deinen Anhang … ». Sans aucun document : « Das dauert etwas länger … » — on ne dit pas « je lis ton cours » à quelqu'un qui n'en a pas.
- **Bouton d'envoi** : pendant la réponse il est désactivé et tourne.
- **Lectures en base en parallèle** avant l'appel du modèle (≈ un quart de seconde de moins par question).
- **Ligne `[perf]` des journaux** : trois champs de plus, `prep=` (temps avant l'appel du modèle : réception du fichier, lectures en base), `body=` (poids de la requête), `pdf_pages=`. `first_activity − prep` = le temps du modèle seul.

**Ce qui n'a pas changé, à ta demande.** La recherche dans les documents (16 extraits, 24 000 caractères). La réduire à 3 ou 4 extraits aurait économisé ≈ 7 000 tokens sur 65 000, sans effet mesurable sur le délai, et le tuteur aurait cherché plus souvent avant de répondre.

**Pistes non faites, à décider par toi.**

- *Garder le cache chaud.* Le bloc fixe est en cache une heure ; après une heure sans question, la suivante le réécrit (≈ +1 s). Un appel d'entretien toutes les 55 min coûterait ≈ 0,40 $ par jour.
- *Un cache par langue et par mode.* La règle de langue est en tête du bloc fixe : chaque langue (et chaque mode : examen, calcul) a son propre cache. La déplacer après le bloc partagerait le cache entre toutes les langues ; c'est une retouche du prompt, à tester sur le vrai modèle.
- *Alléger les 54 000 tokens de règles et d'outils.* C'est le levier de coût le plus fort, et un changement de comportement du tuteur.
- *Importer en un geste.* Quand un PDF est refusé au trombone, proposer un bouton « In Meine Kurse importieren ».

Essai de bout en bout : `C:\Users\HP\AppData\Local\Temp\tred-perf\latency-e2e.ts` (vrai navigateur, 32 vérifications). Code : `api/lib/chat-attachments.ts`, `api/lib/pdf-pages.ts`, `api/lib/chat-perf.ts`, `src/web/lib/pdf-pages.ts`, `src/web/lib/patience.ts`.

## Inscription : la limite « 3 requêtes / 10 s » valait pour tout le monde (15 nov. 2026)

**Le défaut.** Better Auth limite l'inscription et la connexion à 3 requêtes par 10 secondes et par visiteur. Depuis sa version 1.7.13 (montée le 9 nov.), il ne reconnaissait plus le visiteur derrière Railway et rangeait tous les visiteurs dans le même compteur. Trois inscriptions dans les mêmes dix secondes bloquaient la quatrième personne.

**Corrigé, avec ton accord** : il lit maintenant `x-real-ip`, l'en-tête que le réseau de Railway pose lui-même avec l'adresse du client. Chaque visiteur a son compteur ; la limite elle-même ne change pas.

**Un point de vie privée, réglé au passage.** Dès que Better Auth sait lire l'adresse du visiteur, il la range aussi dans chaque session (colonne `ip_address`, vide jusqu'ici en production). J'ai empêché cela : l'adresse sert au compteur, en mémoire, dix secondes ; elle n'est pas enregistrée. Rien à ajouter à la Datenschutzerklärung pour ce changement.

**À savoir.** Si un jour un autre service passe devant le site (Cloudflare, un CDN), `x-real-ip` deviendra l'adresse de ce service : il faudra revoir `packages/web/src/api/lib/client-ip.ts`.

**Vérifié au passage** (15 nov., une requête d'essai avec des en-têtes forgés, visible dans les journaux sous `verification-entetes`) : le réseau de Railway remplace un `X-Forwarded-For` écrit par le visiteur. La limite de débit propre à l'app (`api/middleware/rate-limit.ts`), qui lit la première adresse de cet en-tête, ne se contourne donc pas ainsi.

## Import : plus de cinq fichiers d'un coup (15 nov. 2026)

Le lot entier est refusé avant tout envoi, comme avant. Le message dit maintenant la limite, que rien n'est parti, et quoi faire : « Maximum 5 fichiers par lot. Rien n'a été importé : choisis-en 5 au plus, puis recommence pour les suivants. » (« Maximal 5 Dateien pro Stapel. … »), dans les douze langues.

## Test réel du lecteur PDF en production (15 nov. 2026, 18:30 UTC)

Fait à ta demande, avec le compte de test jetable (« Test Pipeline »), jamais le tien. Script : `C:\Users\HP\AppData\Local\Temp\tred-perf\prod-test\4-lecteur-r2.ts`.

- **Dépôt** d'un PDF de 14 pages (1 Mo, fabriqué pour le test) dans « Meine Kurse » : importé, 14 pages reconnues.
- **Une question au vrai tuteur** sur ce document (« Wie ist die Wärmekapazität in meinem Skript definiert? Bitte mit Quelle. ») : premier bloc au tableau après 4,8 s, réponse complète après 16,7 s. Côté serveur : premier mot à 3,5 s, cache froid, une recherche dans le document avant d'écrire ; 0,2 s de préparation avant l'appel du modèle.
- **Citation** « R2_Test_Thermo_Kapitel_3 S. 12 » : vérifiée contre le document. Un clic ouvre le PDF **à la page 12 sur 14**, la page est dessinée et le passage cité est surligné.
- **D'où viennent les octets** : uniquement de `www.tred-tutor.de/api/documents/<id>/stream`, par plages (HTTP 206, `application/pdf`), 476 Ko lus sur 988 Ko. Le navigateur n'a contacté aucune adresse publique du stockage.
- **Sans session** : la même adresse répond 401, sans un octet du PDF.
- **Nettoyage** : le document de test a été supprimé ; son adresse répond ensuite 404, même à son propriétaire.

Le compte de test contient donc toujours ce qu'il contenait avant (un document et une vidéo du 12 nov.). Il reste à supprimer avant l'ouverture publique.

**Limite d'inscription, vérifiée en production le même soir** : 5 connexions volontairement fausses à la suite, chacune avec un `X-Real-IP` forgé différent → 401, 401, 401, 429, 429. La limite vaut par visiteur réel, un en-tête forgé ne permet pas d'y échapper, et l'avertissement « could not determine a client IP » n'apparaît plus dans les journaux.

## Plateforme visuelle — chantier 1 : l'Explorateur 3D (15 nov. 2026)

Nouvelle page **« 3D-Explorer »** (`/explorer`, entrée dans la barre latérale). On tourne un modèle, on touche un point, le professeur explique.

- **Deux modèles** : un turboréacteur double flux à deux arbres, en coupe (soufflante, compresseur, chambre de combustion, turbine, tuyère, flux secondaire ; les deux arbres tournent, l'air s'écoule du bleu au rouge), et un engrenage droit en prise (z₁ = 16, z₂ = 40).
- **Points cliquables** : 6 sur le moteur, 4 sur l'engrenage. Chacun ouvre le titre, l'explication, un ordre de grandeur à retenir. On peut aussi toucher la pièce elle-même, ou la choisir dans la liste (clavier, lecteur d'écran).
- **Formule pas à pas** (GSAP) : sur la tuyère et sur la grande roue, la formule se construit étape par étape avec un effet de « pop ».
- **« Den Tutor fragen »** ouvre le Hörsaal avec la question déjà écrite dans le champ de saisie. Elle n'est pas envoyée d'office : c'est l'étudiant qui dépense une question.
- **Téléphone** : un doigt tourne, deux doigts zooment, la caméra recule d'elle-même pour que le modèle tienne dans l'écran.

**Écarts avec ton brief, et pourquoi.**

- *Three.js, React Three Fiber et drei étaient déjà installés* (le tuteur dessine déjà des maquettes 3D dans ses réponses). Rien à installer pour la 3D.
- *Pas de modèle Sketchfab.* Y télécharger un modèle demande un compte, et chaque modèle a sa licence. Les deux modèles sont construits dans le navigateur à partir de formes simples : rien à télécharger, aucune licence de tiers, quelques Ko.
- *Les explications ne sont pas générées au clic.* Elles sont écrites à l'avance (allemand, anglais, français, espagnol ; les autres langues lisent l'allemand) et s'affichent tout de suite : ni attente, ni coût par clic, ni phrase inventée sur une pièce de moteur. L'IA en direct reste à un bouton (« Den Tutor fragen »).
- *Spline et Rive : non.* Les deux passent par un compte chez l'éditeur et, pour Spline, par ses serveurs à chaque affichage.
- *GSAP 3.15.0* (et non 3.15.1, sorti il y a 12 jours : règle des 14 jours). Sa licence est gratuite pour un usage commercial, mais ce n'est pas une licence libre : Webflow peut la modifier. Elle ne sert qu'à l'animation des formules ; Framer Motion, déjà là, saurait la remplacer.
- *Phaser 4.2.1* (MIT) est installé pour le mini-jeu du chantier 2.

Code : `src/web/pages/explorer.tsx`, `src/web/components/Explorer3D.tsx` (chargé à la demande), `src/web/components/formula-steps.tsx`, `src/web/lib/explorer-models.ts` (modèles et textes). Essai : `tred-perf\explorer-shot.ts`.

## Plateforme visuelle — chantiers 2 à 5 : mini-jeu, cartes, transitions (15 nov. 2026)

- **Mini-jeu « Triebwerk-Check »** (`/minigame`, Phaser 4.2.1) : huit questions, on touche la bonne pièce sur la coupe du moteur. Points, bonus de rapidité, série (×1,5 à trois bonnes réponses de suite, ×2 à cinq), médaille à la fin. Le professeur hoche la tête ou la secoue. Jouable au clavier (touches 1–6, Entrée). Les questions sont celles de l'Explorateur : on apprend là-bas, on vérifie ici. Il se lance depuis le Dashboard (« Mini-Spiel ») et depuis l'Explorateur (« Wissen testen »).
- **Dashboard** : deux nouvelles tuiles d'accès rapide (« 3D-Explorer », « Mini-Spiel ») et une section **« Interaktive Karteikarten »** : une carte qui se retourne en 3D, question au recto, réponse au verso. Les cartes tirées des documents de l'étudiant restent sur la page « Karteikarten », à un clic.
- **Transitions** : chaque page arrive en fondu-glissé sur un ressort (Framer Motion). Le Hörsaal est laissé tel quel, il a sa propre chorégraphie.
- **Ressorts** : tous les boutons s'enfoncent à l'appui et reviennent sur une courbe de ressort ; les tuiles du Dashboard et la carte se soulèvent au survol.
- **Mouvement réduit** (réglage du téléphone ou de l'ordinateur) : aucune de ces animations ne joue.

**Écarts avec ton brief.**

- *Les cartes qui se retournent en 3D existaient déjà* sur la page « Karteikarten ». La section du Dashboard en est une vitrine, avec les cartes du moteur.
- *Les pages animaient déjà l'arrivée de leurs blocs.* La transition ajoutée couvre toutes les pages d'un seul geste, à l'entrée seulement : aucune animation de sortie ne retarde la navigation.
- *Le ressort des boutons est en CSS*, pas en Framer Motion : il vaut ainsi pour tous les boutons de l'app sans les réécrire.
- *Pas de personnage Rive.* Le hochement de tête du professeur est fait avec Framer Motion, sur son portrait existant.
- *Poids de Phaser* : 1,4 Mo (372 Ko compressé), téléchargé seulement à l'ouverture du mini-jeu. C'est le prix d'un vrai moteur de jeu ; si le mini-jeu reste à ce niveau de simplicité, il pourrait s'en passer.

Code : `src/web/pages/minigame.tsx`, `src/web/components/MiniGame.tsx`, `src/web/lib/minigame.ts` (règles), `src/web/components/flip-deck.tsx`, `src/web/components/page-transition.tsx`. Essai : `tred-perf\visuel-e2e.ts`.

## Explorateur 3D universel : cinq filières (15 nov. 2026)

- **Onglets de filière** en haut de la page : Ingenieurwesen, Medizin, Mathematik, Physik, Jura. Changer d'onglet change le modèle et ses points.
- **Sept modèles**, tous construits dans le navigateur : turboréacteur et engrenage (ingénierie) ; cellule animale et cœur (médecine) ; surface z = sin x + cos y avec maximum, minimum, col et gradient (mathématiques) ; atome de carbone en couches (physique) ; pyramide des normes allemande, du Grundgesetz à la Satzung (droit). Chacun a ses points, ses explications en quatre langues, parfois une formule pas à pas.
- **Chargeur de fichiers** : dépose un `.glb` dans `packages/web/public/models/` (par exemple `herz-anatomie.glb`) et ouvre `/explorer?glb=herz-anatomie`. Le mode d'emploi est dans `public/models/README.md`. Un modèle déposé ainsi n'a pas de points cliquables : ils s'écrivent dans `src/web/lib/explorer-more.ts`.
- **« In 3D ansehen » dans le Hörsaal** : quand la QUESTION de l'étudiant porte sur un modèle (« Erkläre mir das Herz », « Wie ist ein Atom aufgebaut? »…), un bouton jaune apparaît sous la réponse et ouvre `/explorer?model=heart` directement sur le bon modèle.

**Écarts avec ton brief.**

- *Le turboréacteur n'est pas devenu un fichier .glb.* Tu demandais à la fois de ne plus le coder et de le garder : il reste construit en code (c'est ce qui fait tourner ses arbres et allume ses pièces), et le composant accepte en plus la prop `modelUrl` pour n'importe quel fichier.
- *Sans compression Draco.* Le décodeur serait téléchargé chez Google à chaque affichage : un fichier compressé ainsi ne s'ouvrira pas.
- *Droit* : tu n'avais pas précisé de modèle ; j'ai fait la pyramide des normes. Dis-moi si tu préfères autre chose.
- *Le bouton 3D lit des mots-clés, pas le sens.* « Solarzelle » ou « Herzlichen Dank » ne le déclenchent pas, mais une question très indirecte non plus.
- *Le chargeur .glb est essayé avec un fichier d'essai fabriqué* (un tétraèdre), pas avec un vrai modèle anatomique : aucun n'est livré.
- *Relecture* : les contenus de médecine et de droit sont exacts à ma connaissance et recoupés par des tests pour les nombres ; fais-les relire par quelqu'un de la filière avant de t'en servir en communication.

Code : `src/web/lib/explorer-more.ts`, `src/web/components/explorer-scenes.tsx`, `explorer-kit.tsx`. Essai : `tred-perf\universel-e2e.ts`.
