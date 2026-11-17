import { z } from "zod";
import { and, desc, eq, isNull, like } from "drizzle-orm";

import { authed } from "../middleware/auth";
import { db } from "../database";
import { contentReport } from "../database/schema";

/**
 * Signaler une réponse du tuteur.
 *
 * ── Ce que la règle demande exactement ────────────────────────────────────
 *
 * Google Play, règle « AI-Generated Content » : une app qui produit du contenu
 * par IA doit contenir « des fonctions de signalement permettant aux
 * utilisateurs de signaler un contenu offensant aux développeurs sans avoir à
 * quitter l'application ». Un lien « écris-nous un courriel » ne suffit pas :
 * il fait sortir de l'app, ce que la phrase exclut mot pour mot.
 *
 * ── Pourquoi l'écrire en base plutôt que l'envoyer par courriel ───────────
 *
 * Un courriel qui échoue ne laisse aucune trace, et c'est précisément la
 * preuve qu'on aura besoin de produire. Une ligne en base survit à une panne
 * de Resend, se compte, et se relit dans l'ordre.
 */

/**
 * Quatre motifs, pas dix.
 *
 * Une liste longue fait renoncer ; une liste d'un seul motif ne dit rien de ce
 * qui s'est passé. Ces quatre-là recouvrent ce qu'un étudiant peut réellement
 * reprocher à un tuteur : c'est dangereux, c'est faux, c'est déplacé, ou c'est
 * autre chose — et le champ libre existe pour ce dernier cas.
 */
export const REPORT_REASONS = ["harmful", "wrong", "offensive", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Assez pour comprendre le reproche, trop peu pour recopier un cours entier. */
const MAX_EXCERPT = 2000;
const MAX_NOTE = 1000;

export const reports = {
  /**
   * Enregistre un signalement.
   *
   * Renvoie toujours `{ ok: true }`. L'étudiant vient de dire qu'une réponse
   * l'a choqué : lui répondre par une erreur technique serait la deuxième
   * mauvaise nouvelle en dix secondes. Les échecs d'écriture sont journalisés,
   * pas remontés.
   */
  create: authed
    .input(
      z.object({
        reason: z.enum(REPORT_REASONS),
        conversationId: z.string().max(64).optional(),
        messageId: z.string().max(64).optional(),
        excerpt: z.string().max(20_000).optional(),
        note: z.string().max(5_000).optional(),
        locale: z.string().max(8).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      try {
        await db.insert(contentReport).values({
          id: `rep_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          userId: context.user.id,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          reason: input.reason,
          excerpt: (input.excerpt ?? "").slice(0, MAX_EXCERPT),
          note: (input.note ?? "").slice(0, MAX_NOTE),
          locale: input.locale ?? "de",
        });
      } catch (error) {
        console.error("[report] Signalement nicht gespeichert", error);
      }

      return { ok: true as const };
    }),
};

/**
 * Les signalements ouverts, les plus récents d'abord.
 *
 * ── Pourquoi ce n'est pas une route oRPC ──────────────────────────────────
 *
 * L'écran d'administration parle en REST à `/api/admin/*`, et la garde
 * `requireAdmin()` y est écrite une seule fois. Une deuxième route oRPC avec
 * sa propre vérification de rôle serait le jour où l'une des deux oublie de
 * la faire. Ces deux fonctions exposent donc la requête, pas l'autorisation :
 * c'est l'appelant qui garde la porte.
 */
export function listOpenReports(limit = 100) {
  return db
    .select()
    .from(contentReport)
    .where(isNull(contentReport.resolvedAt))
    .orderBy(desc(contentReport.createdAt))
    .limit(limit);
}

/** Marquer un signalement comme traité. */
export async function resolveReport(id: string): Promise<void> {
  await db
    .update(contentReport)
    .set({ resolvedAt: new Date() })
    .where(eq(contentReport.id, id));
}

/**
 * Le 17 nov. 2026, pendant quelques heures, le verrou « pas de résultat sans
 * solveur » (lib/solver-gate.ts) a écrit ici chacun de ses rattrapages
 * internes, sous le motif « wrong » : l'essai était pourtant coupé AVANT
 * l'écran et relancé avec le solveur. Ces lignes ne sont pas des erreurs vues
 * par un étudiant. Elles sont marquées traitées (pas supprimées), une fois,
 * au démarrage du serveur ; la requête ne touche plus rien ensuite.
 */
export const INTERNAL_GATE_NOTE = "[automatique] calcul sans solveur BLOQUÉ";

export async function resolveInternalGateReports(): Promise<number> {
  try {
    const rows = await db
      .update(contentReport)
      .set({ resolvedAt: new Date() })
      .where(and(isNull(contentReport.resolvedAt), like(contentReport.note, `${INTERNAL_GATE_NOTE}%`)))
      .returning({ id: contentReport.id });
    if (rows.length) console.log(`[reports] ${rows.length} blocage(s) interne(s) du verrou solveur marqué(s) traité(s)`);
    return rows.length;
  } catch (err) {
    console.error("[reports] nettoyage des blocages internes :", err instanceof Error ? err.message : String(err));
    return 0;
  }
}
