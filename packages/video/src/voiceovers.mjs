// Les textes des voix off (validés par le fondateur le 2026-11-10).
// Voix : les voix par défaut d'ElevenLabs déjà utilisées par l'app
// (packages/web/src/api/avatar/elevenlabs.ts), modèle multilingue.
export const VOICEOVERS = [
  {
    id: "fr",
    voiceId: "Xb7hH8MSUJpSbSDYk0k2", // « Alice » — la voix de Dr. Aiko
    text:
      "TRED n'est pas seulement pour les ingénieurs. Que tu étudies la médecine, le droit ou l'économie, TRED s'adapte à ta filière. Il t'aide à structurer ton raisonnement, à analyser des documents complexes et à préparer tes examens. Avec TRED, toutes les matières deviennent accessibles. L'université dans ta poche.",
  },
  {
    id: "de",
    voiceId: "JBFqnCBsd6RMkjVDRZzb", // « George » — la voix de Prof. Ren
    text:
      "Von der Elektrotechnik bis zur Informatik. TRED ist dein intelligenter Lernbegleiter. Analysiere komplexe Schaltungen, verstehe Programmiersprachen und löse technische Probleme Schritt für Schritt. Unsere präzisen Solver garantieren dir 100 % korrekte Ergebnisse. Meistere dein Studium mit TRED.",
  },
  {
    id: "en",
    voiceId: "nPczCjzI2devNBz1zQrb", // « Brian » — la voix de Sensei Haruto
    text:
      "Mastering Technische Mechanik and Aerospace Engineering. TRED gives you a personal AI tutor that draws, calculates, and explains every single step. Upload your own documents, choose your virtual professor, and solve complex engineering problems with exact deterministic solvers. TRED: The ultimate engineering tutor.",
  },
  // ── Série « université universelle » (2026-11-10), 45 s ──────────────
  {
    id: "en1",
    voiceId: "Xb7hH8MSUJpSbSDYk0k2", // « Alice »
    speed: 0.95,
    text:
      "TRED is not just for engineers. Whether you are studying medicine, law, or economics, TRED adapts to your field. It helps you structure your reasoning, analyze complex documents, and prepare for your exams. With TRED, every subject becomes accessible. The university in your pocket.",
  },
  {
    id: "en2",
    voiceId: "JBFqnCBsd6RMkjVDRZzb", // « George »
    speed: 0.95,
    text:
      "From medical diagnoses to legal arguments, from financial analysis to mechanical engineering. TRED is the ultimate universal tutor. Upload your own documents, choose your virtual professor, and master any subject with exact, deterministic solvers. TRED: Learn anything, anywhere.",
  },
  {
    id: "en3",
    voiceId: "nPczCjzI2devNBz1zQrb", // « Brian »
    speed: 0.95,
    text:
      "Welcome to the future of learning. TRED adapts to your learning style, whether you are visual, auditory, or interactive. Experience education that feels alive, powered by deterministic AI. TRED: Your personal university.",
  },
  {
    id: "de1",
    voiceId: "Xb7hH8MSUJpSbSDYk0k2", // « Alice »
    speed: 0.95,
    text:
      "Nicht nur für Ingenieure. TRED ist dein universeller Lernbegleiter für Jura, Medizin und viele weitere Fächer. Strukturiere deine Gutachten, verstehe komplexe medizinische Zusammenhänge und bereite dich optimal auf deine Prüfungen vor. TRED: Die Universität für deine Hosentasche.",
  },
  {
    id: "de2",
    voiceId: "nPczCjzI2devNBz1zQrb", // « Brian »
    speed: 0.95,
    text:
      "Von der Wirtschaftswissenschaft bis zur Ingenieurmathematik. TRED bietet dir präzise Werkzeuge für jedes Studium. Analysiere komplexe Daten, löse Gleichungen Schritt für Schritt und meistere deine Klausuren mit einem virtuellen Professor an deiner Seite.",
  },
  {
    id: "de3",
    voiceId: "JBFqnCBsd6RMkjVDRZzb", // « George »
    speed: 0.95,
    text:
      "Egal ob Geisteswissenschaften, Ingenieurwesen oder Medizin: TRED passt sich dir an. Wähle deinen persönlichen Professor, lade deine eigenen Dokumente hoch und lerne so, wie es für dich am besten funktioniert. TRED: Deine persönliche Universität.",
  },
];

