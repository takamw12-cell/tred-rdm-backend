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
