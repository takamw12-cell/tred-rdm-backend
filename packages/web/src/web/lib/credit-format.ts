/**
 * Un solde de crédits affiché : « 10 », « 10,5 » (allemand, français), « 10.5 »
 * (anglais). Les récompenses d'étude donnent des demi-crédits (api/lib/study-rewards.ts).
 */
export function formatCredits(value: number, locale: string): string {
  const n = Number.isFinite(value) ? Math.round(value * 2) / 2 : 0;
  return new Intl.NumberFormat(locale || "de", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);
}