// ── Campagne « parle comme un ami » (2026-11-11), 30 s ──────────────────
// Textes du fondateur, écrits à l'oral. Modèle eleven_v4 (le plus naturel),
// stabilité basse (émotion), style modéré, une voix « conversational »
// différente par vidéo. `language` force la phonétique allemande.
const TALK = { model: "eleven_v4", settings: { stability: 0.3, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true } };
export const CAMPAIGN = [
  { id: "c1-en", language: "en", voiceId: "iP95p4xoKVk53GoZ742B", ...TALK, // Chris — charming, down-to-earth
    text: "Okay, let's be real. You're studying medicine, law, or engineering, and you're drowning in PDFs. Right? Well, TRED is your way out. It's not just an AI. It's your personal university in your pocket. No cap." },
  { id: "c1-de", language: "de", voiceId: "cjVigY5qzO86Huf0OWal", ...TALK, // Eric — smooth, trustworthy
    text: "Seien wir mal ehrlich. Ob Jura, Medizin oder Ingenieurwesen... du ertrinkst in Skripten. Oder? TRED ist deine Rettung. Keine Maschine, sondern deine persönliche Uni für die Hosentasche." },
  { id: "c2-en", language: "en", voiceId: "cgSgspJ2msm6clMCkdW9", ...TALK, // Jessica — playful, bright
    text: "Imagine having a professor who actually gets you. You ask a question, and boom, a virtual whiteboard opens up. Step by step. Just like in class, but way better." },
  { id: "c2-de", language: "de", voiceId: "SAz9YHcvj6GT2YYXdXww", ...TALK, // River — relaxed, neutral
    text: "Stell dir vor, du hast einen Professor, der dich wirklich versteht. Du stellst eine Frage, und bam! Eine interaktive Tafel öffnet sich. Schritt für Schritt. Wie in der Vorlesung, nur besser." },
  { id: "c3-en", language: "en", voiceId: "bIHbv24MWmeRgasZH58o", ...TALK, // Will — relaxed optimist
    text: "Sick of AI making up math? Yeah, me too. TRED doesn't guess. It uses real solvers. Every formula, every calculation, is 100% checked. You can actually trust it with your grades." },
  { id: "c3-de", language: "de", voiceId: "CwhRBWXzGAHq8TQ4Fs17", ...TALK, // Roger — laid-back, casual
    text: "Keine Lust mehr auf KI, die sich Mathe ausdenkt? Ja, ich auch nicht. TRED rät nicht. Es nutzt echte Solver. Jede Formel, jede Rechnung ist 100% geprüft. Darauf kannst du dich verlassen." },
  { id: "c4-en", language: "en", voiceId: "IKne3meq5aSn9XLyUdCD", ...TALK, // Charlie — confident, hyped
    text: "Exam in two days? Don't panic. Just open TRED. Throw your old exams at it, and it creates a custom simulation for you. You practice, it corrects. Boom. You're ready." },
  { id: "c4-de", language: "de", voiceId: "wWWn96OtTHu1sn8SRGEr", ...TALK, // Hale — expressive, upbeat
    text: "Klausur in zwei Tagen? Keine Panik. Öffne einfach TRED. Lade deine Altklausuren hoch, und es baut dir eine individuelle Simulation. Du übst, es korrigiert. Boom. Du bist bereit." },
  { id: "c5-en", language: "en", voiceId: "FGY2WhTYpPnrIDTdsKH5", ...TALK, // Laura — enthusiast, quirky
    text: "Learning shouldn't feel like a punishment. TRED looks incredible, works flawlessly, and actually makes studying... kinda fun? Yeah, I said it." },
  { id: "c5-de", language: "de", voiceId: "TX3LPaxmHKxFdv7VOQHJ", ...TALK, // Liam — energetic
    text: "Lernen sollte sich nicht wie eine Strafe anfühlen. TRED sieht fantastisch aus, läuft flüssig und macht das Lernen tatsächlich... irgendwie spaßig? Ja, ich hab's gesagt." },
];
