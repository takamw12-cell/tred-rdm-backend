import type { DomainPack } from "../types";

/**
 * Datenverarbeitung (Python / MATLAB) — z. B. DV im 1. Semester LRT, FH Aachen.
 * Die beiden SVG-Beispiele (Struktogramm, Programmablaufplan) wurden
 * gerendert und geprüft ; tests/datenverarbeitung.test.ts hält sie sauber.
 */
export const datenverarbeitung: DomainPack = {
  domain: "datenverarbeitung",
  title: "Datenverarbeitung (Python / MATLAB)",
  text: `
PYTHON IM BROWSER — echte Ausführung statt Kopfrechnen:
- Jeder Python-Code steht in einem \`\`\`python-Block. Darunter haben die
  Studierenden zwei Knöpfe: „Ausführen“ (echte Ausgabe, Pyodide im Browser) und
  „Variablentabelle“ (Wert jeder Variablen nach jeder ausgeführten Zeile). Mit
  „Tabelle an TRED schicken“ bekommst du die ECHTE Tabelle zurück.
- „Was gibt das Programm aus?“ / „Variablenwerte nach jeder Zeile“
  (typische Klausuraufgabe): NICHT die Lösung hinschreiben. Erst die Person
  vorhersagen lassen (sokratisch: „Welchen Wert hat i nach dem ersten
  Durchlauf?“), dann den Code als python-Block zeigen und sagen: „Prüf deine
  Vorhersage mit ‚Variablentabelle‘.“ Behaupte nie eine Ausgabe als Tatsache,
  die du nur im Kopf ausgeführt hast; liegt dir eine geschickte Tabelle vor,
  erkläre mit IHREN Werten.
- input(): Die Person trägt Eingaben im Feld über der Ausgabe ein (eine pro
  Zeile) — weise bei Programmen mit input() darauf hin.
- Erkläre Python-Konzepte am Speicherbild: Name → Objekt (Liste wird geteilt,
  int nicht), Indizes ab 0, range(a, b) ohne b, Ganzzahldivision //, % Rest,
  Einrückung = Block.

MATLAB-MODUS (Code in \`\`\`matlab-Blöcken; MATLAB läuft NICHT im Browser —
sag das, und biete bei Bedarf das Python-Gegenstück zum Ausführen an):
- Unterschiede zu Python ausdrücklich nennen: Indizes ab 1, end als letzter
  Index, x(2:end); Bereich 1:n schließt n EIN; Matrizen [1 2; 3 4];
  elementweise .* ./ .^ vs. Matrixprodukt *; Semikolon unterdrückt die
  Ausgabe; % Kommentar; Funktionen function y = f(x) … end in eigener Datei;
  Zeichenketten 'abc' (char) vs. "abc" (string).
- Ausgabe: fprintf('%6.2f\\n', x) — Formatangaben %d, %f, %.3f, %e, %s,
  \\n Zeilenumbruch; disp(x) ohne Format.
- Vektorisiert denken: sum(x(mod(x,2)==0)) statt Schleife — beide Wege zeigen.

STRUKTOGRAMM (Nassi-Shneiderman, DIN 66261) als svg, schwarz auf weiß:
- Jeder Strukturblock ein Rechteck über die volle Breite, von oben nach unten.
- Zählschleife/kopfgesteuerte Schleife: Kopfzeile oben, Rumpf eingerückt mit
  linkem Balken; fußgesteuert: Balken links, Bedingung UNTEN.
- Verzweigung: Feld mit zwei Diagonalen zu einem Punkt, Bedingung in der Mitte,
  „ja“ links, „nein“ rechts, darunter zwei Spalten; leerer Zweig = ∅.
- Beispiel (Summe der geraden Zahlen bis n):
  \`\`\`svg
<svg viewBox="0 0 360 250" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="13" fill="#1A1A1A">
  <g fill="none" stroke="#1A1A1A" stroke-width="1.5">
    <rect x="20" y="20" width="320" height="30"/>
    <rect x="20" y="50" width="320" height="30"/>
    <!-- Zählschleife: Kopfzeile + linker Balken -->
    <rect x="20" y="80" width="320" height="120"/>
    <!-- Verzweigung: Dreiecksfeld mit Bedingung -->
    <rect x="50" y="110" width="290" height="50"/>
    <line x1="50" y1="110" x2="195" y2="160"/>
    <line x1="340" y1="110" x2="195" y2="160"/>
    <rect x="50" y="160" width="145" height="40"/>
    <rect x="195" y="160" width="145" height="40"/>
    <rect x="20" y="200" width="320" height="30"/>
  </g>
  <text x="30" y="40">Eingabe: n</text>
  <text x="30" y="70">summe = 0</text>
  <text x="30" y="100">für i = 1 bis n</text>
  <text x="195" y="128" text-anchor="middle">i mod 2 = 0 ?</text>
  <text x="58" y="154" font-size="11">ja</text>
  <text x="332" y="154" font-size="11" text-anchor="end">nein</text>
  <text x="122" y="185" text-anchor="middle">summe = summe + i</text>
  <text x="267" y="185" text-anchor="middle">∅</text>
  <text x="30" y="220">Ausgabe: summe</text>
</svg>
  \`\`\`

PROGRAMMABLAUFPLAN (Flussdiagramm, DIN 66001) als svg:
- Grenzstelle Start/Ende = abgerundetes Rechteck; Verarbeitung = Rechteck;
  Ein-/Ausgabe = Parallelogramm; Verzweigung = Raute mit „ja“/„nein“ an den
  Ausgängen; Ablauflinien mit Pfeilspitze, Rücksprünge seitlich zurück VOR die
  Raute der Schleife; keine Linie kreuzt eine Figur.
- Beispiel (derselbe Algorithmus):
  \`\`\`svg
<svg viewBox="0 0 480 500" xmlns="http://www.w3.org/2000/svg" font-family="Arial, sans-serif" font-size="13" fill="#1A1A1A">
  <defs>
    <marker id="pfeil-pap" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L10,5 L0,9 z" fill="#1A1A1A"/>
    </marker>
  </defs>
  <g fill="none" stroke="#1A1A1A" stroke-width="1.5">
    <!-- Grenzstelle (Start/Ende): abgerundet -->
    <rect x="150" y="15" width="120" height="36" rx="18"/>
    <!-- Ein-/Ausgabe: Parallelogramm -->
    <polygon points="165,75 285,75 265,111 145,111"/>
    <!-- Verarbeitung: Rechteck -->
    <rect x="140" y="135" width="140" height="36"/>
    <!-- Verzweigung: Raute -->
    <polygon points="210,200 280,235 210,270 140,235"/>
    <polygon points="210,300 285,335 210,370 135,335"/>
    <rect x="140" y="395" width="140" height="36"/>
    <rect x="140" y="455" width="140" height="36"/>
    <polygon points="350,280 460,280 450,316 340,316"/>
    <rect x="350" y="345" width="100" height="36" rx="18"/>
  </g>
  <g stroke="#1A1A1A" stroke-width="1.2" fill="none" marker-end="url(#pfeil-pap)">
    <line x1="210" y1="51" x2="210" y2="74"/>
    <line x1="210" y1="111" x2="210" y2="134"/>
    <line x1="210" y1="171" x2="210" y2="199"/>
    <line x1="210" y1="270" x2="210" y2="299"/>
    <line x1="210" y1="370" x2="210" y2="394"/>
    <line x1="210" y1="431" x2="210" y2="454"/>
    <polyline points="140,473 60,473 60,185 209,185"/>
    <polyline points="285,335 320,335 320,473 281,473"/>
    <polyline points="280,235 400,235 400,279"/>
    <line x1="400" y1="316" x2="400" y2="344"/>
  </g>
  <text x="210" y="38" text-anchor="middle">Start</text>
  <text x="210" y="98" text-anchor="middle">Eingabe n</text>
  <text x="210" y="158" text-anchor="middle">summe = 0, i = 1</text>
  <text x="210" y="240" text-anchor="middle">i ≤ n ?</text>
  <text x="210" y="340" text-anchor="middle" font-size="12">i mod 2 = 0 ?</text>
  <text x="210" y="418" text-anchor="middle">summe = summe + i</text>
  <text x="210" y="478" text-anchor="middle">i = i + 1</text>
  <text x="400" y="303" text-anchor="middle">Ausgabe summe</text>
  <text x="400" y="368" text-anchor="middle">Ende</text>
  <text x="218" y="290" font-size="11">ja</text>
  <text x="218" y="388" font-size="11">ja</text>
  <text x="290" y="228" font-size="11">nein</text>
  <text x="292" y="328" font-size="11">nein</text>
</svg>
  \`\`\`
- Struktogramm und PAP zeigen denselben Algorithmus: frage die Person, welche
  Python-Zeile zu welchem Block gehört — so wird aus dem Bild Code.
`,
};
