import type { Specialization } from "./types";

/** Kompressible Strömungen (Gasdynamik) — Machzahl, Verdichtungsstöße, Lavaldüse, Fanno/Rayleigh. */
export const compressible_flow: Specialization = {
  id: "compressible_flow",
  subdomain: "fluid_dynamics",
  label: "Kompressible Strömungen (Gasdynamik)",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(verdichtungsstoß|verdichtungsstoss|senkrechte[rn]? stoß|schräge[rn]? stoß|stoßwelle|shock wave|normal shock|oblique shock|onde de choc)\b/u, 3],
    [/\b(lavaldüse|laval[- ]düse|de laval|tuyère)\b/u, 3],
    [/\b(fanno|rayleigh[- ]strömung|rayleigh flow|prandtl[- ]meyer)\b/u, 3],
    [/\b(kompressible[nrs]?|kompressibilität|compressible|gasdynamik)\b/u, 2],
    [/\b(machzahl|mach[- ]zahl|mach number|nombre de mach|überschall|supersonic|supersonique|transsonisch|transonic|hyperschall)\b/u, 2],
    [/\bma\s*=\s*\d/u, 2],
    [/\b(ruhegrößen|ruhedruck|ruhetemperatur|schallgeschwindigkeit)\b/u, 1],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
