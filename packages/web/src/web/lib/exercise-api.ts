/**
 * Génération d'exercices et de Klausuren (serveur : /api/agent/exercise).
 * Partagé par la page Exercices et le Prüfungsmodus.
 */
import { paywallFromResponse } from "@/lib/paywall";

export interface GeneratedExercise {
  title: string;
  points: number;
  statement: string;
  solution: string;
  scale: string;
  /**
   * Document du Lehrender dont le style a été repris — posé par le SERVEUR,
   * qui l'a injecté dans le prompt. null = aucune Altklausur trouvée.
   * Absent sur les exercices d'avant cette fonction (historique).
   */
  styleSource?: { id: string; title: string; kind: string } | null;
}

export async function generateExercise(body: Record<string, unknown>): Promise<GeneratedExercise> {
  const res = await fetch("/api/agent/exercise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Limite du mois : la fenêtre de limite s'ouvre à la place d'une erreur muette.
  await paywallFromResponse(res, "exercise");
  if (!res.ok || !res.body) throw new Error("generation_failed");

  // The server streams NDJSON: repeated {"type":"ping"} heartbeats to keep the
  // connection warm through proxies (a Klausur can take 2-3 min), then a final
  // {"type":"result", ...} or {"type":"error"} line.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: GeneratedExercise | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: { type?: string } & Partial<GeneratedExercise>;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.type === "ping") continue;
      if (msg.type === "error") throw new Error("generation_failed");
      if (msg.type === "result") {
        final = {
          title: String(msg.title ?? ""),
          points: Number(msg.points ?? 0),
          statement: String(msg.statement ?? ""),
          solution: String(msg.solution ?? ""),
          scale: String(msg.scale ?? ""),
          styleSource: msg.styleSource ?? null,
        };
      }
    }
  }
  if (!final) throw new Error("generation_failed");
  return final;
}
