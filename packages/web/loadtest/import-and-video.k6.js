// Test de charge de TRED : 100 imports simultanés, puis 50 générations vidéo
// simultanées, pendant qu'une sonde mesure le temps de réponse de l'API.
//
//   k6 run packages/web/loadtest/import-and-video.k6.js
//   k6 run -e BASE=http://localhost:3000 -e VIDEO_START=40s packages/web/loadtest/import-and-video.k6.js
//
// ── JAMAIS CONTRE LA PRODUCTION ───────────────────────────────────────────
// Le test crée dix comptes, dépose cent documents et demande cinquante vidéos.
// En production, cinquante vidéos = cinquante appels payants à Claude et à
// ElevenLabs. On le lance sur un serveur LOCAL ou de recette : base de test,
// REDIS_URL, stockage objet, et — pour ne mesurer que la file — des clés
// factices sur le worker (les travaux vidéo échouent alors sans rien coûter,
// la route, elle, répond comme en vrai). Voir GUIDE_FOUNDER.md.
//
// ── Ce que le test respecte ───────────────────────────────────────────────
// Les limites de la production restent en place : 10 imports par heure et
// 5 vidéos par jour et par compte. D'où DIX comptes : 10 × 10 imports,
// 10 × 5 vidéos. Un 429 inattendu fait échouer le test.
//
// ── Ce qu'il mesure ───────────────────────────────────────────────────────
//   · enqueue : POST /api/documents/upload et POST /api/video/generate
//               (la réponse doit arriver sans attendre le traitement) ;
//   · status  : GET /api/jobs/:jobId (le suivi par le navigateur) ;
//   · api     : GET /api/health pendant toute la charge.
// Seuil : 95 % des réponses sous 500 ms pour les trois. La taille de la file
// Redis se lit à côté : bun packages/web/loadtest/queue-watch.ts
import http from "k6/http";
import exec from "k6/execution";
import { check, fail, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.BASE || "http://localhost:3000").replace(/\/$/, "");
// L'origine attendue par le serveur (WEBSITE_URL) : par défaut, la même adresse.
const ORIGIN = __ENV.ORIGIN || BASE;
const USERS = 10;
const IMPORTS = 100;
const VIDEOS = 50;
const PDF = open("./fixtures/skript.pdf", "b");

const importDone = new Trend("import_total_ms", true);
const importsOk = new Counter("imports_done");
const importsFailed = new Counter("imports_failed");
const videosQueued = new Counter("videos_queued");

export const options = {
  scenarios: {
    // 100 imports lancés au même instant.
    imports: { executor: "per-vu-iterations", vus: IMPORTS, iterations: 1, maxDuration: "5m", exec: "importOne" },
    // 50 vidéos lancées au même instant, une fois les documents importés (une vidéo s'appuie sur le cours).
    videos: { executor: "per-vu-iterations", vus: VIDEOS, iterations: 1, maxDuration: "3m", exec: "videoOne", startTime: __ENV.VIDEO_START || "40s" },
    // La sonde : dix requêtes par seconde sur l'API pendant toute la charge.
    probe: { executor: "constant-arrival-rate", rate: 10, timeUnit: "1s", duration: __ENV.PROBE || "70s", preAllocatedVUs: 5, maxVUs: 20, exec: "probe" },
  },
  thresholds: {
    "http_req_duration{kind:enqueue}": ["p(95)<500"],
    "http_req_duration{kind:status}": ["p(95)<500"],
    "http_req_duration{kind:api}": ["p(95)<500"],
    "http_req_failed{kind:enqueue}": ["rate<0.01"],
    "http_req_failed{kind:api}": ["rate<0.01"],
    imports_failed: ["count==0"],
  },
};

const cookieHeader = (res) =>
  Object.entries(res.cookies)
    .map(([name, values]) => `${name}=${values[0].value}`)
    .join("; ");

