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

  test("ce qu'il lit : son commentaire, sinon les étapes du tableau", () => {
    expect(spokenAnswer({ steps: [{ label: "Physik", body: "$F = m a$", complete: true }], commentary: "Schau auf die **Tafel**." }, "")).toBe("Schau auf die Tafel.");
    expect(spokenAnswer({ steps: [{ label: "Ergebnis", body: "Die Kraft ist $F = 20$ N.", complete: true }], commentary: "" }, "")).toBe("Ergebnis. Die Kraft ist F = 20 N.");
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

  test("tuteur : hologramme dans le bandeau, statut calme, saisie flottante en verre", () => {
    const chat = read("src/web/pages/chat.tsx");
    expect(chat).toContain("<HologramProfessor professor={professor} pose={choreo.pose} beat={choreo.beat} />");
    expect(chat).toContain("useProfessorChoreography({");
    expect(chat).not.toContain("<Dots />");
    expect(chat).toContain('data-slot="chat-composer"');
    expect(chat).toContain("backdrop-blur-xl");
    expect(read("src/web/components/virtual-classroom.tsx")).not.toContain("interactiveLedge");
  });
});
