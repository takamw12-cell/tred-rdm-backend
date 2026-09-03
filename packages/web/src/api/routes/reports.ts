import { z } from "zod";
import { desc, eq, isNull } from "drizzle-orm";

import { authed } from "../middleware/auth";
import { db } from "../database";
import { contentReport } from "../database/schema";
import { getAccess } from "../lib/access";

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

  /**
   * Les signalements ouverts. Réservé à l'administration.
   *
   * Sans cette liste, la fonction précédente serait une boîte aux lettres sans
   * clé : conforme à la règle, et inutile. C'est ici qu'on voit si le tuteur
   * dérape sur un chapitre précis.
   */
  listOpen: authed
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .handler(async ({ input, context }) => {
      // Le rôle vit dans `user_access`, pas dans la session : un jeton volé ne
      // devient pas administrateur parce qu'il porte le mot.
      const access = await getAccess(context.user.id, context.user.email);
      if (access.role !== "admin") {
        return { reports: [] as (typeof contentReport.$inferSelect)[] };
      }

      const rows = await db
        .select()
        .from(contentReport)
        .where(isNull(contentReport.resolvedAt))
        .orderBy(desc(contentReport.createdAt))
        .limit(input?.limit ?? 50);

      return { reports: rows };
    }),

  /** Marquer un signalement comme traité. */
  resolve: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const access = await getAccess(context.user.id, context.user.email);
      if (access.role !== "admin") return { ok: false as const };

      await db
        .update(contentReport)
        .set({ resolvedAt: new Date() })
        .where(eq(contentReport.id, input.id));

      return { ok: true as const };
    }),
};
