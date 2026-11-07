import type { Domain } from "../solvers/domain";
import type { StructureDomain } from "./structure";

/**
 * Les grandes familles de TRED (« Domain-Based Agent » universel).
 *
 * Une famille regroupe des matières qui partagent une MÉTHODE : on calcule en
 * STEM, on subsume en droit, on raisonne cliniquement en médecine. La
 * détection fine des matières reste dans solvers/domain.ts ; ce dossier dit,
 * pour chaque famille, comment enseigner, avec quels outils, et comment
 * évaluer une réponse.
 */
export type FamilyId = "stem" | "law" | "medicine" | "economics" | "highschool";

export interface DomainFamily {
  id: FamilyId;
  /** Nom affiché dans le prompt (allemand, comme le reste du prompt). */
  label: string;
  /** Matières de solvers/domain.ts qui relèvent de la famille. */
  subjects: Domain[];
  /** La méthode de la discipline — message système quand la famille est détectée. */
  prompt: string;
  /** Outils pertinents (noms exacts de agent/index.ts). Les autres restent
   *  déclarés — retirer un outil casserait le cache — mais ne servent pas ici. */
  allowedTools: string[];
  /** Comment juger une réponse : par un solveur (STEM) ou par la structure. */
  evaluation: { kind: "solver" } | { kind: "structure"; domain: StructureDomain };
  /** Où chercher dans les documents de l'étudiant. */
  rag: string;
}
