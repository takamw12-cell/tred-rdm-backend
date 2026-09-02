/**
 * Enrichissement des réponses du tuteur.
 *
 * ── Ce que ce fichier répare ──────────────────────────────────────────────
 *
 * Deux composants finis dormaient dans le dépôt sans être importés nulle part :
 * `dictionary-tooltip.tsx` et `source-citation.tsx`. Ce sont exactement les
 * deux choses qui séparent TRED d'un ChatGPT généraliste :
 *
 *   · le terme technique allemand, souligné, qui donne sa traduction et sa
 *     définition au survol — la promesse trilingue, rendue visible ;
 *   · la page du Skript d'où vient la réponse — la preuve que le tuteur a lu
 *     TES documents et n'a pas improvisé.
 *
 * Le tuteur produisait déjà les deux : il écrit les termes en allemand, et son
 * instruction lui demande de citer « → Skript, Seite 12 ». Rien ne les
 * regardait. Cette phrase de citation s'affichait comme du texte ordinaire,
 * noyée en fin de paragraphe.
 *
 * ── Pourquoi un greffon rehype ────────────────────────────────────────────
 *
 * Parce qu'il travaille sur l'arbre APRÈS l'analyse du markdown. Il voit donc
 * les nœuds de texte un par un, et il sait dans quel élément il se trouve —
 * ce qui permet de ne jamais toucher au code, aux formules KaTeX ni aux liens.
 * Une substitution faite sur le texte brut avant analyse casserait une formule
 * contenant le mot « Spannung », ou un nom de variable dans un bloc MATLAB.
 *
 * ── Comment le résultat remonte jusqu'à React ─────────────────────────────
 *
 * Le greffon n'invente pas de balise : il pose des `<span>` porteurs de
 * `data-tred-*`. `markdown-content.tsx` intercepte `span` et regarde ces
 * attributs. Une balise inventée serait à la merci du prochain assainisseur ;
 * un `span` avec des données, non.
 */

import { terms } from "@/data/dictionary";

/**
 * Les noms des marques, définis ICI et importés par le rendu.
 *
 * hast nomme ses propriétés en camel — `dataTredTerm`, pas `data-tred-term`.
 * Écrire la forme à tirets produit un arbre correct en apparence et un
 * composant qui ne reconnaît jamais rien : la marque est posée, personne ne la
 * lit. Une constante partagée rend l'erreur impossible.
 */
export const MARK = {
  term: "dataTredTerm",
  cite: "dataTredCite",
  doc: "dataTredDoc",
  page: "dataTredPage",
} as const;

/* ── Types hast, réduits à ce dont on se sert ────────────────────────────── */

interface TextNode {
  type: "text";
  value: string;
}
interface ElementNode {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}
interface RootNode {
  type: "root";
  children?: Node[];
}
type Node = TextNode | ElementNode | RootNode | { type: string; children?: Node[] };

function isText(node: Node): node is TextNode {
  return node.type === "text" && typeof (node as TextNode).value === "string";
}
function isElement(node: Node): node is ElementNode {
  return node.type === "element";
}

/* ── Là où l'on ne touche à rien ─────────────────────────────────────────── */

/**
 * Le code garde ses mots tels quels : `Spannung` peut être un nom de variable.
 * Les liens ont déjà un rôle au clic — en superposer un second est un piège.
 * Les titres restent nets. Et KaTeX reconstruit son sous-arbre à sa façon :
 * y insérer un `span` casse le rendu de la formule.
 */
const OPAQUE = new Set(["code", "pre", "script", "style", "a", "h1", "h2", "h3", "h4"]);

function isOpaque(node: ElementNode): boolean {
  if (OPAQUE.has(node.tagName)) return true;
  const cls = node.properties?.className;
  const list = Array.isArray(cls) ? cls : typeof cls === "string" ? cls.split(/\s+/) : [];
  return list.some((c) => String(c).startsWith("katex") || String(c) === "math");
}

/* ── 1 · La citation de source ───────────────────────────────────────────── */

/**
 * « → Skript TM2, Seite 12 ».
 *
 * La flèche est ce que l'instruction du tuteur lui fait écrire. On accepte
 * aussi les formes des autres langues, parce que la réponse est rédigée dans
 * la langue de l'étudiant même quand les termes restent allemands.
 *
 * Le titre est borné à quatre-vingts caractères : sans cette borne, une
 * réponse contenant une flèche décorative avalerait le paragraphe entier
 * jusqu'à la première virgule suivie d'un nombre.
 */
const CITE_RE =
  /→\s*([^,\n]{1,80}?)\s*,\s*(?:Seite|S\.|page|Page|página|pagina|pagina|стр\.|页)\s*(\d{1,4})/g;

/* ── 2 · Les termes techniques ───────────────────────────────────────────── */

