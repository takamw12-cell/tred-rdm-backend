import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_URL ??= "file::memory:";
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-marketing-0123456789";
process.env.WEBSITE_URL ??= "https://www.tred-tutor.de";
const { didYouKnowMail, confirmMail, readToken, signToken, unsubscribeUrl, CONFIRM_TTL_MS } = await import("../src/api/lib/marketing");

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("e-mails « Tipps & Neuigkeiten » : consentement prouvé", () => {
  test("liens signés : le bon compte, la bonne action, rien d'autre", () => {
    const t = signToken("unsub", "u1");
    expect(readToken("unsub", t)).toBe("u1");
    expect(readToken("confirm", t)).toBeNull(); // un lien de désinscription ne confirme rien
    const [body] = t.split(".");
    expect(readToken("unsub", `${body}.AAAA`)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ p: "unsub", u: "u2", e: 0 })).toString("base64url");
    expect(readToken("unsub", `${forged}.${t.split(".")[1]}`)).toBeNull();
  });

  test("le lien de confirmation expire au bout de 7 jours", () => {
    const t = signToken("confirm", "u1", 0);
    expect(readToken("confirm", t, CONFIRM_TTL_MS - 1)).toBe("u1");
    expect(readToken("confirm", t, CONFIRM_TTL_MS + 1)).toBeNull();
  });

  test("case décochée par défaut ; cochée = demande, pas consentement (double opt-in)", () => {
    const login = read("src/web/pages/login.tsx");
    expect(login).toContain("const [marketing, setMarketing] = useState(false);");
    expect(login).toContain('...(marketing ? { "x-tred-marketing": "1"');
    const lib = read("src/api/lib/marketing.ts");
    expect(lib).toContain('.values({ userId: u.id, status: "pending", source, requestedAt: now })');
    expect(lib).toContain('eq(marketingConsent.status, "confirmed")');
    expect(read("src/api/auth.ts")).toContain('if (context?.headers?.get(MARKETING_HEADER) === "1")');
  });

  test("désinscription : un clic (RFC 8058), jamais sur un simple GET", () => {
    const routes = read("src/api/emails/routes.ts");
    expect(routes).toContain('app.post("/api/emails/unsubscribe"');
    expect(routes.slice(routes.indexOf('app.get("/api/emails/unsubscribe"'), routes.indexOf('app.post("/api/emails/unsubscribe"'))).not.toContain("revokeConsent");
    expect(read("src/api/lib/marketing.ts")).toContain('"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"');
  });

  test("campagne : administrateurs seulement, comptage par défaut, une fois par compte", () => {
    const routes = read("src/api/emails/routes.ts");
    expect(routes).toContain('if (admin.state !== "admin")');
    expect(routes).toContain("const dryRun = body.dryRun !== false;");
    expect(read("src/api/lib/marketing.ts")).toContain("id: `${campaign}:${r.id}`");
  });

  test("« Did you know? » : logo, texte court, bouton « Jetzt spielen » vers l'Arcade, lien de désinscription", () => {
    const unsub = unsubscribeUrl("u1");
    const m = didYouKnowMail("https://www.tred-tutor.de/arcade", unsub, "Lena Müller", "de");
    expect(m.subject).toBe("Wusstest du? Mit der Arcade verdienst du Credits");
    expect(m.html).toContain("/icon-192.png");
    expect(m.html).toContain(">Jetzt spielen</a>");
    expect(m.html).toContain('href="https://www.tred-tutor.de/arcade"');
    expect(m.html).toContain("Abmelden (ein Klick)");
    expect(m.html).toContain("Hallo Lena,");
    expect(m.html).not.toContain("Müller");
    expect(m.text).toContain(unsub);
    // Le nom est échappé.
    expect(didYouKnowMail("https://x.de", unsub, "<script>", "de").html).not.toContain("<script>");
    expect(confirmMail("https://x.de/c", "Lena", "fr").subject).toBe("Confirme : astuces et nouveautés de TRED");
  });
});
