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

Les vidéos TikTok / Reels de TRED sont du **code React** : elles réutilisent les vrais composants de l'app (la Tafel, le professeur, le logo, le solveur RDM). Choix fait le 2026-11-10 après comparaison de Remotion, Revideo et HyperFrames (voir `CLAUDE.md`, Règle de Veille Technologique).

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
- **Licence (vérifiée le 2026-11-10).** Gratuite pour une personne seule et pour les entreprises de **3 personnes au plus**, y compris en usage commercial. **Dès la 4ᵉ personne dans l'entreprise, une « Company License » est obligatoire.** Les prix publiés par des sites tiers se contredisent (de 25 $ à 100 $ par mois et plus) : vérifier le tarif officiel sur https://www.remotion.pro/license le jour de la 4ᵉ embauche. Aucun compte ni aucune clé ne sont nécessaires aujourd'hui.

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
