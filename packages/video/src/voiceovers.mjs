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

// ── Campagne V3 « démonstration » (2026-11-11), 30 s ────────────────────
// Textes du fondateur : la voix décrit ce que l'écran montre (saisie, clic,
// tableau, vidéo, tableau de bord). Mêmes voix et mêmes réglages que CAMPAIGN.
export const DEMO = [
  { id: "d1-en", language: "en", voiceId: "iP95p4xoKVk53GoZ742B", ...TALK, // Chris
    text: "Let me show you exactly how TRED works. You just type your question right here... hit send. And boom, TRED doesn't just give a text answer. It draws the whole solution on an interactive whiteboard. Step by step. It's like having a private tutor in your browser. Try it out right now." },
  { id: "d1-de", language: "de", voiceId: "cjVigY5qzO86Huf0OWal", ...TALK, // Eric
    text: "Ich zeige dir genau, wie TRED funktioniert. Du tippst einfach deine Frage hier ein... und drückst Enter. Und bam! TRED gibt nicht nur eine Textantwort. Es zeichnet die gesamte Lösung auf einer interaktiven Tafel. Schritt für Schritt. Wie ein Privatlehrer im Browser. Probier es aus." },
  { id: "d2-en", language: "en", voiceId: "cgSgspJ2msm6clMCkdW9", ...TALK, // Jessica
    text: "Stuck on a complex circuit or a mechanical beam? Watch this. When you ask a question, TRED uses deterministic solvers to draw the exact diagram. Every component, every force, perfectly placed. No AI hallucinations here. Just pure, mathematical accuracy. You can even see the exact steps to solve it. It's engineering made visual." },
  { id: "d2-de", language: "de", voiceId: "SAz9YHcvj6GT2YYXdXww", ...TALK, // River
    text: "Hängst du an einer komplexen Schaltung oder einem Balken fest? Schau dir das an. Wenn du eine Frage stellst, nutzt TRED deterministische Solver, um das exakte Diagramm zu zeichnen. Jedes Bauteil, jede Kraft, perfekt platziert. Keine KI-Halluzinationen. Nur reine, mathematische Genauigkeit." },
  { id: "d3-en", language: "en", voiceId: "bIHbv24MWmeRgasZH58o", ...TALK, // Will
    text: "What if you still don't get it? See that button? 'Explain as video'. Click it. TRED instantly generates a custom video explanation for you. With a natural voice, visual examples, and step-by-step logic. It takes the exact problem you're stuck on and turns it into a private lesson. And it saves it to your dashboard for later." },
  { id: "d3-de", language: "de", voiceId: "CwhRBWXzGAHq8TQ4Fs17", ...TALK, // Roger
    text: "Was, wenn du es immer noch nicht verstehst? Siehst du den Button? 'Als Video erklären'. Klick drauf. TRED generiert sofort eine individuelle Videoerklärung für dich. Mit natürlicher Stimme, visuellen Beispielen und Schritt-für-Schritt-Logik. Es speichert es in deinem Dashboard." },
  { id: "d4-en", language: "en", voiceId: "IKne3meq5aSn9XLyUdCD", ...TALK, // Charlie
    text: "This isn't just a chat, it's an interactive class. TRED asks you questions back. It waits for your answer. If you're wrong, it doesn't just give the solution. It explains exactly where you made a mistake. And you can choose your own virtual professor. Different voices, different teaching styles. Learning that adapts to you." },
  { id: "d4-de", language: "de", voiceId: "wWWn96OtTHu1sn8SRGEr", ...TALK, // Hale
    text: "Das ist nicht nur ein Chat, es ist eine interaktive Klasse. TRED stellt dir Fragen zurück. Es wartet auf deine Antwort. Wenn du falsch liegst, gibt es nicht einfach die Lösung. Es erklärt genau, wo dein Fehler war. Und du kannst deinen eigenen virtuellen Professor wählen." },
  { id: "d5-en", language: "en", voiceId: "FGY2WhTYpPnrIDTdsKH5", ...TALK, // Laura
    text: "So here's the full picture. Ask a question, get an interactive whiteboard, generate a video explanation, and track your progress. All in one place. Whether you're studying law, medicine, or aerospace engineering. TRED is the ultimate university in your pocket. Start learning smarter today." },
  { id: "d5-de", language: "de", voiceId: "TX3LPaxmHKxFdv7VOQHJ", ...TALK, // Liam
    text: "Hier ist das Gesamtbild. Stelle eine Frage, erhalte eine interaktive Tafel, generiere eine Videoerklärung und verfolge deinen Fortschritt. Alles an einem Ort. Egal ob Jura, Medizin oder Luft- und Raumfahrttechnik. TRED ist die ultimative Universität für die Hosentasche. Starte heute smarter zu lernen." },
];

