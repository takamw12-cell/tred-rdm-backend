// Faux services pour le test de charge LOCAL (scripts/simulate-users.mjs).
//
//   bun scripts/stress-mocks.mjs
//
// Trois petits serveurs, tous sur 127.0.0.1, pour que le serveur de test ne
// parle à AUCUN service réel ni payant :
//
//   · faux Anthropic  (4598) : POST /v1/messages — une réponse écrite d'avance,
//     en flux (SSE) comme le vrai. Le serveur TRED y va grâce à
//     ANTHROPIC_BASE_URL=http://127.0.0.1:4598/v1 (lue par @ai-sdk/anthropic).
//   · faux stockage S3 (4599) : PUT / GET / HEAD / DELETE, fichiers sur disque
//     dans un dossier temporaire (un lot de 1 000 robots ne tient pas en mémoire).
//   · faux Sentry      (4597) : reçoit les enveloppes d'erreurs et les compte.
//     Le serveur TRED y va grâce à SENTRY_DSN=http://stress@127.0.0.1:4597/1.
//
// Chaque faux service répond à GET /__stats (JSON) : le script de simulation
// les relit pour le rapport. ElevenLabs n'a PAS de faux : son adresse est
// écrite en dur dans api/video/pipeline.ts, donc la vidéo reste « non
// configurée » (503) pendant le test — rien n'est facturé.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const PORT_AI = Number(process.env.STRESS_AI_PORT ?? 4598);
const PORT_S3 = Number(process.env.STRESS_S3_PORT ?? 4599);
const PORT_SENTRY = Number(process.env.STRESS_SENTRY_PORT ?? 4597);
/** Délai avant le premier mot et entre deux morceaux : l'ordre de grandeur du vrai modèle. */
const FIRST_TOKEN_MS = Number(process.env.STRESS_AI_FIRST_MS ?? 900);
const CHUNK_MS = Number(process.env.STRESS_AI_CHUNK_MS ?? 120);

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Faux Anthropic ─────────────────────────────────────────────────────── */

// Aucun chiffre dans le texte : le verrou « résultat sans solveur » du tuteur
// ne doit pas prendre cette réponse pour un calcul fait à la main.
const ANSWER =
  "Gute Frage. Stell dir das System wie einen Rucksack vor: Was du hineinlegst, bleibt drin, " +
  "bis du es wieder herausnimmst. Genau so verhält sich die Bilanz in deinem Skript. " +
  "Zuerst legst du die Systemgrenze fest, dann schreibst du auf, was hinein- und was hinausgeht, " +
  "und erst danach setzt du die Größen ein. Der häufigste Fehler ist, die Grenze zu vergessen. " +
  "Kannst du mir in einem Satz sagen, wo in deiner Aufgabe die Systemgrenze liegt?";

const ai = { requests: 0, streamed: 0, toolCalls: 0, open: 0, peakOpen: 0, models: {} };

/** Une valeur plausible pour un schéma JSON : assez pour passer la validation d'un outil. */
function fill(schema) {
  if (!schema || typeof schema !== "object") return "Stresstest";
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "object" || schema.properties) {
    const out = {};
    for (const key of schema.required ?? []) out[key] = fill(schema.properties?.[key]);
    return out;
  }
  if (type === "array") return [];
  if (type === "number" || type === "integer") return 1;
  if (type === "boolean") return false;
  return "Stresstest";
}

/** Le dernier message porte-t-il déjà le résultat d'un outil ? Alors le modèle doit répondre en texte. */
function afterToolResult(body) {
  const last = body.messages?.[body.messages.length - 1];
  return Array.isArray(last?.content) && last.content.some((part) => part?.type === "tool_result");
}

