import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextPose, spokenAnswer, TURN_MS, TURN_SECONDS, type ProfessorPose } from "../src/web/lib/professor-choreography";
import { effectiveBoardTheme, hexToRgb, isDarkColor, rgba, tafelStyle } from "../src/web/lib/tafel-colors";
import { useBoardTheme } from "../src/web/stores/board-theme";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("Chorégraphie du professeur : Schreiben → Drehen → Erklären", () => {
  test("le cycle complet d'une réponse", () => {
    let p: ProfessorPose = "idle";
    p = nextPose(p, { type: "streamStart" });
    expect(p).toBe("schreiben"); // de dos, au tableau, silencieux
    p = nextPose(p, { type: "streamEnd", hasAnswer: true });
    expect(p).toBe("drehen"); // fin du flux : il se retourne
    p = nextPose(p, { type: "turned", willSpeak: true });
    expect(p).toBe("erklaeren"); // face à toi, il parle
    p = nextPose(p, { type: "spoken" });
    expect(p).toBe("idle");
  });

  test("le retournement dure 0,8 s", () => {
    expect(TURN_SECONDS).toBe(0.8);
    expect(TURN_MS).toBe(800);
  });

  test("réponse vide ou erreur : il se retourne en silence ; lecture coupée → silence", () => {
    expect(nextPose("schreiben", { type: "streamEnd", hasAnswer: false })).toBe("idle");
    expect(nextPose("drehen", { type: "turned", willSpeak: false })).toBe("idle");
    expect(nextPose("erklaeren", { type: "stop" })).toBe("idle");
    // « Stop » pendant l'écriture ne le retourne pas
    expect(nextPose("schreiben", { type: "stop" })).toBe("schreiben");
    // Une nouvelle question pendant qu'il parle : retour au tableau
    expect(nextPose("erklaeren", { type: "streamStart" })).toBe("schreiben");
  });

  test("ce qu'il dit : ses paroles [[PROFESSEUR]] — JAMAIS les étapes du tableau (2026-11-11)", () => {
    const steps = [{ label: "Ergebnis", body: "Die Kraft ist $F = 20$ N.", complete: true }];
    expect(
      spokenAnswer({ steps, commentary: "", spoken: "Stell dir vor, du schiebst einen **Einkaufswagen**. Spürst du es?" }, ""),
    ).toBe("Stell dir vor, du schiebst einen Einkaufswagen. Spürst du es?");
    // Ancien format : le texte hors feuilles.
    expect(spokenAnswer({ steps, commentary: "Schau auf die **Tafel**." }, "")).toBe("Schau auf die Tafel.");
    // Rien à dire : il se retourne en silence, il ne lit pas le tableau.
    expect(spokenAnswer({ steps, commentary: "" }, "")).toBe("");
    expect(spokenAnswer({ steps, commentary: "", spoken: "" }, "")).toBe("");
    expect(spokenAnswer(undefined, "Hallo **Lena**!")).toBe("Hallo Lena!");
  });
});