// ── Campagne V4 « Studyflix » (2026-11-12), 30 s ────────────────────────
// Textes du fondateur, mot pour mot. Très pédagogique : le curseur guide
// l'œil, l'interface réagit à chaque clic. Mêmes voix conversationnelles et
// mêmes réglages que CAMPAIGN (ton naturel).
export const V4 = [
  { id: "v-en1", language: "en", voiceId: "iP95p4xoKVk53GoZ742B", ...TALK, // Chris
    text: "Stop scrolling through endless PDFs. TRED’s intelligent search actually understands your questions. Just type: 'Where is the formula for bending moment?' and TRED instantly finds the exact page and paragraph in your lecture notes. It even explains the context. Studying just got a whole lot faster." },
  { id: "v-en2", language: "en", voiceId: "cgSgspJ2msm6clMCkdW9", ...TALK, // Jessica
    text: "Sometimes a text explanation isn't enough. That's why we built the 'Explain as video' feature. Click it, and TRED generates a custom, animated video explaining the exact concept you're stuck on. Save it to your dashboard, and review it anytime, anywhere. It’s like having a private tutor on demand." },
  { id: "v-en3", language: "en", voiceId: "bIHbv24MWmeRgasZH58o", ...TALK, // Will
    text: "TRED is built for students, by students. You’re not just a user; you’re a co-creator. See that feedback button? Use it to tell us what’s missing or suggest new features. Join the beta, invite your friends, and let’s build the ultimate engineering companion together. Your feedback directly shapes V2." },
  { id: "v-de1", language: "de", voiceId: "cjVigY5qzO86Huf0OWal", ...TALK, // Eric
    text: "Die Suche nach der richtigen Altklausur war noch nie so einfach. Frag TRED einfach nach einer bestimmten Aufgabe. Die KI durchsucht all deine Dokumente und findet die exakte Aufgabe, inklusive der Schritt-für-Schritt-Lösung auf dem Whiteboard. So bist du perfekt auf die Prüfung vorbereitet." },
  { id: "v-de2", language: "de", voiceId: "SAz9YHcvj6GT2YYXdXww", ...TALK, // River
    text: "Konzentration ist der Schlüssel. Aktiviere den immersiven Modus und die gesamte Benutzeroberfläche verschwindet, sodass nur dein Fokus und dein Hintergrund bleiben. Wenn du rechnen musst, nutze unsere deterministischen Solver. Sie liefern dir 100% verlässliche Ergebnisse, ohne Halluzinationen. Lerne mit voller Konzentration." },
  { id: "v-de3", language: "de", voiceId: "TX3LPaxmHKxFdv7VOQHJ", ...TALK, // Liam
    text: "Werde Teil der Bewegung. Zeig TRED deiner Fachschaft, deinen Kommilitonen und deinen Freunden. Je mehr Studenten mitmachen, desto besser wird die KI. Dein Feedback hilft uns, die perfekte Lernplattform zu bauen. Zusammen machen wir das Studium einfacher. Starte jetzt und teile deine Erfahrungen." },
];

