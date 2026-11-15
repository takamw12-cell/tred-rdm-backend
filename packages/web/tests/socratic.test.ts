import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTutorAgent } from "../src/api/agent/index";
import { SOCRATIC_MAX_ATTEMPTS, socraticFlags, socraticPromptLines } from "../src/api/lib/socratic";
import { parseSocratic, stripSocratic } from "../src/web/lib/socratic";

/**
 * Le mode socratique (sprint du 2026-11-15, chantier 2) : le tuteur ne donne
 * plus la solution. Il pose une question, attend, puis donne un indice léger,
 * moyen, fort — et la solution complète seulement si l'étudiant abandonne.
 */

const prompt = (opts: Partial<Parameters<typeof buildTutorAgent>[0]> = {}) => JSON.stringify(buildTutorAgent({ sources: [], locale: "de", ...opts }));

describe("ce que le navigateur envoie", () => {
  test("seul un vrai `true` allume le mode ; l'abandon n'existe pas sans le mode", () => {
    expect(socraticFlags({ socratic: true })).toEqual({ on: true, giveUp: false });
    expect(socraticFlags({ socratic: true, socraticGiveUp: true })).toEqual({ on: true, giveUp: true });
    expect(socraticFlags({ socratic: "true", socraticGiveUp: true })).toEqual({ on: false, giveUp: false });
    expect(socraticFlags({})).toEqual({ on: false, giveUp: false });
    expect(socraticFlags(null)).toEqual({ on: false, giveUp: false });
  });
});

describe("la consigne donnée au tuteur", () => {
  const rules = socraticPromptLines({ on: true, giveUp: false }).join("\n");

  test("éteint : aucune ligne — le prompt d'avant, à l'octet près", () => {
    expect(socraticPromptLines({ on: false, giveUp: false })).toEqual([]);
    expect(prompt({ socratic: { on: false, giveUp: false } })).toBe(prompt());
    expect(prompt()).not.toContain("SOKRATISCHER MODUS");
  });

  test("allumé : la solution finale est interdite, même sur demande", () => {
    expect(rules).toContain("SOKRATISCHER MODUS");
    expect(rules).toMatch(/Gib NIE das Endergebnis/);
    expect(rules).toMatch(/auch nicht auf Nachfrage/i);
  });

  test("une question, puis attendre", () => {
    expect(rules).toMatch(/GENAU EINER Frage/);
    expect(rules).toMatch(/wartest du/);
  });

  test("trois niveaux d'indice, du plus léger au plus fort, un par essai", () => {
    expect(SOCRATIC_MAX_ATTEMPTS).toBe(3);
    const l1 = rules.indexOf("HINWEIS STUFE 1");
    const l2 = rules.indexOf("HINWEIS STUFE 2");
    const l3 = rules.indexOf("HINWEIS STUFE 3");
    expect(l1).toBeGreaterThan(-1);
    expect(l2).toBeGreaterThan(l1);
    expect(l3).toBeGreaterThan(l2);
    expect(rules).toMatch(/STUFE 1[^\n]*leicht/);
    expect(rules).toMatch(/STUFE 2[^\n]*mittel/);
    expect(rules).toMatch(/STUFE 3[^\n]*stark/);
  });

  test("le compteur : une dernière ligne que l'interface sait lire", () => {
    expect(rules).toContain("[[SOKRATES versuch=N von=3]]");
    expect(rules).toContain("[[SOKRATES geloest]]");
  });

  test("« J'abandonne » : solution complète, plus la note pédagogique, sans reproche", () => {
    const gaveUp = socraticPromptLines({ on: true, giveUp: true }).join("\n");
    expect(gaveUp).toMatch(/VOLLSTÄNDIGE Lösung/);
    expect(gaveUp).toContain("Hier hat es gehakt");
    expect(gaveUp).toMatch(/morgen noch einmal/);
    expect(gaveUp).toMatch(/Kein Vorwurf/);
    expect(gaveUp).toContain("[[SOKRATES aufgegeben]]");
    // L'interdiction ne tient plus pour ce tour.
    expect(gaveUp).not.toMatch(/Gib NIE das Endergebnis/);
  });

  test("le mode passe dans le prompt du tuteur ; jamais en Prüfungsmodus", () => {
    expect(prompt({ socratic: { on: true, giveUp: false } })).toContain("SOKRATISCHER MODUS");
    expect(prompt({ socratic: { on: true, giveUp: false }, examMode: true })).not.toContain("SOKRATISCHER MODUS");
  });

  test("l'exactitude reste première : les outils servent à VÉRIFIER l'essai, pas à souffler le résultat", () => {
    expect(rules).toMatch(/PRÜFEN/);
  });
});

