/**
 * Registre des spécialisations. Ajouter une spécialisation : créer son fichier
 * (même forme que les autres), l'ajouter à SpecializationId (types.ts) et ici.
 * Les tests vérifient que chaque id du type a son fichier et inversement.
 */
import { aerodynamics } from "./aerodynamics";
import { compressible_flow } from "./compressible_flow";
import { finite_elements } from "./finite_elements";
import { power_electronics } from "./power_electronics";
import { reinforced_concrete } from "./reinforced_concrete";
import { corporate_law } from "./corporate_law";
import { criminal_law } from "./criminal_law";
import { international_law } from "./international_law";
import { cardiology } from "./cardiology";
import { neurology } from "./neurology";
import { surgery } from "./surgery";
import type { Specialization, SpecializationId } from "./types";

export type * from "./types";

export const SPECIALIZATIONS: Readonly<Record<SpecializationId, Specialization>> = {
  aerodynamics,
  compressible_flow,
  finite_elements,
  power_electronics,
  reinforced_concrete,
  corporate_law,
  criminal_law,
  international_law,
  cardiology,
  neurology,
  surgery,
};