// ── Courts-métrages « Cinematic » (2026-11-13), 30–45 s, 2.35:1 ─────────
// Série A : l'étudiant au centre. Textes du fondateur, mot pour mot. Ton posé,
// narratif (stabilité un peu plus haute que TALK, style léger).
const FILM = { model: "eleven_v4", settings: { stability: 0.42, similarity_boost: 0.78, style: 0.3, use_speaker_boost: true } };
export const CINE_A = [
  { id: "k-en1", language: "en", voiceId: "nPczCjzI2devNBz1zQrb", ...FILM, // Brian — grave, calme
    text: "It's 2 AM. The exam is tomorrow. And you're stuck. You upload your lecture notes. You ask one question. And TRED doesn't just give you the answer. It draws it. Step by step. On an interactive whiteboard. Then you click 'Explain as video'. And a private lesson is generated, just for you. TRED. The university in your pocket." },
  { id: "k-en2", language: "en", voiceId: "cgSgspJ2msm6clMCkdW9", ...FILM, // Jessica — vive
    text: "Group projects are chaos. Unless you have the right tool. One screen. One question. TRED solves the mechanics, draws the curves, and explains every step. No more arguments about who's right. Just the exact answer, every time. TRED. Built for engineers." },
  { id: "k-en3", language: "en", voiceId: "JBFqnCBsd6RMkjVDRZzb", ...FILM, // George — chaleureux
    text: "New country. New language. Same struggle. You have the lecture notes, but you don't understand a word. TRED translates the concept, not just the text. It explains in your language, with your professor's voice. So you can finally focus on what matters: learning. TRED. Universal by design." },
  { id: "k-de1", language: "de", voiceId: "cjVigY5qzO86Huf0OWal", ...FILM, // Eric
    text: "Es ist 2 Uhr nachts. Die Klausur ist morgen. Und du kommst nicht weiter. Du lädst deine Altklausur hoch. Du stellst eine Frage. TRED zeichnet die Lösung. Schritt für Schritt. Auf einer interaktiven Tafel. Dann klickst du auf 'Als Video erklären'. Und eine private Nachhilfestunde wird für dich generiert. TRED. Die Uni in deiner Hosentasche." },
  { id: "k-de2", language: "de", voiceId: "SAz9YHcvj6GT2YYXdXww", ...FILM, // River
    text: "Lerngruppen sind Chaos. Es sei denn, du hast das richtige Tool. Ein Bildschirm. Eine Frage. TRED löst die Thermodynamik, zeichnet die Kurven und erklärt jeden Schritt. Keine Diskussionen mehr darüber, wer recht hat. Nur die exakte Antwort, jedes Mal. TRED. Für Ingenieure gebaut." },
  { id: "k-de3", language: "de", voiceId: "TX3LPaxmHKxFdv7VOQHJ", ...FILM, // Liam
    text: "Neues Land. Neue Sprache. Gleicher Kampf. Du hast die Skripte, aber du verstehst kein Wort. TRED übersetzt das Konzept, nicht nur den Text. Es erklärt in deiner Sprache, mit der Stimme deines Professors. Damit du dich endlich auf das konzentrieren kannst, was zählt: Lernen. TRED. Universell by Design." },
];

