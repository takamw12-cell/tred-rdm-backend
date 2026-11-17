/**
 * Verrou « pas de résultat sans solveur » — arrêt PENDANT le flux.
 *
 * Brief fondateur du 17 nov. 2026 : le garde de lib/precision.ts
 * (`detectSolverSkip`) signalait APRÈS coup un résultat chiffré sorti sans
 * solveur (question « avion à 120 km/h », TM3). Trop tard : le chiffre était
 * déjà à l'écran.
 *
 * Deux protections, l'une derrière l'autre :
 *
 * A. APPEL IMPOSÉ DÈS LE PREMIER PAS (`mustCallToolFirst`, `firstCallForce`,
 *    `forcedToolStep`) : pour une question technique, le modèle n'a pas le
 *    droit d'écrire un mot avant d'avoir appelé un solveur — ou l'outil de
 *    sortie `kein_loeser_vorhanden` quand aucun solveur ne couvre la tâche.
 *    L'API refuse un outil imposé avec le raisonnement étendu : ces tours
 *    tournent donc sans lui.
 *
 * B. LE FLUX RETENU, pour toute question de calcul (`needsSolver`) :
 *
 *   1. Tant qu'aucun solveur n'a été appelé, le texte est retenu LIGNE PAR
 *      LIGNE. Une ligne n'est envoyée au navigateur qu'une fois complète et
 *      vérifiée : sans résultat calculé (un nombre absent de la question,
 *      après « = » ou suivi d'une unité). Le dessin et le code (blocs ```,
 *      balises) ne sont pas lus : ce ne sont pas des résultats.
 *   2. Une ligne fautive : le modèle est arrêté (abortSignal), la ligne n'est
 *      jamais envoyée. Le navigateur reçoit « Ich muss den Löser benutzen … »
 *      puis un SECOND essai démarre, limité aux solveurs (`retryForce`).
 *   3. Dès qu'un solveur est appelé, le texte passe sans retenue : les
 *      chiffres viennent alors de l'outil.
 *
 * Un blocage est un rattrapage INTERNE réussi : il va dans le journal du
 * serveur (console.warn), pas dans « Gemeldete Antworten ». Seul un résultat
 * qui a réellement atteint l'écran sans solveur y est signalé
 * (`detectSolverSkip`, lib/precision.ts).
 *
 * Le raisonnement (résumé de la réflexion) n'est pas filtré : il n'est pas
 * une réponse. Le second essai n'est pas re-filtré : son premier pas est un
 * appel de solveur imposé par l'API.
 *
 * Module pur (aucun accès réseau, aucune base) : testé dans
 * tests/solver-gate.test.ts.
 */
import { NO_SOLVER_TOOL, SOLVER_TOOLS, needsSolver } from "./precision";

/* -------------------------------------------------------------------------- */
/* Détection                                                                  */
/* -------------------------------------------------------------------------- */

