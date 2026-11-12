import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  berlinDayKey,
  cycleDue,
  decideAction,
  inSendWindow,
  intervalHoursFromEnv,
  MAX_NOTIFICATIONS_PER_DAY,
  type RetentionContext,
  type RetentionUser,
} from "../src/api/lib/retention/agent";

/** L'agent de rétention : des règles déterministes, testées une à une. */

const NOW = new Date("2026-11-07T10:00:00Z"); // 11 h à Berlin
const H = 60 * 60_000;
const D = 24 * H;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const student = (over: Partial<RetentionUser> = {}): RetentionUser => ({
  id: "u1",
  locale: "de",
  createdAt: ago(60 * D),
  hasPush: true,
  ...over,
});
const ctx = (over: Partial<RetentionContext> = {}): RetentionContext => ({
  now: NOW,
  lastActivityAt: ago(1 * H),
  notificationsToday: 0,
  dueFlashcards: 0,
  dueGaps: 0,
  failedGaps: [],
  lastInactivityNudgeAt: null,
  inactivityNudgesSinceActivity: 0,
  dismissedNudges30d: 0,
  ...over,
});
const gap = (hoursAgo: number, id = "g1") => ({ id, topic: "Technische Mechanik", label: "Vorzeichen der Querkraft", lastSeen: ago(hoursAgo * H) });

describe("Inactivité > 3 jours → relance (send_push_notification)", () => {
  test("inactif 4 jours → notification push, avec les révisions en attente", () => {
    const d = decideAction(student(), ctx({ lastActivityAt: ago(4 * D), dueFlashcards: 5, dueGaps: 1 }));
    expect(d.action).toBe("send_push_notification");
    if (d.action === "none") throw new Error();
    expect(d.channel).toBe("push");
    expect(d.message.body).toContain("6 Wiederholungen");
    expect(d.reason).toBe("Inaktiv seit 4 Tagen, 6 fällig");
    expect(d.screen).toBe("review");
  });

  test("étudiant web (pas de mobile) → même relance, dans la boîte de réception", () => {
    const d = decideAction(student({ hasPush: false }), ctx({ lastActivityAt: ago(5 * D) }));
    expect(d).toMatchObject({ action: "send_push_notification", channel: "inbox" });
  });

  test("inactif 2 jours → pas de relance ; jamais actif mais inscrit il y a 4 jours → relance", () => {
    expect(decideAction(student(), ctx({ lastActivityAt: ago(2 * D) })).action).toBe("none");
    expect(decideAction(student({ createdAt: ago(4 * D) }), ctx({ lastActivityAt: null })).action).toBe("send_push_notification");
    expect(decideAction(student({ createdAt: ago(1 * D) }), ctx({ lastActivityAt: null })).action).toBe("none");
  });

  test("frein : pas deux relances à moins de 3 jours, rien après 3 sans retour ni après 2 refus", () => {
    const inactive = { lastActivityAt: ago(10 * D) };
    expect(decideAction(student(), ctx({ ...inactive, lastInactivityNudgeAt: ago(1 * D), inactivityNudgesSinceActivity: 1 })).action).toBe("none");
    expect(decideAction(student(), ctx({ ...inactive, lastInactivityNudgeAt: ago(4 * D), inactivityNudgesSinceActivity: 1 })).action).toBe("send_push_notification");
    expect(decideAction(student(), ctx({ ...inactive, lastInactivityNudgeAt: ago(4 * D), inactivityNudgesSinceActivity: 3 }))).toMatchObject({
      action: "none",
      reason: "3 Erinnerungen ohne Rückkehr — Agent wartet",
    });
    expect(decideAction(student(), ctx({ ...inactive, dismissedNudges30d: 2 })).action).toBe("none");
  });

  test("un étudiant inactif ne reçoit QUE la relance (ni cartes, ni récapitulatif)", () => {
    const d = decideAction(student(), ctx({ lastActivityAt: ago(4 * D), failedGaps: [gap(72)], dueFlashcards: 3 }));
    expect(d.action).toBe("send_push_notification");
    const blocked = decideAction(student(), ctx({ lastActivityAt: ago(4 * D), lastInactivityNudgeAt: ago(1 * D), failedGaps: [gap(72)], dueFlashcards: 3 }));
    expect(blocked.action).toBe("none");
  });
});

describe("Exercice échoué il y a plus de 48 h → create_flashcard", () => {
  test("lacune vue il y a 49 h → proposition de Karteikarten sur ce sujet", () => {
    const d = decideAction(student(), ctx({ failedGaps: [gap(49)] }));
    expect(d.action).toBe("create_flashcard");
    if (d.action === "none") throw new Error();
    expect(d.gapId).toBe("g1");
    expect(d.message.title).toBe("Karteikarten zu „Vorzeichen der Querkraft“?");
    expect(d.message.body).toContain("(Technische Mechanik)");
  });

  test("vue il y a 47 h → pas encore (le récapitulatif passe si des cartes sont dues)", () => {
    expect(decideAction(student(), ctx({ failedGaps: [gap(47)] })).action).toBe("none");
    expect(decideAction(student(), ctx({ failedGaps: [gap(47)], dueFlashcards: 2 })).action).toBe("send_daily_digest");
  });

  test("plusieurs lacunes → la plus ancienne d'abord", () => {
    const d = decideAction(student(), ctx({ failedGaps: [gap(60, "recent"), gap(200, "ancienne")] }));
    expect(d.action === "create_flashcard" && d.gapId).toBe("ancienne");
  });
});

