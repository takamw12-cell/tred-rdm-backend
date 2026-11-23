import type { Hono } from "hono";
import { generateObject } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { gateway } from "../agent/gateway";
import { auth } from "../auth";
import { db } from "../database";
import { document, simulation } from "../database/schema";
import { PRIMARY_MODEL } from "../lib/ai-models";
import { addOutputTokens, tokenCapError, withinTokenCap } from "../lib/plan";
import { buildSimulationPrompt, documentWindow, simulateRequestSchema, simulationModelSchema, verifySimulation, type FormulaCheck, type SimulationDto, type SimulationSpec } from "../lib/simulation";
import { sympyIsReady, verifyMath } from "../lib/sympy-verify";
import { sceneForConcept } from "../../web/lib/sim-catalog";

/**
 * Le Labo :
 *   GET  /api/simulate?documentId=…   les simulations déjà construites pour ce document
 *   POST /api/simulate                { documentId, concept } → une simulation vérifiée, ou un refus
 *
 * Rien n'est gardé ni renvoyé sans vérification (lib/simulation.ts). Deux
 * essais au plus : le second reçoit la liste de ce que la vérification a
 * refusé. Après deux refus : 422, et la raison formule par formule.
 */
const MAX_PER_DOCUMENT = 20;

const readJson = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const engineOf = (checks: FormulaCheck[]): SimulationDto["engine"] => (checks.length > 0 && checks.every((c) => c.level === "proved") ? "sympy" : "numeric");

function toDto(row: typeof simulation.$inferSelect): SimulationDto | null {
  const spec = readJson<SimulationSpec>(row.spec);
  const checks = readJson<FormulaCheck[]>(row.verification);
  if (!spec || !Array.isArray(checks)) return null;
  return { id: row.id, documentId: row.documentId, concept: row.concept, createdAt: row.createdAt.getTime(), spec, checks, engine: engineOf(checks) };
}

/** Les simulations d'un document. Table absente (migration pas encore lancée) : liste vide, jamais une erreur. */
async function stored(userId: string, documentId: string): Promise<SimulationDto[]> {
  const rows = await db
    .select()
    .from(simulation)
    .where(and(eq(simulation.userId, userId), eq(simulation.documentId, documentId)))
    .orderBy(desc(simulation.createdAt))
    .limit(MAX_PER_DOCUMENT)
    .catch(() => []);
  return rows.map(toDto).filter((s): s is SimulationDto => s !== null);
}

export function registerSimulateRoutes(app: Hono) {
  app.get("/api/simulate", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const documentId = c.req.query("documentId")?.slice(0, 100) ?? "";
    if (!documentId) return c.json({ error: "BAD_REQUEST" }, 400);
    return c.json({ simulations: await stored(session.user.id, documentId) });
  });

  app.post("/api/simulate", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const parsed = simulateRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "BAD_REQUEST" }, 400);
    const { documentId, concept } = parsed.data;
    const userId = session.user.id;

    const [doc] = await db
      .select({ id: document.id, title: document.title, textContent: document.textContent })
      .from(document)
      .where(and(eq(document.id, documentId), eq(document.userId, userId)));
    if (!doc) return c.json({ error: "NOT_FOUND" }, 404);
    if (!doc.textContent.trim()) return c.json({ error: "NO_TEXT" }, 422);

    // Déjà construite pour ce document : on la rend, sans rappeler le modèle.
    // Le concept doit désigner une simulation du catalogue : sinon refus immédiat, sans appel au modèle.
    const wanted = sceneForConcept(concept);
    if (!wanted) return c.json({ error: "NO_VERIFIED_MODEL", checks: [] }, 422);
    const existing = await stored(userId, documentId);
    const same = existing.find((s) => s.spec.scene === wanted.id);
    if (same) return c.json({ simulation: same, reused: true });
    if (existing.length >= MAX_PER_DOCUMENT) return c.json({ error: "LIMIT_REACHED" }, 409);

    const cap = await withinTokenCap(userId);
    if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

    const documentText = documentWindow(doc.textContent, concept);
    const prove = sympyIsReady() ? verifyMath : undefined;
    let rejected: FormulaCheck[] | undefined;
    let reason = "formula_rejected";
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { system, prompt } = buildSimulationPrompt({ concept, title: doc.title, documentText, scene: wanted.id, rejected });
        const { object, usage } = await generateObject({ model: gateway(PRIMARY_MODEL), schema: simulationModelSchema, system, prompt, abortSignal: AbortSignal.timeout(90_000) });
        void addOutputTokens(userId, usage?.outputTokens ?? 0);
        const verdict = await verifySimulation(object, { concept, documentText: doc.textContent, scene: wanted.id }, prove);
        if (verdict.ok) {
          const row = { id: crypto.randomUUID(), userId, documentId, concept: verdict.spec.concept, scene: verdict.spec.scene, spec: JSON.stringify(verdict.spec), verification: JSON.stringify(verdict.checks), createdAt: new Date() };
          const saved = await db
            .insert(simulation)
            .values(row)
            .then(() => true)
            .catch((err: Error) => {
              console.error("[simulate] non enregistrée", err.message?.slice(0, 160));
              return false;
            });
          console.log(`[simulate] ok scene=${verdict.spec.scene} formulas=${verdict.spec.formulas.length} engine=${engineOf(verdict.checks)} attempt=${attempt + 1} saved=${saved}`);
          return c.json({ simulation: { id: row.id, documentId, concept: row.concept, createdAt: row.createdAt.getTime(), spec: verdict.spec, checks: verdict.checks, engine: engineOf(verdict.checks) } satisfies SimulationDto, reused: false, saved });
        }
        reason = verdict.reason;
        rejected = verdict.checks;
        console.warn(`[simulate] refus attempt=${attempt + 1} reason=${verdict.reason} checks=${verdict.checks.map((k) => `${k.output}:${k.status}`).join(",")}`);
        // Aucun modèle vérifié pour ce concept : un second essai n'y changerait rien.
        if (verdict.reason === "no_model") break;
      }
    } catch (err) {
      console.error("[simulate] failed", (err as Error).message?.slice(0, 200));
      return c.json({ error: "GENERATION_FAILED" }, 502);
    }
    return c.json({ error: reason === "no_model" ? "NO_VERIFIED_MODEL" : "VERIFICATION_FAILED", checks: rejected ?? [] }, 422);
  });
}
