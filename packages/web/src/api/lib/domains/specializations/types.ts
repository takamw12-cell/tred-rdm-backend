import type { FamilyId } from "../types";

/**
 * Taxonomie avancée : famille → sous-domaine → spécialisation.
 *
 *   stem (ingénierie) ─► aerospace, mechanical, electrical, civil, fluid_dynamics
 *   law               ─► corporate, criminal, international
 *   medicine          ─► cardiology, neurology, surgery
 *
 * Un SOUS-DOMAINE porte la méthode (règles, outils, où chercher). Une
 * SPÉCIALISATION (niveau Master/Doctorat) porte sa détection (mots-clés
 * pondérés) et, plus tard, ses règles métier propres (`rules`).
 *
 * Types fermés partout : aucune chaîne libre ne peut désigner un sous-domaine,
 * une spécialisation ou un outil qui n'existe pas.
 */

/** Les familles qui ont des sous-domaines (« stem » = l'ingénierie). */
export type SpecializationFamily = Extract<FamilyId, "stem" | "law" | "medicine">;

export type EngineeringSubdomain = "aerospace" | "mechanical" | "electrical" | "civil" | "fluid_dynamics";
export type LawSubdomain = "corporate" | "criminal" | "international";
export type MedicineSubdomain = "cardiology" | "neurology" | "surgery";
export type SubdomainId = EngineeringSubdomain | LawSubdomain | MedicineSubdomain;

/** Outils du tuteur (noms exacts de api/agent/index.ts — vérifié par les tests). */
export type ToolName =
  | "suche_in_unterlagen"
  | "recherche_connaissances_externes"
  | "evaluate_structure"
  | "rechnen"
  | "mathe_berechnen"
  | "physik_berechnen"
  | "thermo_berechnen"
  | "elektro_berechnen"
  | "schaltung_berechnen"
  | "werkstoff_berechnen"
  | "statik_berechnen"
  | "balkenstatik"
  | "skizze";

export interface Subdomain {
  readonly id: SubdomainId;
  readonly family: SpecializationFamily;
  /** Nom affiché dans le prompt (allemand, comme le reste du prompt). */
  readonly label: string;
  /** Règles méthodologiques du sous-domaine (message système). */
  readonly method: string;
  /** Outils à privilégier pour ce sous-domaine. */
  readonly tools: readonly ToolName[];
  /** Où chercher dans les documents de l'étudiant. */
  readonly rag: string;
}

export type SpecializationId =
  | "aerodynamics"
  | "compressible_flow"
  | "finite_elements"
  | "power_electronics"
  | "reinforced_concrete"
  | "corporate_law"
  | "criminal_law"
  | "international_law"
  | "cardiology"
  | "neurology"
  | "surgery";

/** [motif, poids]. Motif en minuscules ; `\b` est rendu sûr pour les umlauts. */
export type KeywordRule = readonly [pattern: RegExp, weight: number];

export interface Specialization {
  readonly id: SpecializationId;
  readonly subdomain: SubdomainId;
  /** Nom affiché (allemand). */
  readonly label: string;
  readonly level: "master" | "doctorate";
  readonly keywords: readonly KeywordRule[];
  /**
   * Règles métier propres à la spécialisation, ajoutées au message système.
   * Vide pour l'instant : c'est le point d'extension prévu.
   */
  readonly rules: readonly string[];
}

export interface SpecializationMatch {
  readonly specialization: Specialization;
  readonly subdomain: Subdomain;
  readonly family: SpecializationFamily;
  readonly score: number;
  /** Les termes reconnus — pour les journaux et les tests. */
  readonly matched: readonly string[];
}