/**
 * Les termes, du plus long au plus court.
 *
 * L'ordre compte : « Biegemoment » doit gagner contre « Moment », sinon on
 * souligne la moitié du mot et le lien renvoie vers la mauvaise définition.
 */
const SORTED = [...terms]
  .map((t) => ({ id: t.id, term: t.term }))
  .sort((a, b) => b.term.length - a.term.length);

/** `\b` ne fonctionne pas devant « Ä » : on borne à la main sur les lettres. */
const LETTER = "A-Za-zÄÖÜäöüßÀ-ÿ";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TERM_RE = new RegExp(
  `(?<![${LETTER}])(${SORTED.map((t) => escapeRe(t.term)).join("|")})(?![${LETTER}])`,
  "g",
);

const TERM_ID = new Map(SORTED.map((t) => [t.term, t.id]));

/* ── Le greffon ──────────────────────────────────────────────────────────── */

function span(props: Record<string, unknown>, children: Node[]): ElementNode {
  return { type: "element", tagName: "span", properties: props, children };
}

/**
 * Découpe un texte en nœuds, en marquant citations et termes.
 *
 * `seen` porte les termes déjà soulignés dans CETTE réponse. Souligner les
 * onze occurrences de « Querkraft » d'une explication transforme le paragraphe
 * en champ de pointillés et rend le repère inutile : ce qui est partout ne se
 * remarque nulle part. La première suffit — c'est là que l'étudiant butera.
 */
function splitText(value: string, seen: Set<string>): Node[] {
  const out: Node[] = [];
  let rest = value;

  // Les citations d'abord : elles emportent un fragment entier, termes
  // compris. Les chercher après aurait laissé un `span` à cheval.
  let last = 0;
  const pieces: Node[] = [];
  CITE_RE.lastIndex = 0;
  for (const m of rest.matchAll(CITE_RE)) {
    const at = m.index ?? 0;
    if (at > last) pieces.push({ type: "text", value: rest.slice(last, at) });
    pieces.push(
      span(
        {
          [MARK.cite]: "1",
          [MARK.doc]: (m[1] ?? "").trim(),
          [MARK.page]: m[2] ?? "",
        },
        [],
      ),
    );
    last = at + m[0].length;
  }
  if (pieces.length === 0) {
    pieces.push({ type: "text", value: rest });
  } else if (last < rest.length) {
    pieces.push({ type: "text", value: rest.slice(last) });
  }

  // Puis les termes, dans les morceaux de texte restants.
  for (const piece of pieces) {
    if (!isText(piece)) {
      out.push(piece);
      continue;
    }
    rest = piece.value;
    let cursor = 0;
    TERM_RE.lastIndex = 0;
    for (const m of rest.matchAll(TERM_RE)) {
      const word = m[1] ?? "";
      const id = TERM_ID.get(word);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const at = m.index ?? 0;
      if (at > cursor) out.push({ type: "text", value: rest.slice(cursor, at) });
      out.push(span({ [MARK.term]: id }, [{ type: "text", value: word }]));
      cursor = at + word.length;
    }
    if (cursor < rest.length) out.push({ type: "text", value: rest.slice(cursor) });
  }

  return out;
}

/** Y a-t-il seulement quelque chose à faire ? Évite de reconstruire pour rien. */
function worthVisiting(value: string): boolean {
  return value.includes("→") || TERM_RE.test(value.replace(/\s+/g, " "));
}

/**
 * Le greffon rehype.
 *
 * Une instance par rendu : le `Set` des termes déjà vus doit se vider entre
 * deux réponses, sinon la deuxième réponse d'une conversation n'aurait plus
 * un seul terme souligné.
 */
export function rehypeEnrich() {
  return function transform(tree: Node): void {
    const seen = new Set<string>();

    function walk(node: Node): void {
      const children = (node as { children?: Node[] }).children;
      if (!children || children.length === 0) return;
      if (isElement(node) && isOpaque(node)) return;

      const next: Node[] = [];
      let changed = false;

      for (const child of children) {
        if (isText(child)) {
          TERM_RE.lastIndex = 0;
          if (!worthVisiting(child.value)) {
            next.push(child);
            continue;
          }
          const parts = splitText(child.value, seen);
          if (parts.length === 1 && isText(parts[0]!) && parts[0]!.value === child.value) {
            next.push(child);
            continue;
          }
          next.push(...parts);
          changed = true;
          continue;
        }
        walk(child);
        next.push(child);
      }

      if (changed) (node as { children?: Node[] }).children = next;
    }

    walk(tree);
  };
}

/* Exportés pour les tests — la logique doit être vérifiable sans arbre hast. */
export const __test = { CITE_RE, TERM_RE, splitText, isOpaque };
