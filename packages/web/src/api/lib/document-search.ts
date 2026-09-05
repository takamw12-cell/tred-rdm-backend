import { selectRelevantContext, type SourceDoc } from "./retrieval";

/**
 * La recherche que le tuteur fait LUI-MÊME.
 *
 * ── Le défaut que ça corrige ──────────────────────────────────────────────
 *
 * Jusqu'ici, le serveur choisissait à la place du modèle. `selectRelevantContext`
 * prenait la question, la passait au travers d'un BM25 purement lexical, et
 * livrait 24 000 caractères sur les 88 000 du cours — soit un quart, choisi par
 * correspondance de mots exacts.
 *
 * Le mode d'échec n'est pas subtil. Un étudiant écrit « erkläre mir die
 * Maschengleichung ». Si le polycopié dit « Kirchhoffsche Regeln » ou
 * « Maschenregel », BM25 ne trouve rien : ces mots ne sont pas dans la
 * question. Le tuteur reçoit alors les débuts de documents, ne voit pas le
 * passage, et répond de mémoire générale. L'étudiant, lui, voit un professeur
 * qui n'a pas lu son cours.
 *
 * Le modèle, contrairement à BM25, SAIT que Maschengleichung, Maschenregel et
 * Kirchhoff parlent de la même chose. Le laisser formuler la recherche lui-même
 * — et la reformuler quand elle ne donne rien — supprime toute la classe de
 * pannes liées au vocabulaire.
 *
 * ── Pourquoi on ne remplace pas BM25 ──────────────────────────────────────
 *
 * Le classement lexical reste très bon quand les mots CORRESPONDENT, et il est
 * gratuit, instantané, sans clé d'API. Ce qui change, c'est qui écrit la
 * requête : le modèle, qui peut essayer « Kirchhoff », puis « Maschenregel »,
 * puis « Knotenpunkt ». Des embeddings feraient mieux encore, mais demanderaient
 * un service, une clé, un stockage vectoriel et une réindexation — pour un gain
 * qui vient surtout de cette boucle-là.
 */

/** Une trouvaille, telle que le modèle la reçoit. */
export interface Passage {
  document: string;
  kind: string;
  extrait: string;
}

/**
 * Budget par recherche.
 *
 * Plus étroit que le contexte initial (24 000) et pour une raison : le modèle
 * peut chercher plusieurs fois dans un même tour. Trois recherches à 8 000
 * caractères tiennent dans la même enveloppe qu'un seul contexte, mais elles
 * portent sur trois angles différents — ce qui vaut bien mieux qu'un gros bloc
 * choisi une fois pour toutes.
 */
const BUDGET_PAR_RECHERCHE = 8_000;

/** Au-delà, la réponse noie le modèle plus qu'elle ne l'informe. */
const MAX_PASSAGES = 6;

/**
 * Cherche `requete` dans `docs`, éventuellement limité à un document.
 *
 * Le filtre par titre est volontairement tolérant : le modèle écrira
 * « Skript Kapitel 3 » là où le fichier s'appelle
 * « ET2_Skript_Kapitel3_final.pdf ». Une correspondance exacte ne trouverait
 * jamais rien, et le modèle conclurait que le document n'existe pas — la
 * panne du 3 septembre, à nouveau.
 */
export function chercherDansDocuments(
  docs: SourceDoc[],
  requete: string,
  titre?: string,
): Passage[] {
  const corpus = titre?.trim() ? filtrerParTitre(docs, titre) : docs;
  if (corpus.length === 0) return [];

  const { sources } = selectRelevantContext(corpus, requete, BUDGET_PAR_RECHERCHE);

  return sources
    .filter((s) => s.content.trim().length > 0)
    .slice(0, MAX_PASSAGES)
    .map((s) => ({
      document: s.title,
      kind: s.kind,
      extrait: s.content.trim(),
    }));
}

/**
 * Les documents dont le titre ressemble à `titre`.
 *
 * On compare sur les mots, pas sur la chaîne entière : « Kapitel 3 » doit
 * atteindre « ET2_Skript_Kapitel3_final ». Si rien ne ressemble, on renvoie
 * TOUT le corpus plutôt que rien — chercher trop large donne une réponse
 * imparfaite, chercher dans le vide donne « je ne le trouve pas ».
 */
function filtrerParTitre(docs: SourceDoc[], titre: string): SourceDoc[] {
  const mots = normaliser(titre)
    .split(" ")
    .filter((m) => m.length >= 3);
  if (mots.length === 0) return docs;

  const retenus = docs.filter((d) => {
    const cible = normaliser(d.title);
    return mots.some((m) => cible.includes(m));
  });

  return retenus.length > 0 ? retenus : docs;
}

/** Minuscules, sans accents, sans ponctuation, chiffres détachés. */
function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // « Kapitel3 » doit donner « kapitel 3 » : sinon le mot « kapitel » seul
    // ne correspond pas au titre collé du fichier.
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