/**
 * Dix comptes de test, créés par groupes de trois séparés par onze secondes de
 * pause : l'inscription est limitée (trois de suite, puis dix secondes de
 * silence), comme en production. Le test ne contourne aucune limite — la
 * préparation dure donc une bonne demi-minute.
 */
export function setup() {
  const stamp = Date.now();
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const res = http.post(
      `${BASE}/api/auth/sign-up/email`,
      JSON.stringify({ email: `charge.${stamp}.${i}@tred.test`, password: `Charge-${stamp}-${i}!`, name: `Test Charge ${i}` }),
      { headers: { "Content-Type": "application/json", Origin: ORIGIN }, tags: { kind: "setup" } },
    );
    const cookie = cookieHeader(res);
    if (res.status !== 200 || !cookie) {
      fail(`inscription du compte ${i} : HTTP ${res.status}. Le test demande un serveur de TEST (sans vérification d'e-mail). ${String(res.body).slice(0, 160)}`);
    }
    users.push(cookie);
    sleep(i % 3 === 2 ? 11 : 0.3);
  }
  return { users };
}

// Le numéro d'itération dans le scénario (0…99, 0…49) répartit exactement :
// dix imports et cinq vidéos par compte. (Les numéros de VU, eux, ne se suivent pas.)
const headersOf = (data) => ({ Cookie: data.users[exec.scenario.iterationInTest % USERS], Origin: ORIGIN });

export function importOne(data) {
  const headers = headersOf(data);
  const started = Date.now();
  const res = http.post(`${BASE}/api/documents/upload`, { file: http.file(PDF, `skript-${__VU}.pdf`, "application/pdf"), title: `Skript ${__VU}`, kind: "other" }, { headers, tags: { kind: "enqueue" } });
  const queued = check(res, {
    "import : 202 et un jobId (traité en arrière-plan)": (r) => r.status === 202 && Boolean(r.json("jobId")),
  });
  if (!queued) {
    console.error(`import VU ${__VU} : HTTP ${res.status} ${String(res.body).slice(0, 140)}`);
    importsFailed.add(1);
    return;
  }
  const jobId = res.json("jobId");
  // Le navigateur interroge l'état toutes les 1,2 s : le test aussi.
  for (let i = 0; i < 200; i++) {
    sleep(1.2);
    const st = http.get(`${BASE}/api/jobs/${jobId}`, { headers, tags: { kind: "status" } });
    const status = st.status === 200 ? st.json("status") : null;
    if (status === "done") {
      importDone.add(Date.now() - started);
      importsOk.add(1);
      return;
    }
    if (status === "failed") {
      console.error(`import ${jobId} : failed (${st.json("error")})`);
      importsFailed.add(1);
      return;
    }
  }
  importsFailed.add(1);
}

export function videoOne(data) {
  const headers = { ...headersOf(data), "Content-Type": "application/json" };
  const res = http.post(
    `${BASE}/api/video/generate`,
    JSON.stringify({ question: "Was ist das Biegemoment?", answer: "Das Biegemoment ist M = F mal l.", language: "de" }),
    { headers, tags: { kind: "enqueue" } },
  );
  const queued = check(res, {
    "vidéo : 202 et un id (traitée en arrière-plan)": (r) => r.status === 202 && Boolean(r.json("id")),
  });
  if (!queued) {
    // 503 not_configured : le serveur de test n'a ni clé de modèle ni clé de voix (même factices).
    console.error(`vidéo VU ${__VU} : HTTP ${res.status} ${String(res.body).slice(0, 140)}`);
    return;
  }
  videosQueued.add(1);
  const id = res.json("id");
  for (let i = 0; i < 5; i++) {
    sleep(1.5);
    http.get(`${BASE}/api/jobs/${id}`, { headers, tags: { kind: "status" } });
  }
}

export function probe() {
  const res = http.get(`${BASE}/api/health`, { tags: { kind: "api" } });
  check(res, { "API : répond pendant la charge": (r) => r.status === 200 });
}
