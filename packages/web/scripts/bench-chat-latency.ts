/**
 * Benchmark de latence du chat — appels RÉELS à Anthropic (payants, ~0,5–1 €).
 *
 *   cd C:\dev\tred-rdm\aerostudy-ai\packages\web
 *   bun --env-file=../../.env scripts/bench-chat-latency.ts
 *
 * Il faut ANTHROPIC_API_KEY dans le .env (jamais commité). Pour chaque
 * question, trois appels avec le VRAI prompt du tuteur :
 *
 *   avant   comportement d'avant le 7 nov. 2026 : Sonnet + raisonnement
 *           adaptive pour tout ; extraits différents à chaque question, donc
 *           cache manqué (on force un préfixe unique)
 *   après-1 routage (lib/chat-routing.ts), premier passage
 *   après-2 même question, cache chaud — la situation d'un étudiant qui
 *           enchaîne les questions
 *
 * Mesures : premier mot visible (TTFT), durée totale, tokens relus du cache.
 */
import { buildTutorAgent } from "../src/api/agent/index";
import { routeChat } from "../src/api/lib/chat-routing";
import { detectDomain } from "../src/api/lib/solvers/domain";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY manquante — ajoute-la au .env (jamais commité), puis relance.");
  process.exit(1);
}

const QUESTIONS = [
  "Hallo!",
  "Explique la loi d'Ohm",
  "Was ist ein Biegemoment?",
  "Berechne für 192.168.10.77/26 die Netzadresse und die Broadcastadresse.",
  "Ein Ball wird mit 20 m/s unter 45° vom Boden geworfen. Berechne die Wurfweite.",
];

async function run(question: string, mode: "avant" | "après") {
  const r = routeChat({ text: question, domain: detectDomain(question).domain });
  const agent = buildTutorAgent({
    locale: "de",
    sources: [],
    // « avant » : un nom d'école unique change le bloc système → cache manqué,
    // comme quand les extraits étaient dans le bloc mis en cache.
    ...(mode === "avant" ? { university: `FH Aachen (bench ${Date.now()})` } : {}),
    route: mode === "avant" ? undefined : r,
  });
  const t0 = Date.now();
  let firstText: number | null = null;
  const result = await agent.stream({ prompt: question });
  for await (const part of result.fullStream) {
    if (part.type === "text-delta" && firstText === null) firstText = Date.now() - t0;
  }
  const usage = await result.totalUsage;
  return {
    ttft: firstText,
    total: Date.now() - t0,
    cacheRead: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    tier: mode === "avant" ? "sonnet+thinking" : `${r.tier} (${r.modelId.replace("anthropic/", "")}, thinking=${r.thinking})`,
  };
}

const rows: string[] = [];
for (const q of QUESTIONS) {
  const before = await run(q, "avant");
  const after1 = await run(q, "après");
  const after2 = await run(q, "après");
  const fmt = (x: { ttft: number | null; total: number; cacheRead: number }) =>
    `TTFT ${x.ttft === null ? "-" : (x.ttft / 1000).toFixed(1) + " s"} · total ${(x.total / 1000).toFixed(1)} s · cache ${x.cacheRead} tok`;
  rows.push(`« ${q} »\n  avant   : ${fmt(before)}\n  après-1 : ${fmt(after1)}  [${after1.tier}]\n  après-2 : ${fmt(after2)}`);
  console.log(rows[rows.length - 1]);
}
