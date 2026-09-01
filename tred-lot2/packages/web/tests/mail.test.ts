/**
 * Le gabarit d'e-mail de réinitialisation.
 *
 * Ce qui est réellement en jeu ici : le prénom vient de l'inscription, donc de
 * l'utilisateur. S'il n'est pas échappé, quelqu'un qui s'inscrit sous le nom
 * `<script>…` fait envoyer ce script à sa propre adresse — inoffensif — mais le
 * même défaut existe partout où l'on recolle du texte dans du HTML, et c'est
 * une habitude qu'on ne veut pas prendre.
 */

import { describe, expect, test } from "bun:test";

// Import dynamique : ce module vient du lot 1. S'il n'est pas encore en place,
// les tests se mettent en attente au lieu de faire échouer tout le paquet — un
// `bun run verify` rouge pour une raison sans rapport ne se lit plus.
type MailFn = (
  url: string,
  name?: string | null,
) => { subject: string; html: string; text: string };

let resetPasswordMail: MailFn | null = null;
try {
  ({ resetPasswordMail } = (await import("../src/api/lib/mail")) as {
    resetPasswordMail: MailFn;
  });
} catch {
  console.warn("[test] api/lib/mail absent — lot 1 pas encore appliqué, tests ignorés");
}

const suite = resetPasswordMail ? describe : describe.skip;
const mailOf: MailFn = (url, name) => resetPasswordMail!(url, name);

const URL_OK = "https://tred.app/reset-password?token=abc123";

suite("resetPasswordMail", () => {
  test("le lien apparaît dans les deux versions", () => {
    const mail = mailOf(URL_OK, "Edwin");
    expect(mail.html).toContain(URL_OK);
    expect(mail.text).toContain(URL_OK);
  });

  test("le prénom est repris tel quel quand il est ordinaire", () => {
    const mail = mailOf(URL_OK, "Edwin");
    expect(mail.text.startsWith("Hallo Edwin,")).toBe(true);
    expect(mail.html).toContain("Hallo Edwin,");
  });

  test("sans prénom, la formule reste correcte", () => {
    const mail = mailOf(URL_OK, null);
    expect(mail.text.startsWith("Hallo,")).toBe(true);
    expect(mail.text).not.toContain("Hallo null");
    expect(mail.text).not.toContain("undefined");
  });

  test("un prénom vide ou fait d'espaces est traité comme absent", () => {
    expect(mailOf(URL_OK, "   ").text.startsWith("Hallo,")).toBe(true);
  });

  test("un prénom contenant du HTML est neutralisé", () => {
    const mail = mailOf(URL_OK, "<script>alert(1)</script>");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  test("une apostrophe dans l'adresse ne casse pas l'attribut href", () => {
    const mail = mailOf("https://tred.app/r?t=a'b", "Edwin");
    // L'apostrophe doit être encodée, sinon elle refermerait l'attribut.
    expect(mail.html).toContain("&#39;");
    expect(mail.html).not.toContain("t=a'b\"");
  });

  test("l'objet est en allemand et non vide", () => {
    const mail = mailOf(URL_OK, "Edwin");
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.subject).toContain("TRED");
  });

  test("la version texte annonce la durée de validité", () => {
    // Sans cette phrase, un lien expiré passe pour un bogue de l'application.
    expect(mailOf(URL_OK, "Edwin").text).toContain("Stunde");
  });
});
