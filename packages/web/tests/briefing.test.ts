import { describe, expect, test } from "bun:test";

import { REFERENCE_DE, acceptModelText, berlinDay, cleanSubject, daysBetween, examSignature, pickBriefing, referenceText, validExamDay, type BriefingFacts } from "../src/api/lib/briefing";
import { MAX_MODEL_CALLS_PER_DAY, MAX_REFRESHES_PER_DAY, generateBriefing, type BriefingDeps, type StoredBriefing } from "../src/api/lib/generate-briefing";
import { de } from "../src/web/i18n/messages/de";

const NOW = new Date("2026-11-18T08:30:00Z");

const facts = (over: Partial<BriefingFacts> = {}): BriefingFacts => ({
  documents: 3,
  daysInactive: 0,
  exam: null,
  focus: null,
  subject: null,
  masteredYesterday: 0,
  ...over,
});

/** Une base en mémoire et un modèle compté : aucun réseau, aucun coût. */
function harness(start: BriefingFacts, options: { model?: string | null; migrated?: boolean; stored?: StoredBriefing | null } = {}) {
  const state = {
    facts: start,
    stored: options.stored ?? (null as StoredBriefing | null),
    modelCalls: 0,
    factReads: 0,
    writes: 0,
    now: NOW,
  };
  const deps: BriefingDeps = {
    now: () => state.now,
    readStored: async () => (options.migrated === false ? { migrated: false, row: null } : { migrated: true, row: state.stored }),
    readExams: async () => (state.facts.exam ? [{ id: "e1", subject: state.facts.exam.subject, day: "2026-12-01" }] : []),
    hasDocument: async () => state.facts.documents > 0,
    readFacts: async () => {
      state.factReads += 1;
      return state.facts;
    },
    write: async (_userId, row) => {
      state.writes += 1;
      state.stored = row;
    },
    writeText:
      options.model === undefined
        ? null
        : async () => {
            state.modelCalls += 1;
            return options.model ?? null;
          },
  };
  return { state, deps };
}

describe("Cas 1 — nouvel utilisateur, aucun document", () => {
  test("le briefing souhaite la bienvenue et demande le premier script", async () => {
    const { deps } = harness(facts({ documents: 0, daysInactive: null }));
    const briefing = await generateBriefing(deps, "u1", "de");
    expect(briefing.kind).toBe("welcome");
    expect(briefing.parts).toEqual([{ key: "welcome", params: {} }]);
    expect(referenceText(briefing.parts)).toBe("Willkommen bei TRED! Lade dein erstes Skript hoch, damit ich dir einen Lernplan erstellen kann.");
  });

  test("aucun appel au modèle : le texte est fixe, donc gratuit", async () => {
    const { deps, state } = harness(facts({ documents: 0, daysInactive: null }), { model: "Hallo!" });
    const briefing = await generateBriefing(deps, "u1", "de");
    expect(state.modelCalls).toBe(0);
    expect(briefing.text).toBeNull();
  });

  test("le Cas 1 passe avant tout le reste : inactif, examen proche, rien n'y change", () => {
    const b = pickBriefing(facts({ documents: 0, daysInactive: 40, exam: { subject: "Mathematik 2", days: 4 }, focus: "Integrale", masteredYesterday: 7 }));
    expect(b.kind).toBe("welcome");
  });

  test("sans compteur de documents lisible (valeur absurde), on reste sur la bienvenue", () => {
    expect(pickBriefing(facts({ documents: Number.NaN })).kind).toBe("welcome");
    expect(pickBriefing(facts({ documents: -2 })).kind).toBe("welcome");
  });

  test("le premier document importé fait sortir de la bienvenue le jour même", async () => {
    const { deps, state } = harness(facts({ documents: 0, daysInactive: null }));
    expect((await generateBriefing(deps, "u1", "de")).kind).toBe("welcome");
    state.facts = facts({ documents: 1, daysInactive: null });
    expect((await generateBriefing(deps, "u1", "de")).kind).toBe("standard");
  });

  test("tables pas encore migrées : la bienvenue s'affiche quand même, sans cache et sans modèle", async () => {
    const { deps, state } = harness(facts({ documents: 0, daysInactive: null }), { model: "Hallo!", migrated: false });
    const briefing = await generateBriefing(deps, "u1", "de");
    expect(briefing.kind).toBe("welcome");
    expect(briefing.migrated).toBe(false);
    expect(state.modelCalls).toBe(0);
    expect(state.writes).toBe(0);
  });
});