/** Une grandeur écrite comme résultat : « = 12 », « ≈ −3,5 », « 33,3 m/s ». */
const RESULT =
  /[=≈]\s*[-−]?\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:\\,|\\;|\s)?(?:\\mathrm\{|\\text\{)?\s*(?:k|M|m|µ|n|G|c)?(?:N|Nm|m|s|h|V|A|W|J|Pa|K|Hz|Ω|\\Omega|m\/s|km\/h|m\/s²|m\/s\^2|rad\/s|kg|g|l|L|bar|%)(?![\p{L}\d])/gu;

const norm = (n: string) => n.replace(",", ".").replace(/^0+(?=\d)/, "").replace(/\.0+$/, "");

/** Les nombres de la question : les recopier n'est pas calculer. */
export function givenNumbers(question: string): Set<string> {
  return new Set((question.match(/\d+(?:[.,]\d+)?/g) ?? []).map(norm));
}

/**
 * Le premier résultat calculé d'une ligne, ou null.
 * « = 0 » n'en est pas un : c'est l'écriture d'un équilibre (ΣF = 0).
 */
export function computedResult(line: string, given: Set<string>): string | null {
  for (const m of line.matchAll(RESULT)) {
    const raw = m[1] ?? m[2];
    if (!raw) continue;
    const n = norm(raw);
    if (n === "0" || given.has(n)) continue;
    return m[0].trim();
  }
  return null;
}

/**
 * Ce que la ligne AFFIRME : sans balises (un `<path d="M 248,195 L 300,200">`
 * n'est pas « 195 litres ») et sans code en ligne. Les blocs de code entiers
 * sont écartés par l'appelant.
 */
export function assertedText(line: string): string {
  return line.replace(/`[^`\n]*`/g, " ").replace(/<[^<>]{0,2000}>/g, " ").replace(/<[A-Za-z?/][^<>]*$/, " ");
}

/* -------------------------------------------------------------------------- */
/* Appel d'outil imposé                                                       */
/* -------------------------------------------------------------------------- */

export interface ToolForce {
  /** Les seuls outils proposés tant que l'appel est imposé. */
  tools: string[];
  /** L'appel reste imposé tant qu'aucun de ceux-ci n'a été appelé. */
  until: string[];
}

/**
 * Réglages d'un pas de la boucle quand un appel d'outil est imposé :
 * `toolChoice: "required"` et outils limités, tant qu'aucun outil de `until`
 * n'a été appelé pendant ce tour. Ensuite la boucle redevient libre
 * (expliquer avec les chiffres de l'outil). Le modèle ne peut donc écrire
 * AUCUN texte avant son premier appel.
 */
export function forcedToolStep(priorToolNames: readonly string[], force: ToolForce | undefined): { toolChoice: "required"; activeTools: string[] } | null {
  if (!force || force.tools.length === 0) return null;
  if (priorToolNames.some((t) => force.until.includes(t))) return null;
  return { toolChoice: "required", activeTools: [...force.tools] };
}

/**
 * PREMIER essai d'une question de calcul (`mustCallToolFirst`) : un solveur,
 * ou l'une des trois sorties honnêtes —
 *   - `kein_loeser_vorhanden` : aucun solveur ne couvre la tâche, une donnée
 *     manque, ou la question est purement conceptuelle ;
 *   - `schaltplan_erfassen` : la netlist d'abord (lib/circuit/netlist.ts) ;
 *   - `suche_in_unterlagen` : lire l'énoncé dans le cours — mais l'appel
 *     reste imposé après une recherche, elle ne remplace pas le solveur.
 */
export function firstCallForce(): ToolForce {
  const solvers = [...SOLVER_TOOLS];
  return {
    tools: [...solvers, NO_SOLVER_TOOL, "schaltplan_erfassen", "suche_in_unterlagen"],
    until: [...solvers, NO_SOLVER_TOOL, "schaltplan_erfassen"],
  };
}

/** SECOND essai, après un blocage : un solveur, rien d'autre. */
export function retryForce(duty: string | null | undefined): ToolForce {
  const tools = solverToolsFor(duty);
  return { tools, until: tools };
}

/** Les solveurs proposés au second essai : ceux de la consigne, sinon tous. */
export function solverToolsFor(duty: string | null | undefined): string[] {
  const named = [...(duty ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).filter((t) => SOLVER_TOOLS.has(t));
  return named.length ? [...new Set(named)] : [...SOLVER_TOOLS];
}

export const SOLVER_RETRY_NOTE =
  "ABGEBROCHEN: Dein erster Versuch hat ein Ergebnis im Text ausgerechnet, ohne Werkzeug. Das ist gesperrt. " +
  "Ruf JETZT den passenden Löser auf (oder \"rechnen\" für Einzelschritte) und übernimm seine Zahlen wörtlich. " +
  "Fehlt eine Angabe, ruf trotzdem den Löser mit dem auf, was gegeben ist, und nenne danach, was fehlt.";

const NOTICE: Record<string, string> = {
  de: "Ich muss den Löser benutzen, um das Ergebnis zu garantieren. Einen Moment …",
  fr: "Je dois utiliser le solveur pour garantir le résultat. Un instant…",
  en: "I have to use the solver to guarantee the result. One moment…",
  es: "Debo usar el solucionador para garantizar el resultado. Un momento…",
};
export const solverNotice = (locale: string | undefined) => NOTICE[(locale ?? "de").slice(0, 2)] ?? NOTICE.de;

/* -------------------------------------------------------------------------- */
/* Le flux                                                                    */
/* -------------------------------------------------------------------------- */

type Chunk = { type: string; id?: string; delta?: string; toolName?: string; [k: string]: unknown };

export interface SolverGateOptions<C> {
  question: string;
  /** Faux = flux inchangé (question sans calcul, fast-path…). */
  enabled: boolean;
  locale?: string;
  /** Premier essai. */
  first: (signal: AbortSignal) => Promise<ReadableStream<C>>;
  /** Second essai, solveur imposé. */
  retry: (signal: AbortSignal) => Promise<ReadableStream<C>>;
  /** Appelé au blocage (journal, signalement). */
  onBlocked?: (info: { excerpt: string }) => void;
  /** Annulation par le client (navigateur fermé). */
  signal?: AbortSignal;
}

export interface SolverGateResult<C> {
  stream: ReadableStream<C>;
  /** Pour les tests et le journal : le premier essai a-t-il été coupé ? */
  blocked: () => boolean;
}

export function solverGateStream<C>(opts: SolverGateOptions<C>): SolverGateResult<C> {
  let wasBlocked = false;
  const firstAbort = new AbortController();
  const retryAbort = new AbortController();
  opts.signal?.addEventListener("abort", () => {
    firstAbort.abort();
    retryAbort.abort();
  });

  if (!opts.enabled) {
    const passthrough = new ReadableStream<C>({
      async start(controller) {
        const s = await opts.first(firstAbort.signal);
        const r = s.getReader();
        for (;;) {
          const { done, value } = await r.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      },
    });
    return { stream: passthrough, blocked: () => false };
  }

  const given = givenNumbers(opts.question);

  const stream = new ReadableStream<C>({
    async start(controller) {
      const emit = (c: Chunk) => controller.enqueue(c as unknown as C);
      let solverCalled = false;
      /** Texte retenu par bloc : la ligne en cours, pas encore vérifiée. */
      const pending = new Map<string, string>();
      const openText = new Set<string>();
      let stepOpen = false;
      let blockedExcerpt: string | null = null;

      /** Bloc de code ouvert (```svg, ```chart, ```python…) par bloc de texte : son contenu n'est pas lu. */
      const fences = new Map<string, string | null>();
      /** Envoie les lignes complètes et sûres ; renvoie l'extrait fautif sinon. */
      const release = (id: string, final: boolean): string | null => {
        const buf = pending.get(id) ?? "";
        const cut = final ? buf.length : buf.lastIndexOf("\n") + 1;
        if (cut <= 0) return null;
        const ready = buf.slice(0, cut);
        let fence = fences.get(id) ?? null;
        for (const line of ready.split("\n")) {
          const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] ?? null;
          if (fence) {
            if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
            continue;
          }
          if (mark) {
            fence = mark;
            continue;
          }
          const hit = computedResult(assertedText(line), given);
          if (hit) return line.trim().slice(0, 240) || hit;
        }
        fences.set(id, fence);
        pending.set(id, buf.slice(cut));
        emit({ type: "text-delta", id, delta: ready });
        return null;
      };

      const reader = (await opts.first(firstAbort.signal)).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const c = value as unknown as Chunk;

          if (solverCalled) {
            emit(c);
            continue;
          }
          if ((c.type === "tool-input-start" || c.type === "tool-input-available") && c.toolName && SOLVER_TOOLS.has(c.toolName)) {
            // Le texte retenu avant l'appel est une mise en équation : il passe.
            for (const [id, buf] of pending) if (buf) emit({ type: "text-delta", id, delta: buf });
            pending.clear();
            solverCalled = true;
            emit(c);
            continue;
          }
          if (c.type === "text-delta" && c.id) {
            pending.set(c.id, (pending.get(c.id) ?? "") + (c.delta ?? ""));
            blockedExcerpt = release(c.id, false);
          } else if (c.type === "text-end" && c.id) {
            blockedExcerpt = release(c.id, true);
            if (!blockedExcerpt) {
              openText.delete(c.id);
              emit(c);
            }
          } else if (c.type === "finish-step" || c.type === "finish") {
            for (const id of [...pending.keys()]) blockedExcerpt ??= release(id, true);
            if (!blockedExcerpt) {
              if (c.type === "finish-step") stepOpen = false;
              emit(c);
            }
          } else {
            if (c.type === "text-start" && c.id) openText.add(c.id);
            if (c.type === "start-step") stepOpen = true;
            emit(c);
          }
          if (blockedExcerpt) break;
        }
      } catch (err) {
        if (!blockedExcerpt) throw err;
      }

      if (!blockedExcerpt) {
        controller.close();
        return;
      }

      // ── Blocage ─────────────────────────────────────────────────────────
      wasBlocked = true;
      firstAbort.abort();
      reader.cancel().catch(() => {});
      opts.onBlocked?.({ excerpt: blockedExcerpt });
      for (const id of openText) emit({ type: "text-end", id });
      if (stepOpen) emit({ type: "finish-step" });
      const nid = "solver-gate";
      emit({ type: "start-step" });
      emit({ type: "text-start", id: nid });
      emit({ type: "text-delta", id: nid, delta: `${solverNotice(opts.locale)}\n\n` });
      emit({ type: "text-end", id: nid });
      emit({ type: "finish-step" });

      const second = (await opts.retry(retryAbort.signal)).getReader();
      for (;;) {
        const { done, value } = await second.read();
        if (done) break;
        // Un seul « start » par message : celui du premier essai.
        if ((value as unknown as Chunk).type === "start") continue;
        controller.enqueue(value);
      }
      controller.close();
    },
    cancel() {
      firstAbort.abort();
      retryAbort.abort();
    },
  });
  return { stream, blocked: () => wasBlocked };
}

/** La question passe-t-elle par le verrou ? */
export const solverGateEnabled = (question: string, fastPath: boolean) => !fastPath && needsSolver(question);
