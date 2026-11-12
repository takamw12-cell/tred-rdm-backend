/**
 * Essai réel de « Als Video erklären », sans serveur ni compte : un extrait de
 * cours et une question par filière → le VRAI prompt, le VRAI modèle, le VRAI
 * contrôle, le VRAI solveur. Écrit les props de la composition, pour en rendre
 * des images (packages/video).
 *
 *   bun --env-file=../../.env scripts/explainer-trial.ts <dossier de sortie>
 *
 * Un appel au modèle par filière (quelques centimes). Aucune voix n'est
 * générée : les mots sont horodatés à 150 mots par minute.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateObject } from "ai";
import { gateway } from "../src/api/agent/gateway";
import { PRIMARY_MODEL } from "../src/api/lib/ai-models";
import { LANGUAGES } from "../src/api/lib/languages";
import { isRealImageKey } from "../src/api/lib/video-visuals";
import { buildVideoPrompt, countWords, resolveBeam, sceneStartsMs, solverSource, validateVideoScript, videoScriptSchema, type VideoSource, type VoiceWord } from "../src/api/lib/video-script";

const CASES: { id: string; language: string; question: string; sources: VideoSource[] }[] = [
  {
    id: "mecanique",
    language: "fr",
    question: "Explique-moi la flexion d'une poutre",
    sources: [
      {
        title: "TM2_Skript_Kapitel3.pdf",
        kind: "vorlesung",
        content:
          "3 Biegung des Balkens\n\nEin Balken ist ein Bauteil, das Lasten quer zu seiner Achse abträgt. Unter einer Querbelastung biegt sich der Balken durch: die oberen Fasern werden gestaucht, die unteren Fasern werden gedehnt. Dazwischen liegt die neutrale Faser, die ihre Länge nicht ändert.\n\n" +
          "3.1 Schnittgrößen\nDie Belastung erzeugt im Balken die Querkraft Q(x) und das Biegemoment M(x). Das Biegemoment ist dort am größten, wo die Querkraft null wird.\n\n" +
          "3.2 Beispiel: Einfeldträger mit Gleichstreckenlast\nEin Balken der Länge l = 4 m liegt auf einem Festlager A und einem Loslager B. Er trägt über die gesamte Länge die Gleichstreckenlast q = 2 kN/m. Aus Symmetriegründen tragen beide Lager die Last zu gleichen Teilen. Das größte Biegemoment tritt in der Feldmitte auf und beträgt M_max = q·l²/8.\n\n" +
          "3.3 Biegespannung\nDie Biegespannung ergibt sich aus dem Biegemoment und dem Widerstandsmoment: sigma = M / W. Sie ist am Rand des Querschnitts am größten.",
      },
    ],
  },
  {
    id: "droit",
    language: "fr",
    question: "Explique-moi le vol",
    sources: [
      {
        title: "Strafrecht_BT_Skript.pdf",
        kind: "vorlesung",
        content:
          "§ 242 StGB Diebstahl\n\n(1) Wer eine fremde bewegliche Sache einem anderen in der Absicht wegnimmt, die Sache sich oder einem Dritten rechtswidrig zuzueignen, wird mit Freiheitsstrafe bis zu fünf Jahren oder mit Geldstrafe bestraft.\n(2) Der Versuch ist strafbar.\n\n" +
          "Prüfungsschema\nI. Objektiver Tatbestand: Es muss eine fremde bewegliche Sache vorliegen. Die Tathandlung ist die Wegnahme. Wegnahme ist der Bruch fremden und die Begründung neuen, nicht notwendigerweise tätereigenen Gewahrsams.\n" +
          "II. Subjektiver Tatbestand: Der Täter muss vorsätzlich handeln und zusätzlich die Zueignungsabsicht haben. Die Zueignungsabsicht besteht aus dem Willen zur dauernden Enteignung und der Absicht der zumindest vorübergehenden Aneignung.\n" +
          "III. Rechtswidrigkeit und Schuld werden im Anschluss geprüft.\n\n" +
          "Abgrenzung: Fehlt es an der Wegnahme, weil der Täter die Sache bereits in Gewahrsam hat, kommt Unterschlagung nach § 246 StGB in Betracht.",
      },
    ],
  },
  {
    id: "medecine",
    language: "fr",
    question: "Explique-moi le cycle cardiaque",
    sources: [
      {
        title: "Physiologie_Herz_VL07.pdf",
        kind: "vorlesung",
        content:
          "Der Herzzyklus\n\nDer Herzzyklus beschreibt die Abfolge von Kontraktion und Erschlaffung des Herzens. Er gliedert sich in die Systole und die Diastole.\n\n" +
          "Systole: Sie beginnt mit der Anspannungsphase. Alle Herzklappen sind geschlossen, der Druck in der Kammer steigt, das Volumen bleibt gleich. Übersteigt der Kammerdruck den Druck in der Aorta, öffnet sich die Aortenklappe und die Austreibungsphase beginnt: Das Blut wird in den Kreislauf ausgeworfen.\n\n" +
          "Diastole: In der Entspannungsphase sind wieder alle Klappen geschlossen und der Kammerdruck fällt. Sinkt er unter den Vorhofdruck, öffnen sich die Segelklappen und die Füllungsphase beginnt: Das Blut strömt aus den Vorhöfen in die Kammern. Am Ende der Füllungsphase unterstützt die Vorhofkontraktion die Füllung.\n\n" +
          "Merke: Die Taschenklappen öffnen sich in der Austreibungsphase, die Segelklappen in der Füllungsphase. Beide Klappentypen sind nie gleichzeitig geöffnet.",
      },
    ],
  },
];

const out = process.argv[2] ?? "explainer-test";
if (!existsSync(out)) mkdirSync(out, { recursive: true });

const only = process.argv[3];
for (const c of CASES.filter((x) => !only || x.id === only)) {
  const language = LANGUAGES[c.language]!;
  const { system, prompt } = buildVideoPrompt({ language, sources: c.sources, question: c.question, answer: "" });
  const started = Date.now();
  const { object } = await generateObject({ model: gateway(PRIMARY_MODEL), schema: videoScriptSchema, system, prompt, abortSignal: AbortSignal.timeout(120_000) });
  const resolved = resolveBeam(object, c.sources, c.question);
  const all = resolved.run ? [...c.sources, solverSource(resolved.run)] : c.sources;
  const checked = validateVideoScript(object, all, c.question, { beam: resolved.payload !== null });
  console.log(`\n── ${c.id} : « ${c.question} » (${Math.round((Date.now() - started) / 1000)} s)`);
  console.log(`   écrites ${object.scenes.length} scènes · ordres : ${object.scenes.map((s) => `${s.stage}:${s.visual_cues.join("+")}`).join(", ")}`);
  console.log(`   contexte : ${object.backdrop}`);
  console.log(`   poutre : ${resolved.payload ? "calculée par le solveur" : (resolved.rejected ?? "aucune")}`);
  console.log(`   rejetées : ${checked.dropped.map((d) => `#${d.index + 1} ${d.reason}${d.detail ? `(${d.detail})` : ""}`).join(", ") || "aucune"}`);
  if (!checked.ok) {
    console.log(`   REFUSÉ : ${checked.error}`);
    continue;
  }
  console.log(`   gardées ${checked.scenes.length} scènes, ${checked.words} mots · visuels : ${checked.scenes.map((s) => s.visual + (s.image ? `:${s.image}` : "")).join(", ")}`);
  checked.scenes.forEach((s, i) => console.log(`     ${i + 1}. [${s.stage} · ${s.visual_cues.join("+")}] ${s.heading}${s.steps.length ? " → " + s.steps.join(" › ") : ""}${s.keywords.length ? " ★ " + s.keywords.join(", ") : ""}`));

  // Pas de voix : 150 mots par minute, pour rendre des images.
  const words: VoiceWord[] = [];
  let t = 300;
  for (const s of checked.scenes) for (const w of s.voiceover.split(/\s+/).filter(Boolean)) (words.push({ text: w, startMs: t, endMs: t + 330 }), (t += 400));
  writeFileSync(
    join(out, `${c.id}.json`),
    JSON.stringify({
      audioUrl: "",
      durationMs: t + 1500,
      title: checked.title,
      scenes: checked.scenes,
      words,
      sceneStartsMs: sceneStartsMs(checked.scenes, words),
      beam: resolved.payload,
      backdrop: isRealImageKey(object.backdrop) ? object.backdrop : null,
      wordCount: countWords(checked.scenes.map((s) => s.voiceover).join(" ")),
    }),
  );
}
