import { createGateway, generateText } from "ai";
const gateway = createGateway({ baseURL: process.env.AI_GATEWAY_BASE_URL, apiKey: process.env.AI_GATEWAY_API_KEY });
const system = `Du bist AeroStudy AI, Professor für Ingenieurwissenschaften. Erstelle eine vollständige Übungsklausur (Technische Mechanik, Balkenbiegung).
- Formeln als LaTeX zwischen $...$.
- Wo eine Skizze hilft (Balken, Querschnitt): füge einen \`\`\`tikz-Codeblock ein (nur \\begin{tikzpicture}...\\end{tikzpicture}).
- Erzeuge 3-5 Aufgaben mit Punkten (Summe 100) plus Bewertungsschema.
Gib AUSSCHLIESSLICH gültiges JSON zurück:
{"title": string, "points": number, "statement": string (Markdown mit LaTeX), "solution": string (Markdown mit LaTeX, Schritt für Schritt), "scale": string}`;
let ok=0, fail=0;
for (let i=0;i<4;i++){
  const { text } = await generateText({ model: gateway("anthropic/claude-sonnet-4.6"), system, prompt: "Erstelle jetzt die Übungsklausur als JSON." });
  const cleaned = text.replace(/^```(?:json)?/gm,"").replace(/```$/gm,"").trim();
  const s=cleaned.indexOf("{"),e=cleaned.lastIndexOf("}");
  const json=s>=0&&e>s?cleaned.slice(s,e+1):cleaned;
  try{JSON.parse(json);ok++;console.log(`run ${i}: OK (len ${text.length})`);}
  catch(err){fail++;const pos=+(err.message.match(/position (\d+)/)?.[1]||0);console.log(`run ${i}: FAIL ${err.message}`);console.log("  ->",JSON.stringify(json.slice(Math.max(0,pos-70),pos+70)));}
}
console.log(`\nTOTAL ok=${ok} fail=${fail}`);
