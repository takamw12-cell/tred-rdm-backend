import type { Context, Hono } from "hono";
import { generateObject } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { gateway } from "../agent/gateway";
import { auth } from "../auth";
import { db } from "../database";
import { document, simulation } from "../database/schema";
import { PRIMARY_MODEL } from "../lib/ai-models";
import { addOutputTokens, tokenCapError, withinTokenCap } from "../lib/plan";
import { buildSimulationPrompt, documentWindow, simulateRequestSchema, simulationModelSchema, verifySimulation, type FormulaCheck, type SimulationDto, type SimulationSpec } from "../lib/simulation";
import { buildGeneratedPrompt, generatedModelSchema, verifyGenerated } from "../lib/simulation-gen";
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

const engineOf = (checks: FormulaCheck[], scene?: SimulationSpec["scene"]): SimulationDto["engine"] =>
  scene === "generated" ? "units" : scene === "explanation" ? "none" : checks.length > 0 && checks.every((c) => c.level === "proved") ? "sympy" : "numeric";
const sameConcept = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

function toDto(row: typeof simulation.$inferSelect): SimulationDto | null {
  const spec = readJson<SimulationSpec>(row.spec);
  const checks = readJson<FormulaCheck[]>(row.verification);
  if (!spec || !Array.isArray(checks)) return null;
  return { id: row.id, documentId: row.documentId, concept: row.concept, createdAt: row.createdAt.getTime(), spec, checks, engine: engineOf(checks, spec.scene) };
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

/** Le Labo universel : un appel au modèle, puis le contrôle. Jamais d'erreur technique vers l'étudiant : simulation, explication, ou un refus poli. */
async function generated(c: Context, input: { userId: string; concept: string; doc: { id: string; title: string; textContent: string } | null }) {
  const { userId, concept, doc } = input;
  const existing = doc ? await stored(userId, doc.id) : [];
  const same = existing.find((s) => s.spec.scene !== undefined && (s.spec.scene === "generated" || s.spec.scene === "explanation") && sameConcept(s.concept, concept));
  if (same) return c.json({ simulation: same, reused: true });
  if (existing.length >= MAX_PER_DOCUMENT) return c.json({ error: "LIMIT_REACHED" }, 409);
  const cap = await withinTokenCap(userId);
  if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

  try {
    // Deux essais au plus : le second reçoit ce que le contrôle a refusé (unités, facteur compté deux fois…).
    const rank = (v: ReturnType<typeof verifyGenerated>) => (!v.ok ? 0 : v.kind === "explanation" ? 1 : 2);
    let best = verifyGenerated({ title: "", summary: "", explanation: "", quotes: [], inputs: [], outputs: [], shapes: [], plotX: "" }, { concept, documentText: null });
    for (let attempt = 0; attempt < 2; attempt++) {
      const rejected = best.checks.filter((k) => k.status !== "ok");
      const { system, prompt } = buildGeneratedPrompt({ concept, title: doc?.title ?? null, documentText: doc ? documentWindow(doc.textContent, concept) : null, rejected });
      const { object, usage } = await generateObject({ model: gateway(PRIMARY_MODEL), schema: generatedModelSchema, system, prompt, abortSignal: AbortSignal.timeout(90_000) });
      void addOutputTokens(userId, usage?.outputTokens ?? 0);
      const next = verifyGenerated(object, { concept, documentText: doc?.textContent ?? null });
      // Un second essai moins bon (une explication à la place d'une simulation) ne remplace pas le premier.
      if (attempt === 0 || rank(next) >= rank(best)) best = next;
      if (next.checks.every((k) => k.status === "ok")) break;
      console.warn(`[simulate] généré : refus attempt=${attempt + 1} checks=${next.checks.map((k) => `${k.output}:${k.status}`).join(",")}`);
    }
    const verdict = best;
    if (!verdict.ok) {
      console.warn(`[simulate] généré : rien de valable concept="${concept.slice(0, 60)}" checks=${verdict.checks.map((k) => `${k.output}:${k.status}`).join(",")}`);
      return c.json({ error: "NOTHING_TO_SHOW" }, 422);
    }
    const spec: SimulationSpec =
      verdict.kind === "simulation"
        ? { scene: "generated", concept: concept.trim(), values: Object.fromEntries(verdict.sim.inputs.map((v) => [v.symbol, v.value])), formulas: [], generated: verdict.sim }
        : { scene: "explanation", concept: concept.trim(), values: {}, formulas: [], explanation: verdict.explanation };
    const checks = verdict.checks.filter((k) => k.status === "ok");
    const row = { id: crypto.randomUUID(), userId, documentId: doc?.id ?? "", concept: spec.concept, scene: spec.scene, spec: JSON.stringify(spec), verification: JSON.stringify(checks), createdAt: new Date() };
    // Sans document, rien n'est gardé : la simulation vit le temps de la page.
    const saved = doc
      ? await db
          .insert(simulation)
          .values(row)
          .then(() => true)
          .catch((err: Error) => {
            console.error("[simulate] non enregistrée", err.message?.slice(0, 160));
            return false;
          })
      : false;
    console.log(`[simulate] généré kind=${verdict.kind} formulas=${verdict.kind === "simulation" ? verdict.sim.formulas.length : 0} refusées=${verdict.checks.length - checks.length} doc=${doc ? "oui" : "non"} saved=${saved}`);
    return c.json({ simulation: { id: row.id, documentId: row.documentId, concept: row.concept, createdAt: row.createdAt.getTime(), spec, checks, engine: engineOf(checks, spec.scene) } satisfies SimulationDto, reused: false, saved, kept: Boolean(doc) });
  } catch (err) {
    console.error("[simulate] généré : échec", (err as Error).message?.slice(0, 200));
    return c.json({ error: "GENERATION_FAILED" }, 502);
  }
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

    const wanted = sceneForConcept(concept);
    const [doc] = documentId
      ? await db
          .select({ id: document.id, title: document.title, textContent: document.textContent })
          .from(document)
          .where(and(eq(document.id, documentId), eq(document.userId, userId)))
      : [];
    if (documentId && !doc) return c.json({ error: "NOT_FOUND" }, 404);
    if (doc && !doc.textContent.trim()) return c.json({ error: "NO_TEXT" }, 422);

    // Hors catalogue : le Labo universel. Une simulation décrite par le modèle, contrôlée (syntaxe, unités,
    // citation) mais sans loi de référence — donc jamais annoncée comme prouvée. Sinon, une explication.
    if (!wanted) return generated(c, { userId, concept, doc: doc ?? null });
    // Une loi du catalogue se vérifie contre un document : sans document, rien à citer.
    if (!doc) return c.json({ error: "DOCUMENT_REQUIRED" }, 422);
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