describe("les trois autres cas", () => {
  test("Cas 2 — inactif depuis 3 jours : retour et quiz de 3 minutes sur une matière", () => {
    const b = pickBriefing(facts({ daysInactive: 3, subject: "Thermodynamik" }));
    expect(b.kind).toBe("comeback");
    expect(referenceText(b.parts)).toBe("Schön, dich wiederzusehen! Du hast lange nicht geübt. Hier ist ein 3-Minuten-Quiz für Thermodynamik.");
  });

  test("Cas 2 — deux jours d'absence ne suffisent pas", () => {
    expect(pickBriefing(facts({ daysInactive: 2 })).kind).toBe("standard");
  });

  test("Cas 2 — sans matière connue, pas de matière inventée", () => {
    const b = pickBriefing(facts({ daysInactive: 9 }));
    expect(referenceText(b.parts)).toBe("Schön, dich wiederzusehen! Du hast lange nicht geübt. Starte mit einer kurzen Wiederholung.");
  });

  test("Cas 3 — actif, examen proche : le compte à rebours et le chapitre du jour", () => {
    const b = pickBriefing(facts({ exam: { subject: "Mathematik 2", days: 12 }, focus: "Partielle Integration" }));
    expect(b.kind).toBe("exam");
    expect(referenceText(b.parts)).toBe("Noch 12 Tage bis zur Klausur in Mathematik 2. Heute solltest du dich auf Partielle Integration konzentrieren.");
  });

  test("Cas 3 — la veille et le jour même ont leur phrase (pas de « 1 Tage »)", () => {
    expect(referenceText(pickBriefing(facts({ exam: { subject: "TM 1", days: 1 } })).parts)).toBe("Morgen ist die Klausur in TM 1. Wiederhole heute deine Unterlagen dazu.");
    expect(referenceText(pickBriefing(facts({ exam: { subject: "TM 1", days: 0 } })).parts)).toBe("Heute ist die Klausur in TM 1. Viel Erfolg!");
  });

  test("Cas 3 — un examen lointain laisse le briefing standard", () => {
    expect(pickBriefing(facts({ exam: { subject: "TM 1", days: 60 } })).kind).toBe("standard");
  });

  test("Cas 4 — standard : les questions d'hier et la suite du jour", () => {
    const b = pickBriefing(facts({ masteredYesterday: 5, focus: "Wärmekapazität" }));
    expect(b.kind).toBe("standard");
    expect(b.greet).toBe(true);
    expect(referenceText(b.parts)).toBe("Gestern hast du 5 Fragen gemeistert. Mach heute mit Wärmekapazität weiter.");
  });

  test("Cas 4 — zéro question hier : la phrase disparaît au lieu d'afficher « 0 Fragen »", () => {
    expect(referenceText(pickBriefing(facts({ focus: "Entropie" })).parts)).toBe("Mach heute mit Entropie weiter.");
    expect(referenceText(pickBriefing(facts({ masteredYesterday: 1 })).parts)).toBe("Gestern hast du 1 Frage gemeistert. Stell heute eine Frage zu deinen Unterlagen.");
  });
});

describe("le cache : une génération par jour et par compte", () => {
  const active = facts({ masteredYesterday: 4, focus: "Entropie" });
  const good = "Gestern hast du 4 Fragen gemeistert. Mach heute mit Entropie weiter.";

  test("le deuxième chargement de la journée ne rappelle ni le modèle ni les faits", async () => {
    const { deps, state } = harness(active, { model: good });
    const first = await generateBriefing(deps, "u1", "de");
    const second = await generateBriefing(deps, "u1", "de");
    expect(first.text).toBe(good);
    expect(second.text).toBe(good);
    expect(state.modelCalls).toBe(1);
    expect(state.factReads).toBe(1);
  });

  test("le lendemain (heure de Berlin), le briefing est refait", async () => {
    const { deps, state } = harness(active, { model: good });
    await generateBriefing(deps, "u1", "de");
    state.now = new Date("2026-11-19T06:00:00Z");
    await generateBriefing(deps, "u1", "de");
    expect(state.modelCalls).toBe(2);
  });

  test("deux chargements simultanés ne paient qu'une génération", async () => {
    const { deps, state } = harness(active, { model: good });
    await Promise.all([generateBriefing(deps, "u1", "de"), generateBriefing(deps, "u1", "de")]);
    expect(state.modelCalls).toBe(1);
  });

  test("« Actualiser » refait le briefing, dans la limite du jour", async () => {
    const { deps, state } = harness(active, { model: good });
    await generateBriefing(deps, "u1", "de");
    for (let i = 0; i < MAX_REFRESHES_PER_DAY + 4; i++) await generateBriefing(deps, "u1", "de", { force: true });
    expect(state.factReads).toBe(1 + MAX_REFRESHES_PER_DAY);
    expect(state.modelCalls).toBe(MAX_MODEL_CALLS_PER_DAY);
    expect((await generateBriefing(deps, "u1", "de")).refreshLeft).toBe(0);
  });

  test("un examen ajouté dans la journée refait le briefing sans attendre demain", async () => {
    const { deps, state } = harness(active, { model: null });
    expect((await generateBriefing(deps, "u1", "de")).kind).toBe("standard");
    state.facts = facts({ exam: { subject: "Mathematik 2", days: 13 } });
    expect((await generateBriefing(deps, "u1", "de")).kind).toBe("exam");
  });

  test("modèle en panne ou absent : le texte prévu par le code s'affiche", async () => {
    const down = harness(active, { model: null });
    expect((await generateBriefing(down.deps, "u1", "de")).text).toBeNull();
    const none = harness(active);
    expect((await generateBriefing(none.deps, "u1", "de")).text).toBeNull();
  });

  test("un texte du modèle qui invente un chiffre est refusé", async () => {
    const { deps } = harness(active, { model: "Gestern hast du 12 Fragen gemeistert. Mach heute mit Entropie weiter." });
    expect((await generateBriefing(deps, "u1", "de")).text).toBeNull();
  });
});

