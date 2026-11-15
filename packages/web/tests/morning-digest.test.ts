import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectCounts, headline, inSendWindow, mergeVideoRows, renderDigest, type DigestData } from "../src/api/lib/morning-digest";

/**
 * Le résumé du matin (2026-11-15) : chaque jour à 8 h (Berlin), un e-mail aux
 * administrateurs — « X visiteurs, Y inscriptions, Z imports, W vidéos
 * générées » sur 24 h, et le détail par lien de campagne (par vidéo).
 */

const NOW = Date.parse("2026-11-15T07:00:00Z"); // 8 h à Berlin (heure d'hiver)
const H = 3_600_000;

const base: DigestData = {
  until: NOW,
  visitors24: 12,
  visitors7: 40,
  signups24: 3,
  signups7: 9,
  imports24: 5,
  videos24: 2,
  videosFailed24: 0,
  utmMigrated: true,
  byVideo: [],
};

describe("la ligne demandée par le fondateur", () => {
  test("« X visiteurs, Y inscriptions, Z imports, W vidéos générées »", () => {
    expect(headline(base)).toBe("12 visiteurs, 3 inscriptions, 5 imports, 2 vidéos générées");
  });

  test("le singulier s'accorde : 0 et 1 ne prennent pas de « s »", () => {
    expect(headline({ ...base, visitors24: 1, signups24: 1, imports24: 1, videos24: 1 })).toBe("1 visiteur, 1 inscription, 1 import, 1 vidéo générée");
    expect(headline({ ...base, visitors24: 0, signups24: 0, imports24: 0, videos24: 0 })).toBe("0 visiteur, 0 inscription, 0 import, 0 vidéo générée");
  });

  test("PostHog pas interrogeable depuis le serveur : on le dit, on n'invente pas un zéro", () => {
    const line = headline({ ...base, visitors24: null, visitors7: null });
    expect(line).toBe("visiteurs non disponibles, 3 inscriptions, 5 imports, 2 vidéos générées");
    expect(renderDigest({ ...base, visitors24: null, visitors7: null }).text).toContain("POSTHOG_PERSONAL_API_KEY");
  });

  test("table des vidéos absente : « non disponible », pas zéro", () => {
    expect(headline({ ...base, videos24: null })).toBe("12 visiteurs, 3 inscriptions, 5 imports, vidéos non disponibles");
  });
});

describe("par vidéo : visites (PostHog) et inscriptions (base) sur le même lien", () => {
  const signups24 = [{ source: "tiktok", campaign: "survive-klausur", content: "bio", signups: 2 }];
  const signups7 = [
    { source: "tiktok", campaign: "survive-klausur", content: "bio", signups: 4 },
    { source: "snapchat", campaign: "survive-klausur", content: "sk1", signups: 1 },
  ];
  const visits = [
    { source: "tiktok", campaign: "survive-klausur", content: "bio", visitors24: 8, visitors7: 30 },
    { source: "snapchat", campaign: "survive-klausur", content: "sk2", visitors24: 5, visitors7: 5 },
    { source: null, campaign: null, content: null, visitors24: 1, visitors7: 6 },
  ];

  test("un lien = une ligne, quelle que soit la source du chiffre", () => {
    const rows = mergeVideoRows({ signups24, signups7, visits, totalSignups24: 3, totalSignups7: 9 });
    expect(rows.find((r) => r.content === "bio")).toEqual({ source: "tiktok", campaign: "survive-klausur", content: "bio", visitors24: 8, visitors7: 30, signups24: 2, signups7: 4 });
    // Inscrit sur 7 jours mais aucune visite mesurée (visiteurs sans consentement) : la ligne existe quand même.
    expect(rows.find((r) => r.content === "sk1")).toMatchObject({ visitors24: 0, visitors7: 0, signups24: 0, signups7: 1 });
    // Des visites, pas encore d'inscription.
    expect(rows.find((r) => r.content === "sk2")).toMatchObject({ visitors24: 5, signups24: 0, signups7: 0 });
  });

  test("le plus de trafic d'abord ; « sans lien de campagne » en dernier, avec le reste des inscriptions", () => {
    const rows = mergeVideoRows({ signups24, signups7, visits, totalSignups24: 3, totalSignups7: 9 });
    expect(rows.map((r) => r.content)).toEqual(["bio", "sk2", "sk1", null]);
    // 3 inscriptions en 24 h dont 2 attribuées → 1 sans lien ; 9 en 7 jours dont 5 attribuées → 4.
    expect(rows.at(-1)).toEqual({ source: null, campaign: null, content: null, visitors24: 1, visitors7: 6, signups24: 1, signups7: 4 });
  });

  test("sans PostHog : les visites restent inconnues (null), les inscriptions sont là", () => {
    const rows = mergeVideoRows({ signups24, signups7, visits: null, totalSignups24: 3, totalSignups7: 9 });
    expect(rows[0]).toMatchObject({ content: "bio", visitors24: null, visitors7: null, signups7: 4 });
  });

  test("migration UTM pas lancée : aucune ligne par lien inventée", () => {
    expect(mergeVideoRows({ signups24: null, signups7: null, visits: null, totalSignups24: 3, totalSignups7: 9 })).toEqual([]);
  });
});

