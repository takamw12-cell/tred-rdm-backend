/**
 * Orbitales atomiques de type hydrogène (2026-11-16) : les nuages de points de
 * l'atome de l'Explorateur sont TIRÉS de la densité de probabilité |ψ|², pas
 * dessinés à la main.
 *
 * Longueurs en unités de a (rayon de Bohr divisé par la charge effective).
 * Facteurs de normalisation omis : seule la FORME compte pour le tirage.
 *   1s   |ψ|² ∝ e^(−2r)
 *   2s   |ψ|² ∝ (2 − r)² · e^(−r)          — nœud radial à r = 2
 *   2p   |ψ|² ∝ (r·cos θ)² · e^(−r)        — plan nodal perpendiculaire à l'axe
 * Module pur, testé (tests/orbitals.test.ts).
 */
export type OrbitalKind = "1s" | "2s" | "2px" | "2pz";

export function orbitalDensity(kind: OrbitalKind, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z);
  if (kind === "1s") return Math.exp(-2 * r);
  if (kind === "2s") return (2 - r) ** 2 * Math.exp(-r);
  const along = kind === "2px" ? x : z;
  return along * along * Math.exp(-r);
}

/** Le maximum de chaque densité (pour le tirage par rejet) : 1s et 2s à l'origine, 2p à r = 2 sur son axe. */
const PEAK: Record<OrbitalKind, number> = { "1s": 1, "2s": 4, "2px": 4 * Math.exp(-2), "2pz": 4 * Math.exp(-2) };

/** Générateur pseudo-aléatoire à graine (mulberry32) : le même nuage à chaque visite. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` points tirés selon |ψ|² (tirage par rejet), dans la sphère de rayon
 * `maxR` (en unités de a), puis mis à l'échelle de la scène : un point = une
 * position où l'on trouverait l'électron.
 */
export function sampleOrbital(kind: OrbitalKind, count: number, scale: number, maxR: number, seed: number): Float32Array {
  const rand = seeded(seed);
  const out = new Float32Array(count * 3);
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 4000) {
    const [x, y, z] = [(rand() * 2 - 1) * maxR, (rand() * 2 - 1) * maxR, (rand() * 2 - 1) * maxR];
    if (x * x + y * y + z * z > maxR * maxR) continue;
    if (rand() * PEAK[kind] > orbitalDensity(kind, x, y, z)) continue;
    out.set([x * scale, y * scale, z * scale], n * 3);
    n += 1;
  }
  return out;
}

/**
 * Les orbitales occupées du carbone (1s² 2s² 2p²), telles que la scène les
 * dessine. Échelles choisies pour la lisibilité : les tailles relatives ne
 * sont PAS à l'échelle (le texte du modèle le dit).
 */
export const ORBITALS: { kind: OrbitalKind; count: number; scale: number; maxR: number; color: string; part: "k-shell" | "valence" }[] = [
  { kind: "1s", count: 1500, scale: 0.34, maxR: 4, color: "#FDE68A", part: "k-shell" },
  { kind: "2s", count: 1800, scale: 0.2, maxR: 11.5, color: "#93C5FD", part: "valence" },
  { kind: "2px", count: 1700, scale: 0.26, maxR: 9, color: "#38BDF8", part: "valence" },
  { kind: "2pz", count: 1700, scale: 0.26, maxR: 9, color: "#C4B5FD", part: "valence" },
];
