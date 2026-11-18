import { client } from "@/lib/api";

/**
 * Le lien de parrainage « https://www.tred-tutor.de/?ref=TRED-XXXXXX ».
 *
 * À l'arrivée sur le site (connecté ou non), le code est gardé dans ce
 * navigateur ; une fois le compte ouvert et connecté, il est appliqué une fois
 * (POST referral.redeem). Le serveur décide de tout : adresse confirmée,
 * compte de moins de 7 jours, un seul parrain (api/lib/referral.ts).
 *
 * Le code reste gardé tant que l'adresse e-mail n'est pas confirmée : après le
 * clic sur le lien de confirmation, le nouvel essai aboutit.
 */
const KEY = "tred.ref";
const CODE = /^TRED-[A-HJKMNP-Z2-9]{6}$/;

export function captureReferralFromUrl(search: string = typeof window !== "undefined" ? window.location.search : ""): void {
  const code = new URLSearchParams(search).get("ref")?.trim().toUpperCase();
  if (!code || !CODE.test(code)) return;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* stockage indisponible : le code se saisit à la main sur /invite */
  }
}

let running = false;
export async function redeemPendingReferral(onGranted: (credits: number) => void): Promise<void> {
  let code: string | null = null;
  try {
    code = localStorage.getItem(KEY);
  } catch {
    return;
  }
  if (!code || running) return;
  running = true;
  try {
    const res = await client.referral.redeem({ code });
    if (res.ok) onGranted(res.credits);
    // Seul « adresse pas encore confirmée » vaut un nouvel essai ; tout autre refus est définitif.
    if (res.ok || res.reason !== "email_not_verified") localStorage.removeItem(KEY);
  } catch {
    /* réseau : nouvel essai au prochain chargement */
  } finally {
    running = false;
  }
}