// Série B « Tech Premium » : la puissance et le design de TRED. Six voix
// nouvelles ; réglages demandés par le fondateur (stabilité 0,35, clarté 0,75).
const TECH = { model: "eleven_v4", settings: { stability: 0.35, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true } };
export const CINE_B = [
  { id: "b-en1", language: "en", voiceId: "EXAVITQu4vr4xnSDxMaL", ...TECH, // Sarah
    text: "Stop reading endless walls of text. See that button? 'Explain as video'. Click it, and TRED turns your confusing lecture notes into a custom, animated video lesson in seconds. It's like having a Hollywood studio in your browser. Try it on tred-tutor.de." },
  { id: "b-en2", language: "en", voiceId: "onwK4e9ZLuTAKqWW03F9", ...TECH, // Daniel
    text: "Tired of AI making up math formulas? Yeah, me too. TRED doesn't guess. It uses deterministic solvers. Every calculation, every unit, is 100% verified. You can finally trust your grades to an AI. Pure math. Zero hallucinations." },
  { id: "b-en3", language: "en", voiceId: "XB0fDUnXU5powFXDhCwa", ...TECH, // Charlotte
    text: "Law, Medicine, Engineering. TRED adapts to your major. Upload your PDFs, and watch as the tutor switches from legal case studies to circuit diagrams in seconds. The ultimate university in your pocket. One app. Every subject." },
  { id: "b-de1", language: "de", voiceId: "XrExE9yKIg1WjnnlVkGX", ...TECH, // Matilda
    text: "Schluss mit endlosen Textwüsten. Siehst du diesen Button? 'Als Video erklären'. Ein Klick, und TRED verwandelt deine verwirrenden Skripte in Sekundenschnelle in eine individuelle, animierte Videolektion. Wie ein Hollywood-Studio in deinem Browser. Probier es aus." },
  { id: "b-de2", language: "de", voiceId: "pqHfZKP75CvOlQylNhV4", ...TECH, // Bill
    text: "Keine Lust mehr auf KI, die sich Mathe-Formeln ausdenkt? Ja, ich auch nicht. TRED rät nicht. Es nutzt deterministische Solver. Jede Berechnung, jede Einheit ist 100% verifiziert. Du kannst der KI endlich deine Noten anvertrauen. Reine Mathematik. Null Halluzinationen." },
  { id: "b-de3", language: "de", voiceId: "pFZP5JQG7iQjIQuC4Bku", ...TECH, // Lily
    text: "Jura, Medizin, Ingenieurwesen. TRED passt sich deinem Studiengang an. Lade deine PDFs hoch und sieh zu, wie der Tutor in Sekundenschnelle von juristischen Fällen zu Schaltplänen wechselt. Die ultimative Universität für die Hosentasche. Eine App. Jedes Fach." },
];

// ── Campagne TikTok / Snapchat « Survive Your Klausur » (2026-11-14) ────
// Trois pilotes verticaux, textes du fondateur mot pour mot. Une voix par
// ton demandé : jeune et dynamique, pédagogique et calme, intime et sincère.
// `speed` : débit de la voix (1 = normal) ; refusé par un modèle, il est retiré.
export const TIKTOK = [
  { id: "t-de1", language: "de", voiceId: "TX3LPaxmHKxFdv7VOQHJ", model: "eleven_v4", // Liam — jeune, énergique
    settings: { stability: 0.3, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true, speed: 1.06 },
    text: "Morgen Klausur. 80 Seiten Skript. Und ich verstehe... nichts. Statt weiter zu raten, lade ich die Aufgabe in TRED. Schau mal! Hier wird mir der Rechenweg Schritt für Schritt erklärt. Welche Vorlesung macht dich gerade fertig? TRED — Link im Profil." },
  { id: "t-de2", language: "de", voiceId: "JBFqnCBsd6RMkjVDRZzb", model: "eleven_v4", // George — posé, chaleureux (la voix de Prof. Ren)
    settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.0 },
    text: "Warum wird die Luft in einem Flugzeugtriebwerk heißer, noch bevor sie verbrannt wird? Die Antwort steckt im Verdichter. Er verrichtet Arbeit an der Luft. Dadurch steigen Druck und Temperatur. Genau so will ich Physik lernen: verstehen statt auswendig lernen. Das ist die Idee hinter TRED." },
  { id: "t-de3", language: "de", voiceId: "SAz9YHcvj6GT2YYXdXww", model: "eleven_v4", // River — détendu, neutre : en attendant la vraie voix du fondateur
    settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true, speed: 1.06 },
    text: "Ich studiere Luft- und Raumfahrttechnik in Deutschland. Und manchmal sitze ich stundenlang vor einem Skript und denke mir: Warum ist das alles so kompliziert erklärt? Also habe ich angefangen, selbst eine Lern-App zu entwickeln. Sie heißt TRED. Die Idee: Lade dein Skript hoch und lass dir schwierige Themen verständlicher erklären. Das Projekt ist noch in der Entwicklung. Wenn du studierst, probier TRED aus und sag mir, was ich verbessern soll." },
];