describe("Cartes dues → send_daily_digest", () => {
  test("3 cartes et 1 lacune dues → récapitulatif", () => {
    const d = decideAction(student(), ctx({ dueFlashcards: 3, dueGaps: 1 }));
    expect(d.action).toBe("send_daily_digest");
    if (d.action === "none") throw new Error();
    expect(d.message.body).toBe("Heute fällig: 3 Karteikarten und 1 Lücke.");
    expect(d.href).toBe("/flashcards");
  });

  test("rien de dû, rien d'échoué, actif → rien", () => {
    expect(decideAction(student(), ctx())).toEqual({ action: "none", reason: "Nichts zu tun" });
  });
});

describe("Limite : au plus 1 notification par jour", () => {
  test("déjà une aujourd'hui → rien, même inactif ou avec des cartes dues", () => {
    expect(MAX_NOTIFICATIONS_PER_DAY).toBe(1);
    for (const over of [{ lastActivityAt: ago(5 * D) }, { dueFlashcards: 4 }, { failedGaps: [gap(72)] }]) {
      expect(decideAction(student(), ctx({ ...over, notificationsToday: 1 })).action).toBe("none");
    }
  });
});

describe("Langues", () => {
  test("fr, en, es ; langue inconnue → allemand", () => {
    const due = ctx({ dueFlashcards: 1 });
    expect(decideAction(student({ locale: "fr" }), due)).toMatchObject({ message: { title: "Ta révision du jour" } });
    expect(decideAction(student({ locale: "en" }), due)).toMatchObject({ message: { body: "Due today: 1 flashcard." } });
    expect(decideAction(student({ locale: "es" }), due)).toMatchObject({ message: { title: "Tu repaso de hoy" } });
    expect(decideAction(student({ locale: "ja" }), due)).toMatchObject({ message: { title: "Deine Wiederholung für heute" } });
  });
});

describe("Battement : fenêtre, jour de Berlin, intervalle", () => {
  test("jour de Berlin (minuit en été et en hiver)", () => {
    expect(berlinDayKey(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02"); // 00:30 à Berlin
    expect(berlinDayKey(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01"); // 23:30 à Berlin
  });
  test("fenêtre d'envoi 9 h–20 h Berlin", () => {
    expect(inSendWindow(new Date("2026-11-07T08:30:00Z"))).toBe(true); // 9:30
    expect(inSendWindow(new Date("2026-11-07T07:30:00Z"))).toBe(false); // 8:30
    expect(inSendWindow(new Date("2026-11-07T19:30:00Z"))).toBe(false); // 20:30
  });
  test("intervalle : 12 h par défaut, borné", () => {
    expect(intervalHoursFromEnv(undefined)).toBe(12);
    expect(intervalHoursFromEnv("24")).toBe(24);
    expect(intervalHoursFromEnv("0")).toBe(12);
    expect(intervalHoursFromEnv("9999")).toBe(168);
    expect(cycleDue(0, NOW, 12)).toBe(true);
    expect(cycleDue(NOW.getTime() - 11 * H, NOW, 12)).toBe(false);
    expect(cycleDue(NOW.getTime() - 12 * H, NOW, 12)).toBe(true);
  });
});

describe("Câblage", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

  test("serveur : routeur, démarrage du battement, relance du soir sans doublon", () => {
    const api = read("src/api/index.ts");
    expect(api).toContain("  retention,\n};");
    expect(api).toContain("startRetentionHeartbeat();");
    expect(read("src/api/lib/evening-reminder.ts")).toContain("if (await retentionAgentActive()) return { envoyes: 0, vises: 0, alertesQuota };");
  });

  test("en pause par défaut, et tant que la table manque", () => {
    const store = read("src/api/lib/retention/store.ts");
    expect(store).toContain('return row ? row.value !== "0" : true;');
    const migration = readFileSync(join(import.meta.dir, "../../../migre-retention.mjs"), "utf8");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS user_notifications");
    expect(migration).toContain("VALUES ('paused', '1'");
  });

  test("web : boîte de réception sur le tableau de bord, page /admin/retention ; mobile : tap = ouverte", () => {
    expect(read("src/web/pages/dashboard.tsx")).toContain("<NotificationInbox />");
    expect(read("src/web/app.tsx")).toContain('<Route path="/admin/retention">{() => <AdminGate><AdminRetentionPage /></AdminGate>}</Route>');
    expect(existsSync(join(import.meta.dir, "../src/web/pages/admin-retention.tsx"))).toBe(true);
    const mobile = readFileSync(join(import.meta.dir, "../../mobile/hooks/use-notifications.ts"), "utf8");
    expect(mobile).toContain("client.retention.open({ id: data.notificationId })");
  });
});
