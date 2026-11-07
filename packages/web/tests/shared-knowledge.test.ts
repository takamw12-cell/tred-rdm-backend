import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { anonymize, contributionFrom } from "../src/api/lib/shared-knowledge";

const root = join(import.meta.dir, "..");

describe("Intelligence collective — fondations", () => {
  test("anonymize : e-mail, téléphone, matricule, lien, prénom annoncé", () => {
    const t = anonymize(
      "Ich heiße Lena Schmidt, Matrikelnummer 3123456, mail lena.s@fh-aachen.de, Tel. +49 241 6009 1234, siehe https://drive.example/lena",
    );
    expect(t).not.toMatch(/Lena|3123456|fh-aachen|6009|drive\.example/);
    expect(t).toContain("[Name]");
    expect(t).toContain("[Matrikelnummer]");
    expect(t).toContain("[E-Mail]");
    expect(t).toContain("[Telefon]");
    expect(t).toContain("[Link]");
  });

  test("anonymize ne casse pas le contenu technique", () => {
    const tech = "Mit $\\sum M_A = 0$: $B_y = \\frac{F \\cdot 2a}{3a} = 6{,}67\\,\\text{kN}$ bei F = 10 kN, Stab 7 mit -10 kN (Druck).";
    expect(anonymize(tech)).toBe(tech);
  });

  test("contributionFrom borne et anonymise chaque champ", () => {
    const c = contributionFrom({ courseId: "c1", topic: "Ritterschnitt", question: "Ich heiße Tom. Wie?", answer: "x".repeat(20_000) });
    expect(c.question).toContain("[Name]");
    expect(c.answer.length).toBe(12_000);
  });

  test("routes : membre du cours exigé, auteur jamais renvoyé, contribution fermée", () => {
    const r = readFileSync(join(root, "src/api/routes/shared-knowledge.ts"), "utf8");
    expect(r).toMatch(/list: authed/);
    expect(r).toMatch(/upvote: authed/);
    expect(r).toContain("assertMember(context.user.id");
    expect(r).toContain('eq(sharedKnowledge.status, "published")');
    expect(r).toContain("NOT_IMPLEMENTED");
    const listBlock = r.slice(r.indexOf("list:"), r.indexOf("upvote:"));
    expect(listBlock).not.toContain("contributorId");
  });

  test("migration valide en SQLite, d'accord avec le schéma, un seul vote par étudiant", () => {
    const mig = readFileSync(join(root, "../../migre-shared-knowledge.mjs"), "utf8");
    const schema = readFileSync(join(root, "src/api/database/schema.ts"), "utf8");
    for (const col of ["course_id", "topic", "question", "answer", "upvotes", "status", "contributor_id", "created_at", "knowledge_id", "user_id"]) {
      expect(mig).toContain(`${col} `);
      expect(schema).toContain(`"${col}"`);
    }
    const db = new Database(":memory:");
    for (const m of mig.matchAll(/`(CREATE [\s\S]*?)`/g)) db.run(m[1]);
    db.run("INSERT INTO shared_knowledge_vote VALUES ('k1','u1',1)");
    expect(() => db.run("INSERT INTO shared_knowledge_vote VALUES ('k1','u1',2)")).toThrow();
  });
});
