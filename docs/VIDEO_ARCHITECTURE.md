# Architecture — génération vidéo (Grok Imagine / Runway)

> Statut : **validé, non implémenté.** À coder après la mise en production du Module 2 de Technische Mechanik.
> Décidé le 5 novembre 2026.

## Décisions

| Sujet | Décision |
|---|---|
| Fournisseur au lancement | **Grok Imagine Video 1.5 Lite** (xAI) |
| Fournisseur ensuite | **Runway Gen-4 Turbo**, pour l'image → vidéo de meilleure qualité |
| Sora 2 | **Écarté** : retrait de l'API annoncé (OpenAI 24/09/2026, Azure 15/10/2026) |
| Place dans le produit | **Bouton premium explicite**, jamais le comportement par défaut du chat |

## Pourquoi la vidéo n'est pas le moyen d'expliquer

Les modèles vidéo ne savent pas écrire juste une formule, une unité ou une
annotation. La promesse de TRED est l'exactitude. Les explications restent
portées par :

- les **animations SVG** (prompt NIVEAU 9d) — exactes, gratuites, instantanées ;
- les **schémas calculés** (Module 1, `balkenstatik`) — dessinés depuis le calcul.

La vidéo générée sert d'illustration d'ambiance ou de mise en situation, à la
demande, payée en crédits.

## Garde-fous dès le premier jour

- Durée plafonnée à **8 s** par génération.
- Coût **réservé sur les crédits avant** l'appel fournisseur, remboursé si échec.
- **Une génération à la fois** par utilisateur.
- Le suivi reprend les jobs `queued` / `running` au redémarrage du conteneur
  (d'où `provider` et `provider_job_id` en base).
- Montants stockés en **centimes d'USD (entier)**, jamais en flottant.

## Schéma SQL (libsql / Turso)

```sql
CREATE TABLE IF NOT EXISTS generated_media (
  id              TEXT PRIMARY KEY,                 -- "med_" + uuid
  user_id         TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('video','image')),
  prompt          TEXT NOT NULL,
  url             TEXT,                             -- null tant que non prêt
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','succeeded','failed','canceled')),
  cost            INTEGER NOT NULL DEFAULT 0,       -- centimes d'USD
  created_at      INTEGER NOT NULL,                 -- epoch secondes (mode "timestamp" drizzle)
  -- nécessaires au suivi :
  provider        TEXT NOT NULL,                    -- 'xai' | 'runway'
  provider_job_id TEXT,
  duration_sec    INTEGER,
  error           TEXT,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS generated_media_user_idx
  ON generated_media (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS generated_media_pending_idx
  ON generated_media (status) WHERE status IN ('queued','running');
```

## Interfaces TypeScript

```ts
export type VideoProvider = "xai" | "runway";
export type MediaStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface GenerateVideoInput {
  userId: string;
  prompt: string;
  durationSec: number;            // borné côté serveur (4–8 s)
  imageUrl?: string;              // présent = image-to-video
  aspectRatio?: "16:9" | "9:16" | "1:1";
  provider?: VideoProvider;       // défaut choisi par config
}

export interface GenerateVideoResult {
  mediaId: string;                // id generated_media
  status: MediaStatus;            // "queued" en pratique
  estimatedCostCents: number;     // réservé AVANT l'appel fournisseur
}

export interface VideoStatus {
  mediaId: string;
  status: MediaStatus;
  url: string | null;
  error: string | null;
  costCents: number;
}

export function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoResult>;
export function pollVideoStatus(mediaId: string, userId: string): Promise<VideoStatus>;

/** Chaque fournisseur implémente ce contrat ; l'application ne connaît que lui. */
export interface VideoProviderAdapter {
  submit(i: GenerateVideoInput): Promise<{ jobId: string }>;
  status(jobId: string): Promise<{ status: MediaStatus; url?: string; error?: string }>;
  priceCentsPerSecond(i: GenerateVideoInput): number;
}
```

## Comparatif des fournisseurs (novembre 2026)

| | Sora 2 (OpenAI) | Grok Imagine Video (xAI) | Runway Gen-4 Turbo |
|---|---|---|---|
| Prix / seconde | ~$0,10 (720p) ; Pro $0,30–0,70 | 1.5 Lite **$0,02** (480p) ; 1.5 ~$0,08–0,25 selon résolution | **$0,05** (5 crédits/s) ; Gen-4.5 $0,12 |
| Durée max | 4 / 8 / 12 s | jusqu'à 15 s (1.5 : 5–8 s par génération) | 5 ou 10 s |
| Modes | texte et image → vidéo | texte et image → vidéo | image → vidéo (texte seul : Gen-4.5) |
| Statut | **API retirée** (sept./oct. 2026) | disponible | disponible |
| Doc | <https://platform.openai.com/docs/models> | <https://docs.x.ai/developers/models> | <https://dev.runwayml.com> |

Ordre de grandeur : un clip de 6 s coûte ~$0,12 avec Grok 1.5 Lite, ~$0,30 avec Runway Gen-4 Turbo.

⚠️ La plupart de ces chiffres viennent de sources tierces, et les tarifs Grok
diffèrent selon les sources (prix fixe ou par résolution). **Revérifier les pages
officielles avant de fixer le prix en crédits.**

### Sources
- Sora 2 : [eesel](https://www.eesel.ai/blog/sora-2-pricing), [Voyager — dates de retrait](https://voyager.so/resources/models/sora-2), [Framesurfer](https://framesurfer.com/blogs/sora-2-pricing)
- Grok Imagine : [xAI — Imagine API](https://x.ai/api/imagine), [xAI — modèles et prix](https://docs.x.ai/developers/models), [OpenRouter](https://openrouter.ai/x-ai/grok-imagine-video), [Voyager — 1.5](https://voyager.so/resources/models/grok-imagine-video-1-5)
- Runway : [apiframe](https://apiframe.ai/guides/runway-api-guide), [Unifically](https://unifically.com/blogs/runway-gen-4), [DevelopersDigest](https://www.developersdigest.tech/models/video-generation/runway)
