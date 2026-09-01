/**
 * Les langues, en un seul endroit.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * Il y avait DEUX tables de langues dans le code, et elles ne couvraient ni
 * l'une ni l'autre ce que l'interface propose :
 *
 *   • `LANG_LABEL` dans agent/index.ts   → chat        → de, fr, en
 *   • `EX_LANG`    dans index.ts         → exercices,  → de, fr, en
 *                                          Klausuren,
 *                                          formulaires
 *
 * L'interface, elle, propose dix langues. Un étudiant qui choisissait
 * l'espagnol recevait donc de l'allemand — non pas par erreur de logique, mais
 * parce que `EX_LANG["es"]` valait `undefined` et que le code retombait
 * explicitement sur `"de"`. Silencieusement. Sans message.
 *
 * Une seule table désormais, utilisée partout. Ajouter une langue à
 * l'interface sans l'ajouter ici reste possible — mais le repli nomme
 * maintenant la langue au lieu de basculer en allemand.
 *
 * ── Pourquoi la consigne est écrite DANS la langue ────────────────────────
 *
 * Le prompt du tuteur fait cinq cents lignes d'allemand, suivies de documents
 * de cours allemands. Une consigne « antworte auf Spanisch » perdue là-dedans
 * ne pèse rien. La même phrase écrite en espagnol fait basculer le modèle dès
 * qu'il la lit. C'est la seule chose qui marche de façon fiable.
 */

export interface Language {
  /** Code ISO, tel qu'il arrive du navigateur. */
  code: string;
  /** Nom allemand + nom natif — pour les prompts rédigés en allemand. */
  label: string;
  /** Consigne de langue, écrite dans la langue, placée en TÊTE du prompt. */
  top: string;
  /** Rappel court, placé en FIN de prompt. La fin porte autant que le début. */
  bottom: string;
}