function forcedTool(body) {
  const choice = body.tool_choice;
  if (!choice || (choice.type !== "any" && choice.type !== "tool") || afterToolResult(body)) return null;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const tool =
    (choice.type === "tool" && tools.find((t) => t.name === choice.name)) || tools.find((t) => t.name === "kein_loeser_vorhanden") || tools[0];
  if (!tool) return null;
  // Générateur de cas (Fall-Check / Arcade) : des cas dont la preuve est une
  // phrase RÉELLE du document reçu, pour que la vérification mot pour mot du
  // serveur passe comme en production.
  if (tool.input_schema?.properties?.faelle) return { name: tool.name, input: { faelle: casesFrom(promptText(body)) } };
  return { name: tool.name, input: fill(tool.input_schema) };
}

/** Sortie structurée native (output_config.format) : un JSON conforme au schéma demandé. */
function structuredText(body) {
  const schema = body.output_config?.format?.schema;
  if (!schema) return null;
  if (schema.properties?.faelle) return JSON.stringify({ faelle: casesFrom(promptText(body)) });
  return JSON.stringify(fill(schema));
}

function promptText(body) {
  return (body.messages ?? []).map((m) => (typeof m.content === "string" ? m.content : (m.content ?? []).map((p) => p?.text ?? "").join(" "))).join("\n");
}

/** Jusqu'à 5 cas, chacun bâti sur une phrase du document (8 mots au moins). */
function casesFrom(text) {
  const doc = text.replace(/\[\[SEITE \d+\]\]/g, " ").replace(/<[^>]+>/g, " ");
  const sentences = [...new Set(doc.split(/(?<=[.!?])\s+/).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.split(" ").length >= 8 && x.length < 300))].slice(0, 5);
  return sentences.map((beleg, i) => ({
    situation: `Testfall ${i + 1}: ${beleg.slice(0, 120)}`,
    frage: "Welche Aussage stimmt laut Skript?",
    optionen: ["Laut Skript richtig", "Eine Verwechslung", "Ein typischer Fehler", "Gilt nur im Sonderfall"],
    richtig: 0,
    erklaerung: "So steht es im Skript.",
    beleg,
  }));
}

const aiServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__stats") return json(res, 200, ai);
  if (req.method !== "POST" || !url.pathname.endsWith("/messages")) return json(res, 404, { type: "error", error: { type: "not_found_error", message: "stress mock" } });

  let body = {};
  try {
    body = JSON.parse((await readBody(req)).toString("utf8"));
  } catch {
    return json(res, 400, { type: "error", error: { type: "invalid_request_error", message: "invalid json" } });
  }
  ai.requests += 1;
  ai.models[body.model] = (ai.models[body.model] ?? 0) + 1;
  const tool = forcedTool(body);
  if (tool) ai.toolCalls += 1;
  const id = `msg_stress_${ai.requests}`;
  const usage = { input_tokens: 1200, output_tokens: 90, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  if (!body.stream) {
    await sleep(FIRST_TOKEN_MS);
    return json(res, 200, {
      id,
      type: "message",
      role: "assistant",
      model: body.model,
      content: tool ? [{ type: "tool_use", id: `toolu_${ai.requests}`, name: tool.name, input: tool.input }] : [{ type: "text", text: structuredText(body) ?? ANSWER }],
      stop_reason: tool ? "tool_use" : "end_turn",
      stop_sequence: null,
      usage,
    });
  }

  ai.streamed += 1;
  ai.open += 1;
  ai.peakOpen = Math.max(ai.peakOpen, ai.open);
  let closed = false;
  res.on("close", () => {
    if (!closed) ai.open -= 1;
    closed = true;
  });
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send("message_start", { message: { id, type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
  await sleep(FIRST_TOKEN_MS);
  if (tool) {
    send("content_block_start", { index: 0, content_block: { type: "tool_use", id: `toolu_${ai.requests}`, name: tool.name, input: {} } });
    send("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } });
  } else {
    send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    for (const piece of ANSWER.match(/.{1,28}(\s|$)/g) ?? [ANSWER]) {
      if (closed) break;
      send("content_block_delta", { index: 0, delta: { type: "text_delta", text: piece } });
      await sleep(CHUNK_MS);
    }
  }
  send("content_block_stop", { index: 0 });
  send("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: usage.output_tokens } });
  send("message_stop", {});
  res.end();
});

/* ── Faux stockage S3 ───────────────────────────────────────────────────── */

// Un arrêt brutal (Windows) ne passe pas par le ménage de fin : on retire ici les dossiers des lancements précédents.
for (const name of fs.readdirSync(os.tmpdir())) {
  if (name.startsWith("tred-stress-s3-")) fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const s3Dir = fs.mkdtempSync(path.join(os.tmpdir(), "tred-stress-s3-"));
const s3 = { puts: 0, gets: 0, deletes: 0, bytes: 0, objects: 0, dir: s3Dir };
const s3Types = new Map();
const s3File = (key) => path.join(s3Dir, Buffer.from(key).toString("hex").slice(0, 200));

const s3Server = http.createServer(async (req, res) => {
  const key = new URL(req.url, "http://x").pathname;
  if (key === "/__stats") return json(res, 200, s3);
  const file = s3File(key);
  if (req.method === "PUT") {
    const body = await readBody(req);
    if (!fs.existsSync(file)) s3.objects += 1;
    fs.writeFileSync(file, body);
    s3Types.set(key, req.headers["content-type"] ?? "application/octet-stream");
    s3.puts += 1;
    s3.bytes += body.byteLength;
    res.writeHead(200, { ETag: '"stress"' });
    return res.end();
  }
  if (req.method === "DELETE") {
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      s3.objects -= 1;
    }
    s3.deletes += 1;
    res.writeHead(204);
    return res.end();
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404, { "content-type": "application/xml" });
    return res.end("<Error><Code>NoSuchKey</Code></Error>");
  }
  const body = fs.readFileSync(file);
  s3.gets += 1;
  const type = s3Types.get(key) ?? "application/octet-stream";
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : body.byteLength - 1, body.byteLength - 1);
    res.writeHead(206, { "content-type": type, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${body.byteLength}`, "accept-ranges": "bytes" });
    return res.end(req.method === "HEAD" ? undefined : body.subarray(start, end + 1));
  }
  res.writeHead(200, { "content-type": type, "content-length": String(body.byteLength), "accept-ranges": "bytes" });
  res.end(req.method === "HEAD" ? undefined : body);
});

/* ── Faux Sentry ────────────────────────────────────────────────────────── */

const sentry = { envelopes: 0, events: 0, titles: {} };

const sentryServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__stats") return json(res, 200, sentry);
  if (req.method !== "POST") return json(res, 200, {});
  let raw = await readBody(req);
  try {
    if (req.headers["content-encoding"] === "gzip") raw = zlib.gunzipSync(raw);
    else if (req.headers["content-encoding"] === "br") raw = zlib.brotliDecompressSync(raw);
  } catch {
    /* enveloppe illisible : comptée quand même */
  }
  sentry.envelopes += 1;
  // Une enveloppe = des lignes JSON ; celle d'un événement porte `exception`.
  for (const line of raw.toString("utf8").split("\n")) {
    if (!line.includes('"exception"')) continue;
    try {
      const event = JSON.parse(line);
      const first = event.exception?.values?.[0];
      const title = `${first?.type ?? "Error"}: ${String(first?.value ?? "").slice(0, 120)}`;
      sentry.events += 1;
      sentry.titles[title] = (sentry.titles[title] ?? 0) + 1;
    } catch {
      /* ligne tronquée */
    }
  }
  json(res, 200, { id: "stress" });
});

aiServer.listen(PORT_AI, "127.0.0.1", () => console.log(`faux Anthropic : http://127.0.0.1:${PORT_AI}/v1`));
s3Server.listen(PORT_S3, "127.0.0.1", () => console.log(`faux S3        : http://127.0.0.1:${PORT_S3} (fichiers dans ${s3Dir})`));
sentryServer.listen(PORT_SENTRY, "127.0.0.1", () => console.log(`faux Sentry    : http://127.0.0.1:${PORT_SENTRY}`));

const cleanup = () => {
  fs.rmSync(s3Dir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