describe("garde-fou du texte écrit par le modèle", () => {
  const b = pickBriefing(facts({ exam: { subject: "Mathematik 2", days: 12 }, focus: "Partielle Integration" }));

  test("accepté : les chiffres, la matière et le thème sont ceux des faits", () => {
    expect(acceptModelText("In 12 Tagen schreibst du Mathematik 2 – nimm dir heute Partielle Integration vor.", b)).not.toBeNull();
  });

  test("refusé : un autre nombre de jours, la matière oubliée, un lien, du Markdown, trop long", () => {
    expect(acceptModelText("In 10 Tagen schreibst du Mathematik 2 – heute Partielle Integration.", b)).toBeNull();
    expect(acceptModelText("Noch 12 Tage bis zur Klausur. Heute Partielle Integration.", b)).toBeNull();
    expect(acceptModelText("Noch 12 Tage bis Mathematik 2, Partielle Integration: https://example.com", b)).toBeNull();
    expect(acceptModelText("**Noch 12 Tage** bis Mathematik 2: Partielle Integration.", b)).toBeNull();
    expect(acceptModelText(`Noch 12 Tage bis Mathematik 2, Partielle Integration. ${"sehr ".repeat(80)}`, b)).toBeNull();
  });
});

describe("dates et saisies", () => {
  test("la journée est celle de Berlin, pas celle du serveur (UTC)", () => {
    expect(berlinDay(new Date("2026-11-18T22:59:00Z"))).toBe("2026-11-18");
    expect(berlinDay(new Date("2026-11-18T23:01:00Z"))).toBe("2026-11-19");
  });

  test("le compte à rebours enjambe le changement d'heure sans perdre un jour", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-11-18", "2026-12-01")).toBe(13);
    expect(daysBetween("2026-11-18", "2026-11-18")).toBe(0);
  });

  test("une date d'examen : réelle, pas passée, pas dans dix ans", () => {
    expect(validExamDay("2026-12-01", "2026-11-18")).toBe(true);
    expect(validExamDay("2026-11-18", "2026-11-18")).toBe(true);
    expect(validExamDay("2026-11-17", "2026-11-18")).toBe(false);
    expect(validExamDay("2026-02-30", "2026-01-01")).toBe(false);
    expect(validExamDay("2036-12-01", "2026-11-18")).toBe(false);
    expect(validExamDay("01.12.2026", "2026-11-18")).toBe(false);
  });

  test("la matière saisie est nettoyée : une ligne, sans balise, bornée", () => {
    expect(cleanSubject("  Mathematik   2 \n")).toBe("Mathematik 2");
    expect(cleanSubject("<b>TM</b>")).toBe("b TM /b");
    expect(cleanSubject("x")).toBeNull();
    expect(cleanSubject("a".repeat(200))?.length).toBe(60);
  });

  test("la signature des examens change quand le plus proche change", () => {
    expect(examSignature([])).toBe("");
    expect(examSignature([{ id: "a", subject: "TM", day: "2026-12-01" }])).not.toBe(examSignature([{ id: "b", subject: "TM", day: "2026-12-01" }]));
  });
});

describe("les phrases de référence et l'interface disent la même chose", () => {
  test("chaque phrase du serveur est, mot pour mot, celle de l'interface allemande", () => {
    const ui = de.briefing as Record<string, string>;
    for (const [key, text] of Object.entries(REFERENCE_DE)) expect(ui[key]).toBe(text);
  });
});
