/**
 * Comparaison de texte pour la recherche — sans dépendance, testable seule.
 *
 * Le problème central est l'allemand. SQLite ne connaît pas la casse Unicode :
 * `lower('Übung')` renvoie `'Übung'`, inchangé. Une recherche « übung » ne
 * trouverait donc jamais « Übung » en début de phrase, c'est-à-dire le cas le
 * plus fréquent. Et un étudiant qui tape vite écrit « ubung » ou « uebung ».
 *
 * On replie donc le texte AVANT de comparer : minuscules, ä→ae, ö→oe, ü→ue,
 * ß→ss, puis suppression des accents restants. « Übung », « übung », « Uebung »
 * et « ueBUNG » deviennent tous « uebung ».
 *
 * Le repliement change la longueur de la chaîne (un caractère devient deux),
 * donc une position dans le texte replié ne désigne plus la même lettre dans le
 * texte d'origine. `foldWithMap` conserve la correspondance : c'est ce qui
 * permet de découper un extrait lisible, avec les vraies lettres.
 */

const UMLAUTS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};

/** Version repliée d'une chaîne. Comparaison uniquement — ne jamais afficher. */
export function fold(s: string): string {
  return foldWithMap(s).folded;
}

/**
 * Replie la chaîne et renvoie, pour chaque caractère du résultat, l'index du
 * caractère d'origine dont il provient.
 */
export function foldWithMap(s: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];

  for (let i = 0; i < s.length; i++) {
    const lower = s[i]!.toLowerCase();
    const expanded = UMLAUTS[lower];

    if (expanded) {
      for (const ch of expanded) {
        folded += ch;
        map.push(i);
      }
      continue;
    }

    // Décomposition Unicode : « é » devient « e » + accent, on jette l'accent.
    const stripped = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (stripped === "") {
      // Le caractère n'était QU'un accent combinant. Il disparaît sans laisser
      // de trace dans le résultat — donc rien à ajouter à la table.
      continue;
    }

    for (const ch of stripped) {
      folded += ch;
      map.push(i);
    }
  }

  return { folded, map };
}

/** Échappe les jokers SQL pour qu'un `%` tapé par l'utilisateur reste littéral. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Variantes d'écriture à donner à SQL pour dégrossir.
 *
 * SQL ne sait pas replier ; il sert juste à écarter les lignes évidemment sans
 * rapport avant que TypeScript ne tranche. On lui donne donc les orthographes
 * qui couvrent la quasi-totalité des cas réels : telle quelle, tout en
 * minuscules, tout en majuscules, et avec l'initiale en majuscule.
 *
 * Limite assumée : taper « ubung » sans tréma ne trouvera pas « Übung » DANS LE
 * CORPS d'un PDF (les titres, eux, sont comparés en TypeScript, donc repliés).
 * Corriger cela demanderait une colonne repliée en base et une reprise de tout
 * l'existant — un coût sans rapport avec le gain.
 */
export function likeVariants(needle: string): string[] {
  const base = needle.trim();
  if (!base) return [];

  const out = new Set<string>([
    base,
    base.toLowerCase(),
    base.toUpperCase(),
    base.charAt(0).toUpperCase() + base.slice(1).toLowerCase(),
  ]);

  return [...out].map(escapeLike);
}

/** Le texte contient-il vraiment la recherche, une fois les deux repliés ? */
export function matches(haystack: string, needle: string): boolean {
  const n = fold(needle);
  if (!n) return false;
  return fold(haystack).includes(n);
}

/**
 * Extrait lisible autour de la première occurrence.
 *
 * Renvoie `null` si le mot n'est pas là — l'appelant sait alors que le filtre
 * SQL a laissé passer une ligne sans rapport, et l'écarte.
 */
export function snippet(
  text: string,
  needle: string,
  radius = 80,
): { text: string; start: number; end: number } | null {
  const n = fold(needle);
  if (!n) return null;

  const { folded, map } = foldWithMap(text);
  const at = folded.indexOf(n);
  if (at === -1) return null;

  // Retour aux positions du texte d'origine.
  const start = map[at] ?? 0;
  const lastIdx = map[at + n.length - 1] ?? start;
  const end = lastIdx + 1;

  let from = Math.max(0, start - radius);
  let to = Math.min(text.length, end + radius);

  // On recule jusqu'à un espace pour ne pas couper un mot en deux.
  if (from > 0) {
    const space = text.lastIndexOf(" ", from);
    if (space > from - 24) from = space + 1;
  }
  if (to < text.length) {
    const space = text.indexOf(" ", to);
    if (space !== -1 && space < to + 24) to = space;
  }

  const body = text.slice(from, to).replace(/\s+/g, " ").trim();
  const out = (from > 0 ? "… " : "") + body + (to < text.length ? " …" : "");

  // Position du mot DANS l'extrait final. On refait la recherche sur l'extrait
  // lui-même plutôt que de reporter les positions du texte d'origine : les
  // espaces qu'on vient de réduire décaleraient tout le reste.
  const inner = foldWithMap(out);
  const hit = inner.folded.indexOf(n);
  const hStart = hit === -1 ? 0 : (inner.map[hit] ?? 0);
  const hEnd = hit === -1 ? 0 : (inner.map[hit + n.length - 1] ?? hStart) + 1;

  return { text: out, start: hStart, end: hEnd };
}

/**
 * Note de pertinence. Plus c'est haut, plus c'est remonté.
 *
 * Un titre l'emporte toujours sur le corps : quand on cherche « Biegemoment »
 * et qu'un document s'appelle « Biegemoment », c'est lui qu'on veut, pas la
 * page 47 d'un autre polycopié qui prononce le mot une fois.
 */
export function scoreHit(opts: {
  /** Le titre contient la recherche. */
  title: boolean;
  /** Le titre EST la recherche (aux espaces et à la casse près). */
  exactTitle: boolean;
  /** Le corps contient la recherche. */
  body: boolean;
  /** Ancienneté en jours. */
  ageDays: number;
}): number {
  let score = 0;
  if (opts.exactTitle) score += 100;
  else if (opts.title) score += 60;
  if (opts.body) score += 20;

  // La fraîcheur départage, elle ne renverse pas : au maximum 15 points, soit
  // moins que l'écart entre un titre et un corps de texte.
  score += Math.max(0, 15 - opts.ageDays / 7);

  return score;
}
