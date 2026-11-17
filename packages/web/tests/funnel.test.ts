import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FUNNEL_STEPS, isFirstQuestion } from "../src/web/lib/funnel";
import { waitLineKey } from "../src/web/lib/import-wait-lines";
import { sentryScope } from "../src/api/lib/sentry";

const read = (p: string) => readFileSync(join(import.meta.dir, "../src", p), "utf8");

describe("tunnel d'activation (PostHog)", () => {
  test("les cinq événements, dans l'ordre du brief", () => {
    expect([...FUNNEL_STEPS]).toEqual(["user_signed_up", "pdf_upload_started", "pdf_upload_completed", "first_question_asked", "video_generated"]);
  });

  test("chaque événement est branché à l'endroit où l'étape se produit", () => {
    expect(read("web/pages/login.tsx")).toContain('funnel.signedUp("email")');
    const lib = read("web/components/document-library.tsx");
    expect((lib.match(/funnel\.uploadStarted\(/g) ?? []).length).toBe(2);
    expect((lib.match(/funnel\.uploadCompleted\(/g) ?? []).length).toBe(2);
    const chat = read("web/pages/chat.tsx");
    expect(chat).toContain("noteQuestionAsked({");
    expect(chat).toContain("funnel.videoGenerated(");
  });

  test("la première question : une seule fois, jamais pour un compte qui a déjà discuté", () => {
    expect(isFirstQuestion({ flagged: false, savedChats: 0, messagesInChat: 0 })).toBe(true);
    expect(isFirstQuestion({ flagged: true, savedChats: 0, messagesInChat: 0 })).toBe(false);
    expect(isFirstQuestion({ flagged: false, savedChats: 3, messagesInChat: 0 })).toBe(false);
    expect(isFirstQuestion({ flagged: false, savedChats: 0, messagesInChat: 2 })).toBe(false);
  });

  test("rien ne part sans consentement : tout passe par track()", () => {
    const src = read("web/lib/funnel.ts");
    expect(src).not.toContain("posthog");
    expect(read("web/lib/analytics.ts")).toContain('if (getConsent() !== "granted") return;');
  });
});

describe("Sentry", () => {
  test("serveur : étiquette de fonctionnalité, action, identifiant pseudonyme seulement", () => {
    const s = sentryScope({ feature: "pdf_parsing", userId: "u_123", action: "POST /api/documents/upload", tags: { stage: "extraction" } });
    expect(s.tags).toEqual({ feature: "pdf_parsing", action: "POST /api/documents/upload", stage: "extraction" });
    expect(s.user).toEqual({ id: "u_123" });
    expect(sentryScope({ feature: "video_generation" }).user).toBeNull();
  });

  test("branché : erreurs 500, extraction de PDF, vidéo, ErrorBoundary", () => {
    const api = read("api/index.ts");
    expect(api).toContain("app.onError(");
    expect(api).toContain('feature: "pdf_parsing"');
    expect(read("api/lib/queue/import-job.ts")).toContain('feature: "pdf_parsing"');
    expect(read("api/video/pipeline.ts")).toContain('feature: "video_generation"');
    expect(read("web/components/error-boundary.tsx")).toContain("captureClientError(error,");
    expect(read("api/lib/sentry.ts")).toContain("userInfo: false");
  });
});

describe("écran d'attente de l'import", () => {
  test("une phrase toutes les 5 s, puis le mot des gros documents après 30 s", () => {
    expect(waitLineKey(0)).toBe("library.wait.step1");
    expect(waitLineKey(4)).toBe("library.wait.step1");
    expect(waitLineKey(5)).toBe("library.wait.step2");
    expect(waitLineKey(10)).toBe("library.wait.step3");
    expect(waitLineKey(15)).toBe("library.wait.step1");
    expect(waitLineKey(29)).toBe("library.wait.step3");
    expect(waitLineKey(30)).toBe("library.wait.long");
    expect(waitLineKey(300)).toBe("library.wait.long");
  });

  test("les quatre phrases existent en de, en, fr, es", () => {
    for (const l of ["de", "en", "fr", "es"]) {
      const src = read(`web/i18n/messages/${l}.ts`);
      for (const k of ["step1:", "step2:", "step3:", "long:"]) expect(src).toContain(k);
    }
  });
});
