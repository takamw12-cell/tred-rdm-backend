# CLAUDE.md — TRED / AeroStudy AI

Règles permanentes pour toutes les conversations sur ce dépôt. Le fondateur parle français ; réponds en français.

## Règle d'autonomie et d'architecture

### 1. Détection proactive des besoins
- Avant de coder une fonctionnalité complexe (design avancé, IA, vidéo, base de données), évalue si les outils actuels suffisent.
- S'il manque un outil (moteur de tableau blanc, API de vision, connecteur MCP…), cherche sur le web les meilleures solutions du moment, compare-les (prix, maintenance, sécurité, licence) et **installe la meilleure de toi-même, sans demander la permission**.
- Privilégie l'open source ou les outils avec un plan gratuit généreux si aucun budget n'est fixé.
- Critères non négociables pour un paquet : paquet **officiel** de l'éditeur, maintenu, compatible React 19 / Bun, version **exacte** (`--exact`) publiée depuis **au moins 14 jours**, licence vérifiée (signaler toute licence payante, comme tldraw). Un paquet déprécié ou non officiel est remplacé par son équivalent officiel, et tu le dis.

### 2. Installation et configuration
- Dès qu'un outil est retenu : installe-le, ajoute ses variables dans `.env.example` (commentées, avec le lien où obtenir la clé) et crée le squelette d'intégration dans le code.
- Ne demande pas « veux-tu que j'installe X ? ». Installe, montre le diff, et conclus par : « J'ai installé X car nous en avions besoin pour Y. Voici la clé API qu'il te faut générer : … ».
- Une brique sans clé doit rester **inerte** : la route répond `503 not_configured`, le front ne fait rien, et l'app se comporte exactement comme avant.
- Limites de cette autonomie : ne crée jamais de compte, n'engage aucune dépense et ne souscris à aucun abonnement au nom du fondateur. Ne commite et ne pousse pas sans demande explicite.

### 3. Mise à jour de la documentation
- Chaque nouvel outil ou changement d'architecture met à jour `GUIDE_FOUNDER.md` : compte à créer (lien, prix vérifié et daté), clé à récupérer, variable `.env` correspondante.

### 4. Le design et la vision sont intouchables
- L'autonomie est **technique**. La vision produit appartient au fondateur : l'interface « Digitaler Hörsaal », la charte crème / jaune / encre (`#FDFBF7` / `#EAB308` / `#0F172A`), le Tuteur Actif.
- Aucun changement visuel, de texte d'interface ou de comportement pédagogique sans sa validation. Propose avec une capture, puis attends son accord.

## Faits techniques du dépôt

- Monorepo Bun : `packages/web` (Vite + React 19 + Hono/oRPC + Drizzle/Turso), `packages/mobile` (Expo).
- Le dépôt vit sur Windows (`C:\dev\tred-rdm\aerostudy-ai`). Depuis WSL, utilise **`/mnt/c/Users/HP/.bun/bin/bun.exe`** pour installer, tester et builder : `node_modules` contient des binaires Windows.
- Vérifications : `bun x tsc --noEmit -p tsconfig.app.json`, `bun x vite build`, `bun test` (dans `packages/web`).
- Migrations Turso : un script `migre-*.mjs` idempotent à la racine, lancé par le fondateur. drizzle-kit ne tourne pas ici (binaire esbuild Windows).
- Secrets : uniquement côté serveur (`process.env`). Seules les valeurs publiques (DSN Sentry, clé PostHog, flags) prennent le préfixe `VITE_`.
- Fichiers gérés par le template (préfixe `__`) : ne pas modifier.
- Hörsaal : `web/components/virtual-classroom.tsx` (slots `sidebar` / `board` / `avatar`, attributs `data-slot` = noms des calques Figma) ; avatar dans `api/avatar/` ; coûts dans `api/lib/avatar-cost.ts`.

## Vision pédagogique et architecture multi-matières (décisions du 7 nov. 2026)

TRED doit enseigner et corriger **toutes** les matières d'ingénierie : d'abord l'Allemagne (DIN/VDI/ISO), puis l'international et le lycée.

- **Domain-Based Agent.** `api/lib/solvers/domain.ts` détecte la matière de la question ; `api/prompts/` charge alors le **module de la matière** (message système séparé, non mis en cache) en plus du prompt principal (`agent/index.ts`, NIVEAU 2c = vue d'ensemble).
  - `prompts/germany/` : un fichier par matière (mechanik, elektrotechnik, thermodynamik, mathematik, regelungstechnik, technisches-zeichnen, datenverarbeitung).
  - `prompts/international/` (UK/USA) et `prompts/highschool/` (Abitur, Bac) : vides pour l'instant, repli automatique sur `germany`. Voir leurs README.
- **Le modèle ne calcule jamais lui-même.** Chaque matière a son solveur dans `api/lib/solvers/` (`solveCircuit`, `solveThermo`, `solveMath`, `statics-solver`, plus `balkenstatik` et `rechnen`), avec Probe intégrée. Une matière sans solveur le dit ouvertement à l'étudiant.
- **Python s'exécute dans le navigateur de l'étudiant** (Pyodide, iframe sandbox sans `allow-same-origin`, Web Worker, délai max) : `web/lib/python-sandbox.ts`, tableau des variables `api/lib/solvers/variable-tracer.ts`. Jamais d'exécution de code côté serveur.
- **Pédagogie « Super-Professeur »** (Feynman + Socrate) : jamais la solution d'un exercice d'emblée, toujours guider par questions ; une analogie pour chaque concept difficile ; une question de compréhension à la fin de chaque explication. **Soupape validée par le fondateur** : si l'étudiant a essayé et redemande explicitement la solution, TRED la déroule pas à pas avec une question de vérification à chaque étape.
- **Sans le cours de l'étudiant**, TRED s'appuie sur les standards (DIN, VDI, ISO, Eurocode) et sur l'outil `recherche_connaissances_externes` (Wikipedia sans clé, Tavily si `TAVILY_API_KEY`), en signalant la source.
- Toute nouvelle matière = détection dans `domain.ts` + module dans `prompts/germany/` + solveur testé dans `lib/solvers/` (ou mention explicite « pas de solveur »).

## V2 « Surhumain » (décisions du 7 nov. 2026)

Le plan complet est dans `docs/V2_ARCHITECTURE.md`.
- **Pilier 1, Karteikarten** (fait) :
  - planification pure dans `api/lib/flashcards.ts`. « Gewusst » multiplie l'intervalle par le facteur de facilité ; « Nicht gewusst » fait revenir la carte demain. La journée est comptée à Berlin ;
  - génération par IA via `POST /api/flashcards/generate` (sources document, chat ou lacune) ;
  - page `/flashcards` et bloc sur le tableau de bord ;
  - table créée par `migre-flashcards.mjs`.
- **Pilier 2, Klausur-Prognose** : en fondations. Les probabilités sont calculées par du code (`api/lib/exam-predictor.ts`), jamais estimées par le modèle.
- **Pilier 3, co-pilote vision** : en fondations. On utilise les API natives du navigateur, sans nouveau paquet. Les images ne sont jamais stockées.
- **Pilier 4, intelligence collective** : en fondations. Contribuer exige le consentement, une modération et une mention dans la Datenschutzerklärung avant ouverture.