export const LANGUAGES: Record<string, Language> = {
  de: {
    code: "de",
    label: "Deutsch",
    top:
      "SPRACHREGEL — GILT VOR ALLEM ANDEREN\n" +
      "Du antwortest vollständig auf DEUTSCH.",
    bottom: "ERINNERUNG: Deine Antwort ist auf DEUTSCH.",
  },
  en: {
    code: "en",
    label: "Englisch (English)",
    top:
      "LANGUAGE RULE — TAKES PRECEDENCE OVER EVERYTHING ELSE\n" +
      "You answer entirely in ENGLISH.\n" +
      "The rest of these instructions and the course documents are in German. " +
      "That changes nothing. Only German technical terms are kept.",
    bottom: "FINAL REMINDER: your answer is written in ENGLISH.",
  },
  fr: {
    code: "fr",
    label: "Französisch (français)",
    top:
      "RÈGLE DE LANGUE — PRIORITAIRE SUR TOUT LE RESTE\n" +
      "Tu réponds entièrement en FRANÇAIS.\n" +
      "Le reste de ces instructions et les documents de cours sont en allemand. " +
      "Cela ne change rien. Seuls les termes techniques allemands sont conservés.",
    bottom: "RAPPEL FINAL : ta réponse est rédigée en FRANÇAIS.",
  },
  es: {
    code: "es",
    label: "Spanisch (español)",
    top:
      "REGLA DE IDIOMA — TIENE PRIORIDAD SOBRE TODO LO DEMÁS\n" +
      "Respondes íntegramente en ESPAÑOL.\n" +
      "El resto de estas instrucciones y los documentos del curso están en " +
      "alemán. Eso no cambia nada. Solo se conservan los términos técnicos alemanes.",
    bottom: "RECORDATORIO FINAL: tu respuesta está escrita en ESPAÑOL.",
  },
  it: {
    code: "it",
    label: "Italienisch (italiano)",
    top:
      "REGOLA LINGUISTICA — HA PRIORITÀ SU TUTTO IL RESTO\n" +
      "Rispondi interamente in ITALIANO.\n" +
      "Il resto di queste istruzioni e i documenti del corso sono in tedesco. " +
      "Questo non cambia nulla. Si conservano solo i termini tecnici tedeschi.",
    bottom: "PROMEMORIA FINALE: la tua risposta è scritta in ITALIANO.",
  },
  pt: {
    code: "pt",
    label: "Portugiesisch (português)",
    top:
      "REGRA DE IDIOMA — TEM PRIORIDADE SOBRE TUDO O RESTO\n" +
      "Respondes inteiramente em PORTUGUÊS.\n" +
      "O resto destas instruções e os documentos do curso estão em alemão. " +
      "Isso não muda nada. Apenas os termos técnicos alemães são mantidos.",
    bottom: "LEMBRETE FINAL: a tua resposta é escrita em PORTUGUÊS.",
  },
  nl: {
    code: "nl",
    label: "Niederländisch (Nederlands)",
    top:
      "TAALREGEL — GAAT BOVEN AL HET ANDERE\n" +
      "Je antwoordt volledig in het NEDERLANDS.\n" +
      "De rest van deze instructies en de cursusdocumenten zijn in het Duits. " +
      "Dat verandert niets. Alleen Duitse vaktermen blijven staan.",
    bottom: "LAATSTE HERINNERING: je antwoord is in het NEDERLANDS.",
  },
  pl: {
    code: "pl",
    label: "Polnisch (polski)",
    top:
      "ZASADA JĘZYKOWA — MA PIERWSZEŃSTWO PRZED WSZYSTKIM INNYM\n" +
      "Odpowiadasz w całości po POLSKU.\n" +
      "Reszta tych instrukcji i dokumenty kursu są po niemiecku. " +
      "To niczego nie zmienia. Zachowujesz tylko niemieckie terminy techniczne.",
    bottom: "OSTATNIE PRZYPOMNIENIE: twoja odpowiedź jest po POLSKU.",
  },
  tr: {
    code: "tr",
    label: "Türkisch (Türkçe)",
    top:
      "DİL KURALI — HER ŞEYDEN ÖNCE GELİR\n" +
      "Tamamen TÜRKÇE yanıt verirsin.\n" +
      "Bu talimatların geri kalanı ve ders belgeleri Almancadır. " +
      "Bu hiçbir şeyi değiştirmez. Yalnızca Almanca teknik terimler korunur.",
    bottom: "SON HATIRLATMA: yanıtın TÜRKÇE yazılmıştır.",
  },
  ru: {
    code: "ru",
    label: "Russisch (русский)",
    top:
      "ЯЗЫКОВОЕ ПРАВИЛО — ВАЖНЕЕ ВСЕГО ОСТАЛЬНОГО\n" +
      "Ты отвечаешь полностью на РУССКОМ языке.\n" +
      "Остальные инструкции и учебные документы — на немецком. " +
      "Это ничего не меняет. Сохраняются только немецкие технические термины.",
    bottom: "ПОСЛЕДНЕЕ НАПОМИНАНИЕ: твой ответ написан на РУССКОМ языке.",
  },
  uk: {
    code: "uk",
    label: "Ukrainisch (українська)",
    top:
      "МОВНЕ ПРАВИЛО — ВАЖЛИВІШЕ ЗА ВСЕ ІНШЕ\n" +
      "Ти відповідаєш повністю УКРАЇНСЬКОЮ.\n" +
      "Решта цих інструкцій і навчальні документи — німецькою. " +
      "Це нічого не змінює. Зберігаються лише німецькі технічні терміни.",
    bottom: "ОСТАННЄ НАГАДУВАННЯ: твоя відповідь написана УКРАЇНСЬКОЮ.",
  },
  ar: {
    code: "ar",
    label: "Arabisch (العربية)",
    top:
      "قاعدة اللغة — لها الأولوية على كل ما عداها\n" +
      "تُجيب بالكامل باللغة العربية.\n" +
      "بقية هذه التعليمات ووثائق المقرر بالألمانية. هذا لا يغيّر شيئًا. " +
      "تُحفَظ المصطلحات التقنية الألمانية فقط.",
    bottom: "تذكير أخير: إجابتك مكتوبة باللغة العربية.",
  },
  zh: {
    code: "zh",
    label: "Chinesisch (中文)",
    top:
      "语言规则 —— 优先于其他一切\n" +
      "你完全使用中文回答。\n" +
      "其余说明和课程文档为德语，这不影响任何事情。仅保留德语专业术语。",
    bottom: "最后提醒：你的回答使用中文书写。",
  },
  ro: {
    code: "ro",
    label: "Rumänisch (română)",
    top:
      "REGULĂ DE LIMBĂ — ARE PRIORITATE FAȚĂ DE TOT RESTUL\n" +
      "Răspunzi integral în ROMÂNĂ.\n" +
      "Restul acestor instrucțiuni și documentele de curs sunt în germană. " +
      "Asta nu schimbă nimic. Se păstrează doar termenii tehnici germani.",
    bottom: "REAMINTIRE FINALĂ: răspunsul tău este scris în ROMÂNĂ.",
  },
  cs: {
    code: "cs",
    label: "Tschechisch (čeština)",
    top:
      "JAZYKOVÉ PRAVIDLO — MÁ PŘEDNOST PŘED VŠÍM OSTATNÍM\n" +
      "Odpovídáš výhradně ČESKY.\n" +
      "Zbytek těchto pokynů a studijní dokumenty jsou v němčině. " +
      "To nic nemění. Zachovávají se pouze německé odborné termíny.",
    bottom: "POSLEDNÍ PŘIPOMENUTÍ: tvá odpověď je napsána ČESKY.",
  },
};

/**
 * La langue demandée, ou un repli qui NOMME la langue au lieu de basculer en
 * allemand.
 *
 * C'était le défaut : `EX_LANG["es"]` valait `undefined`, et le code écrivait
 * explicitement `"de"`. Un repli silencieux vers une autre langue est pire
 * qu'une erreur — personne ne peut le signaler puisque rien ne le signale.
 */
export function langOf(code?: string | null): Language {
  const key = (code ?? "").trim().toLowerCase();
  const known = LANGUAGES[key] ?? LANGUAGES[key.split("-")[0] ?? ""];
  if (known) return known;

  if (!key) return LANGUAGES.de!;

  return {
    code: key,
    label: `Sprache mit dem Code "${key}"`,
    top:
      "LANGUAGE RULE — TAKES PRECEDENCE OVER EVERYTHING ELSE\n" +
      `You answer entirely in the language with the ISO code "${key}".\n` +
      "The rest of these instructions and the course documents are in German. " +
      "That changes nothing. Only German technical terms are kept.",
    bottom: `FINAL REMINDER: answer in the language with the ISO code "${key}".`,
  };
}

/** Les codes couverts — utile pour un contrôle au démarrage. */
export const SUPPORTED = Object.keys(LANGUAGES);