describe("Couleurs du tableau : sélecteur et densité, en temps réel", () => {
  test("conversion et luminance", () => {
    expect(hexToRgb("#2e4a3a")).toEqual([46, 74, 58]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(rgba("#2e4a3a", 0.5)).toBe("rgb(46 74 58 / 0.5)");
    expect(isDarkColor("#2e4a3a")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
  });

  test("--tafel-bg et --tafel-text, recopiées dans les variables du tableau", () => {
    const st = tafelStyle({ bg: "#1e3a8a", bgAlpha: 0.8, ink: "#fde68a", inkAlpha: 0.9 })!;
    expect(st["--tafel-bg"]).toBe("rgb(30 58 138 / 0.8)");
    expect(st["--tafel-text"]).toBe("rgb(253 230 138 / 0.9)");
    expect(st["--board-surface"]).toBe(st["--tafel-bg"]);
    expect(st["--board-ink"]).toBe(st["--tafel-text"]);
    expect(tafelStyle(null)).toBeUndefined();
    // Fond sombre libre → règles « tableau sombre » (feuilles en trait de craie)
    expect(effectiveBoardTheme("white", { bg: "#1e3a8a", bgAlpha: 1, ink: "#fff", inkAlpha: 1 })).toBe("dark");
    expect(effectiveBoardTheme("green", null)).toBe("green");
  });

  test("le store : une couleur choisie s'applique, un thème l'efface", () => {
    const s = useBoardTheme.getState();
    s.setCustom({ bg: "#123456" });
    expect(useBoardTheme.getState().custom?.bg).toBe("#123456");
    s.setCustom({ inkAlpha: 0.5 });
    expect(useBoardTheme.getState().custom).toMatchObject({ bg: "#123456", inkAlpha: 0.5 });
    s.setTheme("dark");
    expect(useBoardTheme.getState()).toMatchObject({ theme: "dark", custom: null });
  });
});

describe("Câblage", () => {
  test("plus de faux feutres ; un vrai sélecteur de couleurs et de densité sur le rebord", () => {
    const h = read("src/web/components/hoersaal.tsx");
    expect(h).not.toContain("Feutre bleu nuit");
    expect(h).not.toContain("MARKERS");
    expect(h).toContain('type="color"');
    expect(h).toContain('type="range"');
    expect(h).toContain("style={tafelStyle(custom)");
    expect(read("src/web/styles.css")).toContain("background: var(--tafel-bg);");
  });

  test("hologramme : rotation Y en 0,8 s, deux faces ; voix au rythme des mots", () => {
    const holo = read("src/web/components/hologram-professor.tsx");
    expect(holo).toContain("animate={{ rotateY: back ? 180 : 0 }}");
    expect(holo).toContain("duration: TURN_SECONDS");
    expect(holo).toContain("[backface-visibility:hidden]");
    expect(read("src/web/lib/voice.ts")).toContain('if (e.name === "word") onWord();');
  });

  test("tuteur : une seule scène — Tafel plein cadre, professeur flottant, barre de chat en bas", () => {
    const chat = read("src/web/pages/chat.tsx");
    expect(chat).toContain("<HoersaalStage");
    expect(chat).toContain("<FloatingProfessor");
    expect(chat).toContain("pose={choreo.pose}");
    expect(chat).toContain("useProfessorChoreography({");
    expect(chat).not.toContain("<Dots />");
    expect(chat).toContain('data-slot="chat-composer"');
    // Plus d'écran coupé en deux : ni colonne Tafel, ni colonne chat fixe.
    expect(chat).not.toContain("lg:flex-row");
    expect(chat).not.toContain("lg:w-[58%]");
    expect(chat).not.toContain("<ProfessorStrip");
    // La liste des cours ne réduit plus la Tafel par défaut.
    expect(chat).toContain('localStorage.getItem("tred.chatRail.v2") === "open"');
  });

  test("scène immersive : saisie DANS le rebord, à droite de « Farben » ; titre qui s'efface ; prof déplaçable", () => {
    const stage = read("src/web/components/hoersaal-stage.tsx");
    const board = read("src/web/components/hoersaal.tsx");
    // Décision fondateur (2026-11-09, 2e version) : plus de barre sous le
    // tableau. « Farben » à gauche, la saisie à droite, une seule ligne flex
    // dans le rebord — aucun chevauchement possible.
    expect(stage).toContain("relative isolate flex h-full min-h-0 w-full flex-1 flex-col");
    // Plein cadre (2026-11-09) : aucune marge entre la barre de contexte et
    // la Tafel ; hauteur dynamique (dvh) pour Safari iPhone/iPad.
    expect(stage).toContain('"relative flex h-full min-h-0 w-full flex-1 flex-col p-0"');
    expect(board).toMatch(/data-slot="tafel-frame"[\s\S]*?h-full min-h-0 w-full flex-1 flex-col rounded-t-none/);
    expect(read("src/web/pages/chat.tsx")).toContain("h-[calc(100dvh-4rem)]");
    expect(read("src/web/components/layout.tsx")).toContain('!location.startsWith("/chat") && "pb-16 lg:pb-0"');
    expect(stage).not.toMatch(/\bbottom-\[/);
    expect(stage).not.toContain('"--dock-space"');
    expect(board).not.toContain("dock-spacer");
    expect(board).toContain('data-slot="ledge-composer"');
    expect(board).toMatch(/data-slot="tafel-ledge"[\s\S]*?flex-row items-center/);
    expect(board.indexOf("<TafelColorControls")).toBeLessThan(board.indexOf('data-slot="ledge-composer"'));
    // Le grand titre n'existe que sur le tableau vide, et s'efface en fondu.
    expect(board).toContain("<AnimatePresence");
    expect(read("src/web/components/tafel-board.tsx")).toContain("showHeader={blank}");
    // Le texte ne passe pas sous le professeur (marge réservée), et on le déplace.
    expect(board).toContain("md:pr-48");
    expect(stage).toContain("dragConstraints={stage ?? undefined}");
    expect(stage).toMatch(/<motion\.div\s+data-slot="floating-professor"[\s\S]*?\bdrag\b/);
    expect(read("src/web/pages/chat.tsx")).not.toContain("dock={");
  });

  test("maquette /classroom : même scène, sans colonnes", () => {
    const vc = read("src/web/components/virtual-classroom.tsx");
    expect(vc).toContain("<HoersaalStage");
    expect(vc).toContain("<FloatingProfessor");
    expect(vc).not.toContain("interactiveLedge");
    expect(vc).not.toContain("function Sidebar");
    expect(vc).not.toContain("function ProfessorPanel");
    expect(vc).not.toContain("flex-row");
    expect(vc).toContain("composer={composer}");
    // Formule de la question de démo : dans un attribut JSX "…", « \\to »
    // resterait un double backslash (= saut de ligne KaTeX) — vu en prod.
    expect(vc).toContain("String.raw`Was passiert mit $I_1$, wenn $R_3 \\to \\infty$?`");
  });
});
