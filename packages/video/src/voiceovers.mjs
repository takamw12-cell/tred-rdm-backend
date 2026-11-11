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
// Textes du fondateur, écrits à l'oral, version longue (70-75 mots) : la voix
// couvre toute la vidéo. Modèle eleven_v4 (le plus naturel), stabilité basse
// (émotion), style modéré, une voix « conversational » différente par vidéo.
// `language` force la phonétique allemande.
const TALK = { model: "eleven_v4", settings: { stability: 0.3, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true } };
export const CAMPAIGN = [
  { id: "c1-en", language: "en", voiceId: "iP95p4xoKVk53GoZ742B", ...TALK, // Chris — charming, down-to-earth
    text: "Okay, let's be completely real for a second. You are studying medicine, law, or engineering, and you are literally drowning in thousands of pages of PDFs and lecture notes. Right? Well, I've got some good news. TRED is your way out of this chaos. It's not just another AI chatbot. It's your personal, fully interactive university, right there in your pocket. It reads your own files, draws on a real whiteboard, and explains everything step by step, just like a real professor." },
  { id: "c1-de", language: "de", voiceId: "cjVigY5qzO86Huf0OWal", ...TALK, // Eric — smooth, trustworthy
    text: "Okay, seien wir mal komplett ehrlich. Du studierst Medizin, Jura oder Ingenieurwesen und ertrinkst buchstäblich in tausenden Seiten von PDFs und Skripten. Oder? Nun, ich habe gute Neuigkeiten. TRED ist dein Ausweg aus diesem Chaos. Es ist kein weiterer KI-Chatbot. Es ist deine persönliche, interaktive Universität für die Hosentasche. Es liest deine eigenen Dateien, zeichnet auf einem echten Whiteboard und erklärt alles Schritt für Schritt wie ein echter Professor." },
  { id: "c2-en", language: "en", voiceId: "cgSgspJ2msm6clMCkdW9", ...TALK, // Jessica — playful, bright
    text: "Imagine having a private professor who actually gets you. You're stuck on a complex circuit or a math problem. You just take a photo or ask a question, and boom—a virtual whiteboard opens up. You watch the solution get built step by step. Your virtual professor explains the intuition behind the formula, using real-world analogies that actually make sense. It's exactly like being in a private lecture hall, but you're in control." },
  { id: "c2-de", language: "de", voiceId: "SAz9YHcvj6GT2YYXdXww", ...TALK, // River — relaxed, neutral
    text: "Stell dir vor, du hast einen Privatdozenten, der dich wirklich versteht. Du hängst an einer komplexen Schaltung oder einem Mathe-Problem fest. Du machst einfach ein Foto oder stellst eine Frage, und bam! Eine interaktive Tafel öffnet sich. Du siehst, wie die Lösung Schritt für Schritt aufgebaut wird. Dein virtueller Professor erklärt die Intuition hinter der Formel mit echten Analogien, die Sinn machen. Es ist wie in einem privaten Hörsaal, nur dass du die Kontrolle hast." },
  { id: "c3-en", language: "en", voiceId: "bIHbv24MWmeRgasZH58o", ...TALK, // Will — relaxed optimist
    text: "Are you sick and tired of AI models making up math formulas that are completely wrong? Yeah, me too. That's why TRED doesn't guess. It uses deterministic, real-world solvers under the hood. Every single formula, every calculation, and every unit is a hundred percent checked and verified by code. You can actually trust it with your grades. No hallucinations, no fake results. Just pure, reliable engineering and science." },
  { id: "c3-de", language: "de", voiceId: "CwhRBWXzGAHq8TQ4Fs17", ...TALK, // Roger — laid-back, casual
    text: "Hast du auch die Nase voll von KI-Modellen, die sich Mathe-Formeln ausdenken, die völlig falsch sind? Ja, ich auch. Deshalb rät TRED nicht. Es nutzt deterministische, echte Solver unter der Haube. Jede Formel, jede Berechnung und jede Einheit ist zu hundert Prozent durch Code geprüft und verifiziert. Du kannst ihm deine Noten anvertrauen. Keine Halluzinationen, keine falschen Ergebnisse. Nur pure, zuverlässige Technik und Wissenschaft." },
  { id: "c4-en", language: "en", voiceId: "IKne3meq5aSn9XLyUdCD", ...TALK, // Charlie — confident, hyped
    text: "Got an exam in two days? Don't panic. Just open TRED. Throw your old exams and lecture scripts at it, and it instantly creates a custom exam simulation just for you. You practice under real conditions, it corrects your work step by step, and highlights exactly where you made a mistake. It works for engineering, medicine, law... whatever you throw at it. Boom. You're ready to crush it." },
  { id: "c4-de", language: "de", voiceId: "wWWn96OtTHu1sn8SRGEr", ...TALK, // Hale — expressive, upbeat
    text: "In zwei Tagen eine Klausur? Keine Panik. Öffne einfach TRED. Lade deine Altklausuren und Skripte hoch, und es erstellt sofort eine individuelle Prüfungssimulation für dich. Du übst unter echten Bedingungen, es korrigiert deine Arbeit Schritt für Schritt und zeigt dir genau, wo du einen Fehler gemacht hast. Es funktioniert für Ingenieurwesen, Medizin, Jura... was auch immer du ihm gibst. Boom. Du bist bereit." },
  { id: "c5-en", language: "en", voiceId: "FGY2WhTYpPnrIDTdsKH5", ...TALK, // Laura — enthusiast, quirky
    text: "Let's be honest. Learning shouldn't feel like a punishment. TRED looks absolutely incredible. With a premium dark mode, beautiful animations, and custom backgrounds for your specific major. It works flawlessly on any device and actually makes studying kind of fun? Yeah, I said it. Join the thousands of students already upgrading their learning experience. TRED. The ultimate university in your pocket." },
  { id: "c5-de", language: "de", voiceId: "TX3LPaxmHKxFdv7VOQHJ", ...TALK, // Liam — energetic
    text: "Seien wir ehrlich. Lernen sollte sich nicht wie eine Strafe anfühlen. TRED sieht absolut fantastisch aus. Mit einem Premium-Dark-Mode, wunderschönen Animationen und individuellen Hintergründen für deinen Studiengang. Es läuft flüssig auf jedem Gerät und macht das Lernen tatsächlich irgendwie spaßig? Ja, ich hab's gesagt. Schließe dich tausenden Studenten an, die ihr Lernen auf das nächste Level heben. TRED. Deine persönliche Universität." },
];
