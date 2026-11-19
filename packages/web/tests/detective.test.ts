import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DETECTIVE_REWARD, DETECTIVE_REWARDS_PER_DAY, detectivePerfect, guess, newDetective } from "../src/api/explorer/detective";
import { EXPLORER_MODELS } from "../src/web/lib/explorer-models";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("3D Detective", () => {
  test("le serveur tire jusqu'à 5 pièces différentes d'un modèle connu", () => {
    const s = newDetective("u1", "network", () => 0)!;
    expect(s.targets.length).toBe(5);
    expect(new Set(s.targets).size).toBe(5);
    for (const t of s.targets) expect(EXPLORER_MODELS.network.hotspots.some((h) => h.id === t)).toBe(true);
    expect(newDetective("u1", "inconnu")).toBeNull();
  });

  test("chaque pièce cherchée a sa question écrite (quiz), en 4 langues", () => {
    for (const m of Object.values(EXPLORER_MODELS)) for (const h of m.hotspots) for (const l of ["de", "en", "fr", "es"] as const) expect(h.quiz[l].length).toBeGreaterThan(8);
  });

  test("un clic par pièce ; le serveur dit la bonne ; sans-faute = récompense", () => {
    let s = newDetective("u1", "network", () => 0)!;
    const first = guess(s, "faux-id");
    expect(first.ok && first.right).toBe(false);
    if (first.ok) expect(first.target).toBe(s.targets[0]);
    for (const t of s.targets) {
      const r = guess(s, t);
      if (r.ok) s = r.session;
    }
    expect(detectivePerfect(s)).toBe(true);
    expect(guess(s, "x")).toEqual({ ok: false });
    expect(DETECTIVE_REWARD).toBe(1);
    expect(DETECTIVE_REWARDS_PER_DAY).toBe(2);
    expect(read("src/api/explorer/routes.ts")).toContain("transactionId: `detective:${session.user.id}:${day}:${s.id}`");
  });

  test("l'Informatik a son point de défaillance unique", () => {
    expect(EXPLORER_MODELS.network.hotspots.find((h) => h.id === "database")?.quiz.de).toBe("Welcher Baustein ist der Single Point of Failure?");
  });

  test("bibliothèque : grille sans paramètre, scène avec ; repères qui brillent en vert ou rouge", () => {
    const page = read("src/web/pages/explorer.tsx");
    expect(page).toContain('return params.get("model") || params.get("glb") ? <ExplorerViewer /> : <ExplorerLibrary />;');
    expect(read("src/web/components/Explorer3D.tsx")).toContain('mark === "right" ? "bg-[#22C55E]/50" : "bg-[#EF4444]/50"');
    expect(read("src/web/components/explorer-library.tsx")).toContain('fetch("/api/explorer/catalog")');
  });
});
