import { describe, expect, test } from "bun:test";
import { readChatFailure } from "../src/web/lib/chat-error";

// `plan.ts` remonte jusqu'au client Turso, qui exige une URL au chargement.
// On lui en donne une en mémoire AVANT de l'importer : le test ne touche
// aucune base, mais garde le vrai module — c'est tout l'intérêt.
process.env.DATABASE_URL ??= "file::memory:";
const { quotaError, tokenCapError } = await import("../src/api/lib/plan");

/**
 * Le 5 septembre, un quota atteint s'affichait comme une coupure réseau et se
 * relançait toutes les 900 ms. Ces tests attachent les deux bouts : ce que le
 * SERVEUR répond réellement, et ce que le client en comprend.
 *
 * Le point important est le premier `describe` : les corps de réponse ne sont
 * pas recopiés à la main, ils sont produits par `quotaError` et
 * `tokenCapError` eux-mêmes. Le jour où quelqu'un renomme un code d'erreur
 * côté serveur, ce test tombe — au lieu que le client se remette,
 * silencieusement, à mentir.
 */

/** Ce que fait `DefaultChatTransport` d'une réponse non-2xx. */
function commeLeTransport(corps: unknown): Error {
  return new Error(JSON.stringify(corps));
}

describe("les vrais refus du serveur", () => {
  test("quota mensuel épuisé — tarif gratuit", () => {
    const corps = quotaError({
      ok: false,
      plan: "free",
      used: 20,
      limit: 20,
      creditsRemaining: 0,
    });
    const r = readChatFailure(commeLeTransport(corps));
    expect(r.kind).toBe("quota");
    if (r.kind !== "quota") return;
    expect(r.message).toBe("Dein Freikontingent für diesen Monat ist aufgebraucht.");
    expect(r.used).toBe(20);
    expect(r.limit).toBe(20);
  });

  test("plafond de jetons — c'est aussi un refus définitif", () => {
    const r = readChatFailure(commeLeTransport(tokenCapError(100_000, 100_000)));
    expect(r.kind).toBe("quota");
  });

  test("limiteur de débit — passager, avec le délai du serveur", () => {
    const r = readChatFailure(
      commeLeTransport({
        error: "RATE_LIMITED",
        retryAfter: 43,
        message: "Zu viele Anfragen. Versuch es in 43 Sekunden erneut.",
      }),
    );
    expect(r.kind).toBe("rate");
    if (r.kind !== "rate") return;
    expect(r.retryAfter).toBe(43);
  });
});

describe("ce qui doit rester une panne passagère", () => {
  // Tout ce qui n'est pas un refus identifié doit garder l'ancien
  // comportement : message générique et relance. Se tromper dans ce sens
  // coûte une relance ; se tromper dans l'autre prive l'étudiant de sa
  // réponse.
  test("une coupure réseau", () => {
    expect(readChatFailure(new Error("Failed to fetch")).kind).toBe("transient");
  });

  test("une page d'erreur HTML du proxy", () => {
    expect(readChatFailure(new Error("<html>502 Bad Gateway</html>")).kind).toBe(
      "transient",
    );
  });

  test("un JSON sans code connu", () => {
    expect(
      readChatFailure(commeLeTransport({ error: "SOMETHING_ELSE" })).kind,
    ).toBe("transient");
  });

  test("pas d'erreur du tout", () => {
    expect(readChatFailure(undefined).kind).toBe("transient");
  });
});

describe("le délai de relance reste raisonnable", () => {
  test("un Retry-After absurde est borné", () => {
    const r = readChatFailure(
      commeLeTransport({ error: "RATE_LIMITED", retryAfter: 99_999 }),
    );
    expect(r.kind).toBe("rate");
    if (r.kind !== "rate") return;
    expect(r.retryAfter).toBe(120);
  });

  test("un Retry-After manquant retombe sur la fenêtre d'une minute", () => {
    const r = readChatFailure(commeLeTransport({ error: "RATE_LIMITED" }));
    expect(r.kind).toBe("rate");
    if (r.kind !== "rate") return;
    expect(r.retryAfter).toBe(60);
  });
});
