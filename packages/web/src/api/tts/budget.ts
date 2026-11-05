/**
 * Plafond quotidien de caractères ElevenLabs par étudiant (défaut 20 000,
 * soit une quinzaine de réponses lues). Module pur, testé sans base.
 * En mémoire : un redémarrage remet les compteurs à zéro, ce qui est
 * acceptable pour un garde-fou de budget.
 */
const dailyLimit = () => Number(process.env.ELEVENLABS_DAILY_CHARS) || 20_000;
const usage = new Map<string, { day: string; chars: number }>();

/** Réserve `n` caractères pour l'utilisateur ; false si le plafond du jour est atteint. */
export function reserveChars(userId: string, n: number, today = new Date().toISOString().slice(0, 10)): boolean {
  const u = usage.get(userId);
  const used = u && u.day === today ? u.chars : 0;
  if (used + n > dailyLimit()) return false;
  usage.set(userId, { day: today, chars: used + n });
  return true;
}

