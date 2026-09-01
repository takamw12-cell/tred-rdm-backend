/**
 * Comparaison de lacunes — sans dépendance, testable seule.
 *
 * Séparé de `memory.ts` pour une raison concrète : ce dernier importe la base
 * de données, qui exige `DATABASE_URL` dès l'import. Un test unitaire de ces
 * deux fonctions échouerait donc faute de variable d'environnement, alors
 * qu'elles n'ont aucun besoin de base. Même découpage que `search-text.ts`.
 */

import { fold } from "./search-text";

/** Longueur minimale pour qu'une inclusion de texte soit un vrai indice. */
const MIN_OVERLAP = 10;

/**
 * Deux formulations décrivent-elles la même lacune ?
 *
 * Fonction pure, testée séparément : c'est elle qui décide si le compteur monte
 * ou si une deuxième ligne apparaît, et une erreur ici se voit dans l'interface.
 */
export function sameGap(a: string, b: string): boolean {
  const x = fold(a).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const y = fold(b).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!x || !y) return false;
  if (x === y) return true;

  // L'un contient l'autre : « verwechselt spannung und dehnung » couvre
  // « spannung und dehnung ». On exige une longueur minimale pour éviter que
  // deux lacunes sans rapport se rejoignent sur un mot commun.
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= MIN_OVERLAP && long.includes(short)) return true;

  // Sinon, la proportion de mots significatifs communs.
  const wx = new Set(x.split(" ").filter((w) => w.length > 3));
  const wy = new Set(y.split(" ").filter((w) => w.length > 3));

  // Deux mots porteurs minimum de chaque côté. Avec un seul, le moindre mot
  // commun donne 100 % : « E-Modul » avalerait « E-Modul und Streckgrenze
  // verwechselt », qui est pourtant une autre lacune.
  if (wx.size < 2 || wy.size < 2) return false;

  let shared = 0;
  for (const w of wx) if (wy.has(w)) shared++;
  return shared / Math.min(wx.size, wy.size) >= 0.75;
}

/** Depuis combien de jours, en français simple pour le prompt. */
export function ageLabel(date: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 14) return "vor einer Woche";
  if (days < 60) return `vor ${Math.floor(days / 7)} Wochen`;
  return `vor ${Math.floor(days / 30)} Monaten`;
}
