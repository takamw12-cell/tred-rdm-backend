/**
 * Lire ce que le serveur a VRAIMENT répondu quand une réponse échoue.
 *
 * ── Le défaut que ce fichier corrige ──────────────────────────────────────
 *
 * Le 5 septembre, le tuteur a cessé de répondre. L'écran affichait « Die
 * Verbindung wurde unterbrochen. Ich versuche es automatisch erneut … », et le
 * client relançait toutes les 900 ms. Ce n'était pas la connexion : le compte
 * avait atteint son quota mensuel — 20 messages sur 20, tarif gratuit. Le
 * serveur le disait clairement, en allemand, avec le tarif, le compteur et la
 * limite. Le client lisait cette réponse et affichait autre chose.
 *
 * Un étudiant à qui l'on ment de cette façon ne va pas payer : il conclut que
 * l'application est cassée, et il part. Le quota gratuit est précisément
 * l'endroit où l'abonnement doit se vendre ; en faire une panne, c'est
 * transformer un argument commercial en fuite.
 *
 * ── Pourquoi `error.message` contient du JSON ─────────────────────────────
 *
 * `DefaultChatTransport` fait `throw new Error(await response.text())` sur
 * toute réponse non-2xx. Le corps JSON du serveur arrive donc intact, mais
 * déguisé en message d'erreur. On le rouvre ici.
 */

/** Ce que le serveur peut refuser, et ce que l'interface doit en faire. */
export type ChatFailure =
  | {
      /** Refus définitif ce mois-ci. Relancer ne sert à rien. */
      kind: "quota";
      /** Le texte allemand du serveur, déjà rédigé pour l'étudiant. */
      message: string;
      plan?: string;
      used?: number;
      limit?: number;
    }
  | {
      /** Trop vite. Se libère tout seul. */
      kind: "rate";
      message: string;
      /** Secondes à attendre, telles que le serveur les a calculées. */
      retryAfter: number;
    }
  | {
      /** Tout le reste : coupure réseau, panne du modèle, 500. */
      kind: "transient";
    };

/**
 * Classe un échec de `useChat`.
 *
 * Volontairement tolérant : une réponse illisible, un proxy qui renvoie du
 * HTML, une vraie coupure — tout cela retombe sur `transient`, c'est-à-dire
 * sur l'ancien comportement. Le seul risque serait de traiter une panne
 * passagère comme un quota et de priver l'étudiant de la relance.
 */
export function readChatFailure(error: Error | undefined): ChatFailure {
  if (!error?.message) return { kind: "transient" };

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(error.message) as Record<string, unknown>;
  } catch {
    return { kind: "transient" };
  }
  if (!body || typeof body !== "object") return { kind: "transient" };

  const code = typeof body.error === "string" ? body.error : "";
  const message = typeof body.message === "string" ? body.message : "";

  if (code === "QUOTA_EXCEEDED" || code === "TOKEN_CAP_REACHED") {
    return {
      kind: "quota",
      message,
      plan: typeof body.plan === "string" ? body.plan : undefined,
      used: typeof body.used === "number" ? body.used : undefined,
      limit:
        typeof body.limit === "number"
          ? body.limit
          : typeof body.cap === "number"
            ? body.cap
            : undefined,
    };
  }

  if (code === "RATE_LIMITED") {
    // Le serveur donne la seconde exacte. On la respecte plutôt que de
    // deviner : relancer avant la fin de la fenêtre recompte dans le
    // limiteur, et prolonge le blocage qu'on essaie de quitter.
    const brut = typeof body.retryAfter === "number" ? body.retryAfter : 60;
    return {
      kind: "rate",
      message,
      retryAfter: Math.min(120, Math.max(1, Math.ceil(brut))),
    };
  }

  return { kind: "transient" };
}
