import { createContext } from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Citations du tuteur, côté navigateur.
 *
 * Le tuteur cite avec [[QUELLE doc="<Titel>" seite=<n>]]phrase[[/QUELLE]].
 * Chaque citation devient un badge « Titel, S. 12 ». Le serveur la vérifie
 * contre les documents de l'étudiant (POST /api/documents/citations/verify,
 * voir api/lib/citations.ts) : le badge n'ouvre le PDF que sur un document
 * qui existe, à une page qui existe — la vraie, si le tuteur s'est trompé.
 */

export interface Citation {
  /** La phrase citée, mot pour mot. */
  excerpt: string;
  /** `doc="…"`, tel qu'écrit par le tuteur. */
  docTitle: string | null;
  /** `seite=n`, tel qu'écrit par le tuteur. */
  page: number | null;
  /** Le marqueur est refermé : la citation est complète (une réponse en cours d'écriture ne l'est pas encore). */
  closed: boolean;
}

// [[QUELLE doc="Titel" seite=12]]exact excerpt[[/QUELLE]]  (attrs optional)
// Tolerant gegenüber Groß-/Kleinschreibung, Leerzeichen und fehlendem
// Schlusstag — ein Modell schreibt Marker nicht immer perfekt, und eine roh
// sichtbare Marker-Zeile im Text ist für die Studierenden schlicht kaputt.
export const CITE_RE = /\[\[\s*QUELLE([^\]]*)\]\]([\s\S]*?)(\[\[\s*\/\s*QUELLE\s*\]\]|$)/gi;

/** `doc="Thermo_Kapitel_3" seite=12` → titre et page. Guillemets droits ou typographiques, page entre guillemets ou non. */
export function parseCitationAttrs(attrs: string): { docTitle: string | null; page: number | null } {
  // Guillemets droits, anglais (“ ”) ou allemands („ “).
  const DOC = /doc\s*=\s*["“„]([^"“”„]*)["“”]/i;
  const doc = DOC.exec(attrs);
  // La page se lit HORS du titre : « Skript Seite=3 » dans un titre n'est pas une page.
  const page = /(?:seite|page)\s*=\s*["“„]?\s*(\d{1,5})/i.exec(attrs.replace(DOC, " "));
  const n = page ? Number(page[1]) : null;
  return { docTitle: doc?.[1]?.trim() || null, page: n !== null && n > 0 ? n : null };
}

/** Retire les marqueurs d'un bloc et rend ses citations, dans l'ordre. */
export function extractCitations(text: string, strip: (s: string) => string = (s) => s): { clean: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const clean = text.replace(CITE_RE, (_full, attrs: string, body: string, end: string) => {
    const excerpt = body.trim();
    if (excerpt) citations.push({ excerpt, ...parseCitationAttrs(attrs), closed: Boolean(end) });
    return "";
  });
  return { clean: strip(clean).trim(), citations };
}

/* ── Vérification ─────────────────────────────────────────────────────── */

export type CitationStatus = "verified" | "page_corrected" | "quote_not_found" | "unknown_document";

export interface CitationVerdict {
  status: CitationStatus;
  documentId: string | null;
  title: string | null;
  page: number | null;
  citedPage: number | null;
  /** L'original est conservé. */
  original: boolean;
  /** L'original est un PDF : lisible page par page dans le lecteur. */
  pdf: boolean;
}

/** La portée de la conversation : celle de la question posée. */
export interface CitationScope {
  documentId?: string | null;
  subjectId?: string | null;
  semesterId?: string | null;
}

export interface CitationTarget {
  documentId: string;
  page: number | null;
  excerpt: string;
}

/**
 * Fourni par la page qui possède la visionneuse (le chat / le Hörsaal).
 * `null` ailleurs : les citations restent alors de simples mentions.
 */
export const CitationContext = createContext<{ scope: CitationScope; open: (target: CitationTarget) => void } | null>(null);

/** Bornes de la route (api/index.ts). */
const MAX_PER_CALL = 12;
const MAX_EXCERPT = 2000;

/**
 * Vérifie les citations COMPLÈTES d'un bloc — une fois : la réponse est gardée
 * tant que l'onglet vit. Rend un verdict par citation (dans le même ordre), ou
 * `undefined` pour celles qui ne sont pas encore vérifiées.
 */
export function useCitationChecks(citations: readonly Citation[], scope: CitationScope | null | undefined): { verdicts: (CitationVerdict | undefined)[]; pending: boolean; failed: boolean } {
  const closed = citations.map((c, index) => ({ c, index })).filter((x) => x.c.closed).slice(0, MAX_PER_CALL);
  const payload = closed.map(({ c }) => ({ doc: c.docTitle, page: c.page, excerpt: c.excerpt.slice(0, MAX_EXCERPT) }));
  const query = useQuery({
    queryKey: ["citation-check", scope?.documentId ?? null, scope?.subjectId ?? null, scope?.semesterId ?? null, payload],
    enabled: Boolean(scope) && payload.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch("/api/documents/citations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citations: payload, documentId: scope?.documentId ?? null, subjectId: scope?.subjectId ?? null, semesterId: scope?.semesterId ?? null }),
      });
      if (!res.ok) throw new Error(`citations ${res.status}`);
      return ((await res.json()) as { results: CitationVerdict[] }).results;
    },
  });
  const verdicts: (CitationVerdict | undefined)[] = citations.map(() => undefined);
  closed.forEach(({ index }, k) => {
    verdicts[index] = query.data?.[k];
  });
  return { verdicts, pending: query.isLoading, failed: query.isError };
}