describe("l'e-mail", () => {
  const data: DigestData = {
    ...base,
    byVideo: [
      { source: "tiktok", campaign: "survive-klausur", content: "bio", visitors24: 8, visitors7: 30, signups24: 2, signups7: 4 },
      { source: null, campaign: null, content: null, visitors24: 4, visitors7: 10, signups24: 1, signups7: 5 },
    ],
  };

  test("objet et première ligne : le résumé, daté à l'heure de Berlin", () => {
    const mail = renderDigest(data);
    expect(mail.subject).toBe("TRED · 15 nov. : 12 visiteurs, 3 inscriptions, 5 imports, 2 vidéos générées");
    expect(mail.text).toContain("12 visiteurs, 3 inscriptions, 5 imports, 2 vidéos générées");
    expect(mail.text).toContain("15 nov. à 08:00");
  });

  test("une ligne par lien, 24 h et 7 jours côte à côte", () => {
    const mail = renderDigest(data);
    expect(mail.text).toContain("tiktok · survive-klausur · bio : 8 visiteurs, 2 inscriptions (7 jours : 30 visiteurs, 4 inscriptions)");
    expect(mail.text).toContain("sans lien de campagne : 4 visiteurs, 1 inscription (7 jours : 10 visiteurs, 5 inscriptions)");
    expect(mail.html).toContain("tiktok · survive-klausur · bio");
  });

  test("dit d'où viennent les chiffres : visiteurs = seulement ceux qui ont accepté la mesure", () => {
    expect(renderDigest(data).text).toMatch(/accepté la mesure d'audience/);
  });

  test("migration UTM absente : l'e-mail le dit au lieu de montrer un tableau vide", () => {
    const mail = renderDigest({ ...base, utmMigrated: false });
    expect(mail.text).toContain("migre-utm.mjs");
  });

  test("des vidéos en échec sont signalées", () => {
    expect(renderDigest({ ...base, videosFailed24: 2 }).text).toContain("2 vidéos en échec");
  });

  test("un paramètre UTM piégé ne devient jamais du HTML", () => {
    const mail = renderDigest({ ...base, byVideo: [{ source: "tiktok", campaign: '"><script>alert(1)</script>', content: "<img src=x onerror=alert(1)>", visitors24: 1, visitors7: 1, signups24: 1, signups7: 1 }] });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  test("aucune donnée personnelle : des comptes, jamais une adresse ni un nom", () => {
    const mail = renderDigest(data);
    expect(`${mail.subject}${mail.text}${mail.html}`).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});

describe("l'heure d'envoi : 8 h à Berlin, été comme hiver", () => {
  test("hiver (UTC+1) : 7 h UTC", () => {
    expect(inSendWindow(new Date("2026-11-15T06:59:00Z"))).toBe(false);
    expect(inSendWindow(new Date("2026-11-15T07:00:00Z"))).toBe(true);
  });

  test("été (UTC+2) : 6 h UTC", () => {
    expect(inSendWindow(new Date("2026-07-01T05:59:00Z"))).toBe(false);
    expect(inSendWindow(new Date("2026-07-01T06:00:00Z"))).toBe(true);
  });

  test("rattrapage jusqu'à midi si le serveur redémarrait à 8 h ; plus après", () => {
    expect(inSendWindow(new Date("2026-11-15T10:59:00Z"))).toBe(true);
    expect(inSendWindow(new Date("2026-11-15T11:00:00Z"))).toBe(false);
    expect(inSendWindow(new Date("2026-11-15T18:00:00Z"))).toBe(false);
  });
});

/* ── Les comptes, sur une vraie base SQLite en mémoire ─────────────────── */

async function memoryDb(withVideos = true, withUtm = true) {
  const libsql = await import("@libsql/client");
  const dz = await import("drizzle-orm/libsql");
  const client = libsql.createClient({ url: ":memory:" });
  // Mêmes unités que la production : user et generated_video en MILLISECONDES, document en SECONDES.
  await client.execute(`CREATE TABLE user (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL${withUtm ? ", utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, utm_at INTEGER" : ""})`);
  await client.execute("CREATE TABLE document (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)");
  if (withVideos) await client.execute("CREATE TABLE generated_video (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL)");
  return { client, db: dz.drizzle(client) };
}

describe("les comptes des dernières 24 h (SQL réel)", () => {
  test("inscriptions, imports, vidéos : la fenêtre est respectée, dans l'unité de chaque table", async () => {
    const { client, db } = await memoryDb();
    const ms = (hoursAgo: number) => NOW - hoursAgo * H;
    const s = (hoursAgo: number) => Math.floor(ms(hoursAgo) / 1000);
    await client.execute(`INSERT INTO user (id, created_at, utm_source, utm_campaign, utm_content, utm_at) VALUES
      ('u1', ${ms(2)}, 'tiktok', 'survive-klausur', 'bio', ${ms(2)}),
      ('u2', ${ms(23)}, 'tiktok', 'survive-klausur', 'bio', ${ms(23)}),
      ('u3', ${ms(5)}, NULL, NULL, NULL, NULL),
      ('u4', ${ms(30)}, 'snapchat', 'survive-klausur', 'sk1', ${ms(30)}),
      ('u5', ${ms(24 * 9)}, 'tiktok', 'survive-klausur', 'bio', ${ms(24 * 9)})`);
    await client.execute(`INSERT INTO document (id, user_id, created_at) VALUES ('d1', 'u1', ${s(1)}), ('d2', 'u1', ${s(20)}), ('d3', 'u3', ${s(26)})`);
    await client.execute(`INSERT INTO generated_video (id, user_id, status, created_at) VALUES ('v1', 'u1', 'done', ${ms(3)}), ('v2', 'u1', 'failed', ${ms(4)}), ('v3', 'u2', 'pending', ${ms(1)}), ('v4', 'u4', 'done', ${ms(40)})`);

    // biome-ignore lint/suspicious/noExplicitAny: base de test réduite aux colonnes lues
    const counts = await collectCounts(db as any, NOW);
    expect(counts.signups24).toBe(3); // u1, u2, u3
    expect(counts.signups7).toBe(4); // + u4 ; u5 a 9 jours
    expect(counts.imports24).toBe(2); // d1, d2 ; d3 a 26 h
    expect(counts.videos24).toBe(1); // v1 terminée ; v3 encore en cours
    expect(counts.videosFailed24).toBe(1);
    expect(counts.signupsByVideo24).toEqual([{ source: "tiktok", campaign: "survive-klausur", content: "bio", signups: 2 }]);
    expect(counts.signupsByVideo7).toEqual([
      { source: "tiktok", campaign: "survive-klausur", content: "bio", signups: 2 },
      { source: "snapchat", campaign: "survive-klausur", content: "sk1", signups: 1 },
    ]);
  });

  test("un document daté en secondes n'est pas pris pour un document de 1970", async () => {
    const { client, db } = await memoryDb();
    await client.execute(`INSERT INTO document (id, user_id, created_at) VALUES ('d1', 'u1', ${Math.floor((NOW - H) / 1000)})`);
    // biome-ignore lint/suspicious/noExplicitAny: base de test réduite
    expect((await collectCounts(db as any, NOW)).imports24).toBe(1);
  });

  test("table generated_video absente : vidéos inconnues (null), le reste est compté", async () => {
    const { client, db } = await memoryDb(false);
    await client.execute(`INSERT INTO user (id, created_at) VALUES ('u1', ${NOW - H})`);
    // biome-ignore lint/suspicious/noExplicitAny: base de test réduite
    const counts = await collectCounts(db as any, NOW);
    expect(counts.videos24).toBeNull();
    expect(counts.signups24).toBe(1);
  });

  test("colonnes utm_* absentes (migration pas lancée) : pas de détail par lien, pas d'exception", async () => {
    const { client, db } = await memoryDb(true, false);
    await client.execute(`INSERT INTO user (id, created_at) VALUES ('u1', ${NOW - H})`);
    // biome-ignore lint/suspicious/noExplicitAny: base de test réduite
    const counts = await collectCounts(db as any, NOW);
    expect(counts.signupsByVideo24).toBeNull();
    expect(counts.signups24).toBe(1);
  });
});

describe("branchement", () => {
  const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");

  test("la boucle démarre avec le serveur, comme la relance du soir", () => {
    const INDEX = read("../src/api/index.ts");
    expect(INDEX).toContain('import { startMorningDigest } from "./lib/morning-digest-job";');
    expect(INDEX).toContain("startMorningDigest();");
  });

  test("un seul envoi par jour (verrou en base), destinataires = ADMIN_EMAILS, rien sans e-mail configuré", () => {
    const JOB = read("../src/api/lib/morning-digest-job.ts");
    expect(JOB).toContain('prendreLeVerrou(maintenant, JOB)');
    expect(JOB).toContain("adminWhitelist()");
    expect(JOB).toContain("mailConfigured()");
    expect(JOB).toContain('process.env.DISABLE_MORNING_DIGEST === "true"');
    // Les journaux ne portent que des comptes : jamais une adresse.
    expect(JOB).not.toMatch(/console\.(log|warn|error)\([^)]*\b(to|email|destinataire)\b[^)]*\$\{/);
  });
});
