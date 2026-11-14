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

### Mise en service sur Railway (une fois, environ 10 minutes)

1. **Redis.** Projet TRED → « + New » → Database → **Add Redis**. Facturé à l'usage par Railway (mémoire et processeur consommés ; pour cette file, quelques dizaines de Mo). Vérifie le tarif du jour sur https://railway.com/pricing avant de valider.
2. **Service worker.** « + New » → GitHub Repo → le même dépôt `tred-rdm-backend`. Dans ses réglages :
   - Settings → **Config-as-code** → chemin `railway.worker.json` (il lance `bun packages/web/src/worker.ts`) ;
   - aucun domaine public (Settings → Networking : ne rien générer) ;
   - Variables : les mêmes que le service web pour `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `S3_*`, `R2_*` (si utilisées), `ANTHROPIC_API_KEY`, `MATHPIX_*`, `ELEVENLABS_*`, plus `REDIS_URL = ${{Redis.REDIS_URL}}`. Le plus simple : « Shared Variables » du projet.
3. **Service web.** Ajoute `REDIS_URL = ${{Redis.REDIS_URL}}`. Il redéploie, et les imports passent par la file.
4. **Vérifier.** Importe un PDF : les journaux du worker affichent `[worker] import imp_… : terminé (N pages)`.

**Revenir en arrière** : supprime `REDIS_URL` du service web. L'import redevient synchrone au redéploiement.

**Aucune table à créer.** L'état des travaux vit dans Redis (une heure après la fin, un jour après un échec).

| Variable | Service | Rôle |
|---|---|---|
| `REDIS_URL` | web + worker | active la file |
| `WORKER_IMPORT_CONCURRENCY` | worker | imports en parallèle par réplique (défaut 2) |
| `WORKER_VIDEO_CONCURRENCY` | worker | vidéos en parallèle par réplique (défaut 3) |

### « Als Video erklären » passe par la même file

Le clic dépose un travail `generate-video`. Le worker enchaîne script (Claude) → contrôle par du code → voix (ElevenLabs) → stockage, et le navigateur affiche la vidéo dès qu'elle est prête (`GET /api/jobs/gv_…` pour l'état, `GET /api/video/gv_…` pour le contenu).

- **Reprises.** Une panne passagère (Claude, ElevenLabs ou le stockage ne répondent pas) est reprise **2 fois**, après 5 s puis 10 s. Au troisième échec, la vidéo est marquée `failed` et l'étudiant voit « Das Video konnte nicht erstellt werden. ».
- **Pas de reprise pour un refus.** Un script que le contrôle n'a pas pu prouver (`not_grounded`) ou le plafond quotidien de voix (`daily_limit`) sont des décisions : les rejouer paierait un appel de plus pour la même réponse.
- **Une reprise ne coûte pas deux fois.** Le script validé est gardé entre deux essais : si seule la voix a échoué, on ne repaie pas Claude.
- **Limite à connaître.** Le plafond quotidien de caractères ElevenLabs (`ELEVENLABS_DAILY_CHARS`) est compté en mémoire, par processus. Avec le worker, les vidéos ont donc leur propre compteur, séparé de la lecture à voix haute du chat, et chaque réplique a le sien. Les quotas du tarif (vidéos par mois) restent, eux, en base et exacts.


### Le film d'attente pendant un import

Pendant qu'un import tourne, l'écran de chargement montre un film TRED de 10 s en boucle, muet (ses sous-titres sont dans l'image), et une barre qui suit l'état du travail. Dès que le travail est `done`, l'écran disparaît. « Ausblenden » ou Échap le masque sans arrêter l'import.

- Fichier : `packages/web/public/videos/import-wait-v1.mp4` (1,7 Mo, 1280×720) et son image `import-wait-v1.webp`. Source : `Cine-B-DE-1-Der-magische-Button.mp4`, de 9,6 s à 19,6 s.
- **Changer de film** : exporte 10 s en 720p sans piste son, nomme-le `import-wait-v2.mp4` (le numéro compte : le fichier est mis en cache un an) et change les deux constantes en tête de `web/components/import-wait-overlay.tsx`.