describe("ce que l'interface lit dans la réponse", () => {
  test("le compteur d'essais", () => {
    expect(parseSocratic("Welche Größe bleibt erhalten?\n[[SOKRATES versuch=1 von=3]]")).toEqual({ status: "open", attempt: 1, max: 3 });
    expect(parseSocratic("…\n[[ sokrates  versuch=0  von=3 ]]")).toEqual({ status: "open", attempt: 0, max: 3 });
  });

  test("le dernier marqueur d'une réponse l'emporte", () => {
    expect(parseSocratic("[[SOKRATES versuch=1 von=3]]\n…\n[[SOKRATES versuch=2 von=3]]")).toMatchObject({ attempt: 2 });
  });

  test("résolu seul, ou abandonné", () => {
    expect(parseSocratic("Genau!\n[[SOKRATES geloest]]")).toEqual({ status: "solved", attempt: 0, max: 3 });
    expect(parseSocratic("Die Lösung …\n[[SOKRATES aufgegeben]]")).toEqual({ status: "gave_up", attempt: 3, max: 3 });
  });

  test("des valeurs absurdes sont ramenées dans les bornes", () => {
    expect(parseSocratic("[[SOKRATES versuch=99 von=3]]")).toEqual({ status: "open", attempt: 3, max: 3 });
    expect(parseSocratic("[[SOKRATES versuch=-2 von=40]]")).toEqual({ status: "open", attempt: 0, max: 3 });
  });

  test("pas de marqueur : rien à afficher", () => {
    expect(parseSocratic("Eine normale Antwort.")).toBeNull();
    expect(parseSocratic("")).toBeNull();
  });

  test("le marqueur n'est jamais montré à l'étudiant, même en cours d'écriture", () => {
    expect(stripSocratic("Welche Größe?\n[[SOKRATES versuch=1 von=3]]")).toBe("Welche Größe?");
    expect(stripSocratic("Welche Größe?\n[[SOKRATES versuch=1 vo")).toBe("Welche Größe?");
    expect(stripSocratic("Welche Größe?\n[[SOKR")).toBe("Welche Größe?");
    expect(stripSocratic("a [[SOKRATES geloest]] b")).toBe("a  b");
    // Les autres marqueurs du tableau ne sont pas touchés.
    expect(stripSocratic('[[TAFEL schritt="Frage"]]\nx\n[[/TAFEL]]')).toBe('[[TAFEL schritt="Frage"]]\nx\n[[/TAFEL]]');
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
  const CHAT = read("../src/web/pages/chat.tsx");
  const INDEX = read("../src/api/index.ts");

  test("le navigateur envoie le mode, et l'abandon pour UN seul envoi", () => {
    expect(CHAT).toContain("socratic: socraticRef.current,");
    expect(CHAT).toContain("socraticGiveUp: giveUpRef.current,");
    expect(CHAT).toMatch(/giveUpRef\.current = false;/);
  });

  test("le serveur lit les drapeaux du corps et les remet au tuteur", () => {
    expect(INDEX).toContain("socratic: socraticFlags(body),");
  });

  test("l'interface : interrupteur, compteur « Versuche : n/3 » et bouton d'abandon", () => {
    expect(CHAT).toContain('aria-label={t("chat.socratic")}');
    expect(CHAT).toContain('t("chat.socraticAttempts", { n: socraticState.attempt, max: socraticState.max })');
    expect(CHAT).toContain('data-testid="socratic-give-up"');
    // Le marqueur est retiré de TOUT ce que l'interface affiche ou réutilise.
    expect(CHAT).toContain("return stripSocratic(rawMessageText(m));");
  });

  test("les textes existent dans les douze langues", () => {
    const dir = join(import.meta.dir, "../src/web/i18n/messages");
    const files = readdirSync(dir).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(files).toHaveLength(12);
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      for (const key of ["socratic:", "socraticHint:", "socraticOn:", "socraticAttempts:", "socraticGiveUp:", "socraticGiveUpMessage:", "socraticSolved:"]) expect(`${f} ${text.includes(key)}`).toBe(`${f} true`);
      expect(text).toMatch(/socraticAttempts: "[^"]*\{n\}[^"]*\{max\}[^"]*"/);
    }
  });
});
