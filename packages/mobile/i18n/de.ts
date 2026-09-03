/**
 * Allemand — **la langue de référence**.
 *
 * Ce fichier définit la forme de toutes les traductions : `en.ts` et `fr.ts`
 * sont typés `Translations = typeof de`, donc une clé oubliée en français est
 * une **erreur de compilation**, pas un « missing translation » découvert par
 * un utilisateur trois semaines après le lancement.
 *
 * Règle : on n'ajoute jamais une clé ici sans l'ajouter dans les deux autres —
 * `bun run typecheck` refusera de passer.
 */
export const de = {
  common: {
    cancel: "Abbrechen",
    save: "Speichern",
    delete: "Löschen",
    retry: "Erneut versuchen",
    loading: "Lädt …",
    error: "Etwas ist schiefgelaufen",
    back: "Zurück",
    continue: "Weiter",
    close: "Schließen",
    confirm: "Bestätigen",
    search: "Suchen",
    empty: "Nichts vorhanden",
    offline: "Keine Verbindung zum Server",
  },

  auth: {
    signInTitle: "Willkommen zurück",
    signInSubtitle: "Melde dich an, um weiterzulernen.",
    signUpTitle: "Konto erstellen",
    signUpSubtitle: "Kostenlos starten — keine Karte nötig.",
    name: "Name",
    email: "E-Mail",
    password: "Passwort",
    passwordHint: "Mindestens 8 Zeichen",
    signIn: "Anmelden",
    signUp: "Registrieren",
    signOut: "Abmelden",
    noAccount: "Noch kein Konto?",
    hasAccount: "Bereits registriert?",
    inviteCode: "Einladungscode",
    inviteRequired: "Die Registrierung ist derzeit nur mit Einladungscode möglich.",
    invalidCredentials: "E-Mail oder Passwort stimmt nicht.",
    emailTaken: "Diese E-Mail ist bereits registriert.",
    signOutConfirm: "Wirklich abmelden?",
    forgot: "Passwort vergessen?",
    forgotSent:
      "Falls ein Konto zu dieser Adresse existiert, ist die E-Mail unterwegs.",
    errorGeneric: "Das hat nicht geklappt. Versuch es bitte noch einmal.",
    inviteInvalid: "Dieser Einladungscode gilt nicht.",
  },

  tabs: {
    chat: "Lernen",
    documents: "Unterlagen",
    exercises: "Übungen",
    profile: "Profil",
  },

  chat: {
    title: "Lernassistent",
    placeholder: "Frag mich etwas zu deinem Skript …",
    send: "Senden",
    stop: "Stopp",
    newChat: "Neuer Chat",
    emptyTitle: "Woran arbeiten wir?",
    emptyBody:
      "Lade ein Skript hoch oder stell direkt eine Frage. Ich rechne nichts selbst — Zahlen kommen aus geprüften Werkzeugen.",
    thinking: "Denkt nach …",
    conversations: "Unterhaltungen",
    deleteChat: "Unterhaltung löschen",
    contextDocument: "Bezug: {{title}}",
    disclaimer:
      "Lernhilfe — Ergebnisse eigenständig prüfen. Keine Ingenieurleistung.",
  },

  quota: {
    badgeMonthly: "{{count}} übrig",
    badgeCredits: "{{count}} Guthaben",
    exhaustedTitle: "Kontingent aufgebraucht",
    exhaustedFree:
      "Dein kostenloses Monatskontingent ist erschöpft. Es setzt sich am {{date}} zurück.",
    exhaustedPaid:
      "Dein Monatskontingent ist erschöpft. Es setzt sich am {{date}} zurück.",
    exhaustedCta: "Premium ansehen",
    buyCreditsCta: "Guthaben kaufen",
    lowWarning: "Nur noch {{count}} Anfragen diesen Monat.",
    tokenCapTitle: "Monatslimit erreicht",
    tokenCapBody:
      "Du hast das monatliche Ausgabelimit erreicht. Es setzt sich zum Monatsanfang zurück.",
  },

  documents: {
    title: "Meine Unterlagen",
    upload: "Hochladen",
    uploading: "Wird hochgeladen …",
    extracting: "Text wird ausgelesen …",
    emptyTitle: "Noch keine Unterlagen",
    emptyBody:
      "Lade dein Vorlesungsskript, eine Übung oder eine Altklausur hoch. Der Assistent antwortet dann daraus.",
    pages: "{{count}} Seiten",
    kindScript: "Skript",
    kindExercise: "Übung",
    kindExam: "Altklausur",
    kindOther: "Sonstiges",
    deleteConfirm: "Diese Unterlage löschen? Das lässt sich nicht rückgängig machen.",
    assignSemester: "Semester zuordnen",
    unsupported: "Dieses Dateiformat wird nicht unterstützt.",
    tooLarge: "Die Datei ist zu groß.",
    uploadPick: "Datei wählen",
    uploadNoText: "Aus dieser Datei ließ sich kein Text lesen. Ein abfotografiertes Blatt ohne Texterkennung funktioniert nicht.",
    uploadFailed: "Der Upload ist fehlgeschlagen.",
    uploadDone: "Unterlage hinzugefügt.",
    limitReached: "Du hast die Grenze von {{limit}} Unterlagen erreicht.",
  },

  semesters: {
    title: "Semester",
    create: "Semester anlegen",
    name: "Bezeichnung",
    namePlaceholder: "z. B. 3. Semester",
    university: "Hochschule",
    program: "Studiengang",
    docCount: "{{count}} Unterlagen",
    share: "Teilen",
    shareInfo: "Teile diesen Code mit deiner Lerngruppe.",
    redeem: "Code einlösen",
    deleteConfirm: "Semester löschen? Die Unterlagen bleiben erhalten.",
  },

  exercises: {
    title: "Gespeicherte Übungen",
    emptyTitle: "Noch nichts gespeichert",
    emptyBody: "Übungen, die du im Chat speicherst, erscheinen hier.",
    points: "{{count}} Punkte",
    difficultyEasy: "Leicht",
    difficultyMedium: "Mittel",
    difficultyHard: "Schwer",
    solution: "Lösung anzeigen",
    hideSolution: "Lösung verbergen",
  },

  plan: {
    title: "Dein Tarif",
    free: "Kostenlos",
    premium: "Premium",
    founder: "Gründer",
    monthly: "Monatlich",
    semester: "Semester",
    perMonth: "/Monat",
    save: "Spare {{amount}}",
    subscribe: "Zahlungspflichtig abonnieren",
    manage: "Abo verwalten",
    cancelAnytime: "Jederzeit kündbar",
    validUntil: "Aktiv bis {{date}}",
    trial: "{{days}} Tage kostenlos testen",
    trialUsed: "Testphase bereits genutzt",
    notConfigured: "Zahlungen sind noch nicht eingerichtet.",
    usage: "{{used}} von {{limit}}",
    featureUnlimited: "500 KI-Anfragen pro Monat",
    featureDocuments: "Bis zu 200 Unterlagen",
    featureExercises: "Übungsklausuren generieren",
    featureSupport: "Bevorzugter Support",
    restore: "Kauf wiederherstellen",
  },

  credits: {
    title: "Guthaben",
    balance: "{{count}} Guthaben",
    subtitle: "Guthaben verfällt nicht und wird erst nach deinem Monatskontingent verbraucht.",
    buy: "Guthaben kaufen",
    pack: "{{count}} Guthaben",
    pricePer: "{{price}} pro Anfrage",
    history: "Verlauf",
    historyEmpty: "Noch keine Bewegungen",
    typePurchase: "Kauf",
    typeSpend: "Verbraucht",
    typeGrant: "Gutschrift",
    typeRefund: "Erstattung",
    purchaseSuccess: "Guthaben gutgeschrieben.",
    purchasePending: "Zahlung wird verarbeitet — dein Guthaben erscheint gleich.",
  },

  account: {
    title: "Profil",
    language: "Sprache",
    languageDe: "Deutsch",
    languageEn: "English",
    languageFr: "Français",
    notifications: "Benachrichtigungen",
    notificationsBody: "Bescheid, wenn eine Übung fertig ist.",
    notificationsDenied:
      "Benachrichtigungen sind in den Systemeinstellungen deaktiviert.",
    testNotification: "Testbenachrichtigung senden",
    dataExport: "Meine Daten exportieren",
    dataExportBody: "Alle deine Daten als JSON-Datei (Art. 15 und 20 DSGVO).",
    dataExportDone: "Export erstellt.",
    deleteAccount: "Konto löschen",
    deleteAccountBody:
      "Unwiderruflich. Konto, Unterlagen, Unterhaltungen, Guthaben — alles wird entfernt.",
    deleteAccountConfirmTitle: "Konto endgültig löschen",
    deleteAccountConfirmBody:
      "Ein laufendes Abo wird zuerst gekündigt. Tippe LÖSCHEN, um zu bestätigen.",
    deleteAccountKeyword: "LÖSCHEN",
    deleteAccountWrongKeyword: "Bitte tippe genau LÖSCHEN.",
    theme: "Erscheinungsbild",
    themeSystem: "Wie das System",
    themeLight: "Hell",
    themeDark: "Dunkel",
    dataTitle: "Deine Daten",
    version: "Version {{version}}",
  },

  report: {
    action: "Melden",
    title: "Diese Antwort melden",
    body:
      "Sag uns, was nicht in Ordnung war. Die Antwort und dein Hinweis gehen " +
      "an uns — nicht an andere Studierende.",
    reason_harmful: "Gefährlich oder unsicher",
    reason_wrong: "Fachlich falsch",
    reason_offensive: "Beleidigend oder unangemessen",
    reason_other: "Etwas anderes",
    notePlaceholder: "Was war falsch? (optional)",
    send: "Melden",
    thanksTitle: "Danke",
    thanksBody:
      "Die Meldung ist da. Wir schauen sie uns an — Antwort bekommst du keine, " +
      "aber jede Meldung wird gelesen.",
  },
  legal: {
    title: "Rechtliches",
    impressum: "Impressum",
    privacy: "Datenschutz",
    terms: "AGB",
    withdrawal: "Widerrufsbelehrung",
    consentStart:
      "Ich verlange ausdrücklich, dass ihr vor Ablauf der Widerrufsfrist mit der Leistung beginnt.",
    consentLose:
      "Mir ist bekannt, dass ich damit mein Widerrufsrecht verliere (§ 356 Abs. 5 BGB).",
    consentRequired: "Bitte bestätige beide Punkte, um fortzufahren.",
  },

  errors: {
    unauthorized: "Bitte melde dich erneut an.",
    network: "Keine Verbindung. Prüfe dein Internet.",
    server: "Der Server antwortet gerade nicht.",
    unknown: "Unbekannter Fehler.",
  },
} as const;

/**
 * La FORME de `de`, avec des `string` à la place des textes allemands.
 *
 * `de` se termine par `as const`, ce qui donne à chaque valeur son type
 * littéral : « Abbrechen » n'est pas de type `string` mais de type
 * `"Abbrechen"`. Écrire `Translations = typeof de` exigeait donc que l'anglais
 * dise « Abbrechen » lui aussi — 320 erreurs de compilation, une par texte.
 *
 * `Widen` remplace récursivement chaque littéral par `string`. La garantie
 * qu'on voulait — une clé oubliée ne compile pas — est intacte ; l'exigence
 * absurde sur la valeur disparaît.
 */
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

export type Translations = Widen<typeof de>;
