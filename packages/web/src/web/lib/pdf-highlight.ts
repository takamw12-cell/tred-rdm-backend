/**
 * Surligner la phrase citée dans le PDF (2026-11-15).
 *
 * pdf.js rend le texte d'une page en « éléments » : un bout de ligne chacun,
 * avec sa position sur la page. Deux fonctions pures :
 *
 *   excerptItemRange  quels éléments couvrent la phrase citée — et où elle
 *                     commence dans le premier, où elle finit dans le dernier ;
 *   markBoxes         les rectangles à poser sur la page affichée.
 *
 * La comparaison ne garde que lettres et chiffres : une césure en fin de
 * ligne (« Wärme- / menge »), la casse, la ponctuation et les espaces ne
 * comptent pas. Si la phrase n'est pas mot pour mot dans la page — le tuteur a
 * recopié une formule en LaTeX — son début et sa fin suffisent à la situer.
 * Trop courte ou introuvable : rien n'est surligné, plutôt qu'un bout au hasard.
 */

export interface PdfTextItem {
  str: string;
  /** Matrice du texte dans l'espace de la page : [a, b, c, d, x, y], y vers le haut, (x, y) sur la ligne de base. */
  transform: number[];
  width: number;
  height: number;
}

export interface ExcerptRange {
  from: number;
  to: number;
  /** Où la phrase commence dans le premier élément (0 = au début). */
  fromFraction: number;
  /** Où elle finit dans le dernier élément (1 = à la fin). */
  toFraction: number;
}

export interface MarkBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** En dessous (lettres et chiffres), on ne cherche pas : trois mots se retrouvent partout. */
const MIN_CHARS = 12;
const EDGE_CHARS = 40;

const norm = (s: string) => s.normalize("NFKC").toLocaleLowerCase("de").replace(/[^\p{L}\p{N}]+/gu, "");

export function excerptItemRange(items: readonly { str: string }[], excerpt: string): ExcerptRange | null {
  const needle = norm(excerpt ?? "");
  if (needle.length < MIN_CHARS) return null;

  // Le texte de la page d'un seul tenant, et pour chaque caractère : son élément.
  let hay = "";
  const owner: number[] = [];
  const starts: number[] = [];
  const lengths: number[] = [];
  items.forEach((it, i) => {
    const n = norm(it?.str ?? "");
    starts[i] = hay.length;
    lengths[i] = n.length;
    hay += n;
    for (let k = 0; k < n.length; k++) owner.push(i);
  });
  if (hay.length < MIN_CHARS) return null;

  let start = hay.indexOf(needle);
  let end = start === -1 ? -1 : start + needle.length - 1;
  if (start === -1) {
    // Pas mot pour mot : on situe la phrase par son début, puis par sa fin si elle suit de près.
    const edge = Math.min(EDGE_CHARS, Math.floor(needle.length / 2));
    if (edge < MIN_CHARS) return null;
    const head = hay.indexOf(needle.slice(0, edge));
    if (head === -1) return null;
    // Aussi loin que la page suit la phrase, caractère par caractère…
    let common = edge;
    while (common < needle.length && head + common < hay.length && hay[head + common] === needle[common]) common++;
    // … et jusqu'à sa fin, si on la retrouve un peu plus loin (une formule réécrite au milieu).
    const tailPart = needle.slice(-edge);
    const tail = hay.indexOf(tailPart, head + 1);
    const tailEnd = tail !== -1 && tail - head <= needle.length * 1.5 ? tail + tailPart.length - 1 : -1;
    start = head;
    end = Math.max(head + common - 1, tailEnd);
  }

  const from = owner[start]!;
  const to = owner[end]!;
  const fraction = (index: number, item: number) => (lengths[item]! > 0 ? Math.min(1, Math.max(0, (index - starts[item]!) / lengths[item]!)) : 0);
  return { from, to, fromFraction: fraction(start, from), toFraction: fraction(end + 1, to) };
}

/**
 * Les rectangles de surlignage, dans les coordonnées de la page AFFICHÉE.
 * `toViewport` convertit deux coins [x1, y1, x2, y2] de l'espace de la page (voir pdf-viewer.tsx).
 * Un rectangle par élément ; le premier et le dernier sont rognés à la phrase
 * (au prorata des caractères : exact pour une police à chasse fixe, proche sinon).
 */
export function markBoxes(items: readonly PdfTextItem[], range: ExcerptRange, toViewport: (rect: number[]) => number[]): MarkBox[] {
  const boxes: MarkBox[] = [];
  for (let i = range.from; i <= range.to; i++) {
    const it = items[i];
    if (!it || !it.str?.trim() || !(it.width > 0)) continue;
    const x = Number(it.transform?.[4]);
    const y = Number(it.transform?.[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    // Hauteur du texte : celle de l'élément, sinon l'échelle verticale de sa matrice, sinon 10 points.
    const scaleY = Math.hypot(Number(it.transform?.[2]) || 0, Number(it.transform?.[3]) || 0);
    const h = it.height > 0 ? it.height : scaleY > 0 ? scaleY : 10;
    const a = i === range.from ? range.fromFraction : 0;
    const b = i === range.to ? range.toFraction : 1;
    if (b - a <= 0) continue;
    // Autour de la ligne de base : un peu dessous (jambages), l'essentiel dessus.
    const [x1, y1, x2, y2] = toViewport([x + it.width * a, y - h * 0.24, x + it.width * b, y + h * 0.9]);
    const box = { left: Math.min(x1!, x2!), top: Math.min(y1!, y2!), width: Math.abs(x2! - x1!), height: Math.abs(y2! - y1!) };
    if (box.width > 0 && box.height > 0 && Number.isFinite(box.left + box.top)) boxes.push(box);
  }
  return boxes;
}
