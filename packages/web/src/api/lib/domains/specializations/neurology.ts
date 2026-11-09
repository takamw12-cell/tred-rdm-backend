import type { Specialization } from "./types";

/** Neurologie — Topische Diagnostik, Schlaganfall, Epilepsie, Neuroimmunologie. */
export const neurology: Specialization = {
  id: "neurology",
  subdomain: "neurology",
  label: "Neurologie",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(neurologi\p{L}*|neurology|neurologie)\b/u, 3],
    [/\b(schlaganfall\p{L}*|hirninfarkt|apoplex|stroke|multiple sklerose|epilepsie|epileptisch\p{L}*|parkinson\p{L}*|meningitis|guillain[- ]barré|myasthenia gravis|lateralsklerose)\b/u, 3],
    [/\b(hirnnerv\p{L}*|lumbalpunktion|liquor\p{L}*|thrombolyse|nihss|pyramidenbahn\p{L}*|reflexstatus)\b/u, 2],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
