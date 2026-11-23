/**
 * L'incrustation de l'avatar dans la vidéo de cours — les arguments de FFmpeg.
 *
 * Entrées : la vidéo de fond (les schémas animés, AVEC la voix et la musique)
 * et la vidéo de l'avatar (HeyGen). Les deux partent de t = 0 sur la même voix :
 * aucun décalage à calculer. Le son gardé est celui du fond ; celui de l'avatar
 * est jeté (ce serait la même voix une seconde fois).
 *
 * Ce module ne lance rien : il écrit la commande. Le script d'assemblage et les
 * tests l'appellent.
 */
export type AvatarLayout = "bubble" | "standing";
export type AvatarCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface CompositeInput {
  base: string;
  avatar: string;
  out: string;
  /** Taille de la vidéo de fond. */
  width: number;
  height: number;
  /** "green" : fond vert à retirer. "alpha" : WebM déjà transparent. */
  source: "green" | "alpha";
  /** "bubble" : pastille ronde sur disque de couleur. "standing" : l'avatar détouré, posé sur l'image. */
  layout?: AvatarLayout;
  corner?: AvatarCorner;
  /** Largeur de l'avatar, en part de la largeur de l'image (0,1 … 0,5). */
  size?: number;
  /** Marge au bord, en pixels de la vidéo de fond. */
  margin?: number;
  /** Le vert à retirer, et la couleur du disque de la pastille (hex RRGGBB). */
  keyColor?: string;
  discColor?: string;
  ringColor?: string;
  crf?: number;
}

const hex = (value: string | undefined, fallback: string) => (/^#?[0-9a-fA-F]{6}$/.test(value ?? "") ? value!.replace("#", "") : fallback).toUpperCase();
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Le graphe de filtres. Séparé pour être lu et testé seul. */
export function compositeFilter(input: CompositeInput): string {
  const layout = input.layout ?? "bubble";
  const corner = input.corner ?? "bottom-right";
  const share = Math.min(0.5, Math.max(0.1, input.size ?? (layout === "bubble" ? 0.17 : 0.26)));
  const margin = Math.max(0, Math.round(input.margin ?? input.width * 0.025));
  const side = even(input.width * share);
  const x = corner.endsWith("right") ? `W-w-${margin}` : `${margin}`;
  const y = corner.startsWith("bottom") ? `H-h-${layout === "standing" ? 0 : margin}` : `${margin}`;
  // Fond vert : on retire le vert, puis le reflet vert sur la peau et les cheveux.
  const keyed = input.source === "green" ? `chromakey=0x${hex(input.keyColor, "00FF00")}:0.14:0.08,despill=type=green,` : "";
  if (layout === "standing") return `[1:v]${keyed}format=yuva420p,scale=${side}:-2[av];[0:v][av]overlay=${x}:${y}:eof_action=pass,format=yuv420p[v]`;
  // Pastille : l'avatar recadré en carré (le haut du corps), masqué en rond, posé sur un disque avec un anneau.
  const ring = Math.max(4, Math.round(side * 0.03));
  const inner = side - 2 * ring;
  const r = inner / 2;
  const R = side / 2;
  const circle = (radius: number) => `if(lte(hypot(X-${radius},Y-${radius}),${radius}),255,0)`;
  return [
    `[1:v]${keyed}format=yuva420p,crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':0,scale=${inner}:${inner},geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lte(hypot(X-${r},Y-${r}),${r}),alpha(X,Y),0)'[face]`,
    `color=c=0x${hex(input.ringColor, "EAB308")}:s=${side}x${side}:r=30,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='${circle(R)}'[ring]`,
    `color=c=0x${hex(input.discColor, "0F172A")}:s=${inner}x${inner}:r=30,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='${circle(r)}'[disc]`,
    `[ring][disc]overlay=${ring}:${ring}:shortest=1[plate]`,
    `[plate][face]overlay=${ring}:${ring}:eof_action=pass:shortest=0[bubble]`,
    `[0:v][bubble]overlay=${x}:${y}:shortest=1,format=yuv420p[v]`,
  ].join(";");
}

/** Les arguments de `ffmpeg` (sans le nom du programme). Chemins passés tels quels : aucun shell. */
export function compositeArgs(input: CompositeInput): string[] {
  return [
    "-y",
    "-i",
    input.base,
    // Un WebM transparent de HeyGen est en VP9 : sans ce décodeur, FFmpeg ignore le canal alpha.
    ...(input.source === "alpha" ? ["-c:v", "libvpx-vp9"] : []),
    "-i",
    input.avatar,
    "-filter_complex",
    compositeFilter(input),
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    String(input.crf ?? 18),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    input.out,
  ];
}
