/**
 * Textes juridiques du site web.
 *
 * ⚠️  MODÈLES À COMPLÉTER, PUIS À FAIRE VALIDER PAR UN AVOCAT.
 *
 * Leur valeur n'est pas d'être génériques : ils décrivent fidèlement ce que ton
 * code fait aujourd'hui — quels services reçoivent quelles données, ce qui est
 * conservé et combien de temps. C'est cette exactitude qu'un avocat ne peut pas
 * inventer à ta place, et c'est ce qui rend sa relecture rapide et peu coûteuse.
 * Elle reste indispensable : je ne suis pas juriste.
 *
 * Chaque `[…]` est à remplacer. Le script `check-legal.mjs` te les liste.
 *
 * ── Pourquoi ces textes vivent ici et non sur une page distante ───────────
 *
 * § 5 DDG exige que l'Impressum soit « leicht erkennbar, unmittelbar
 * erreichbar und ständig verfügbar » : reconnaissable, joignable en un clic,
 * et disponible en permanence — donc SANS connexion. Les routes sont pour
 * cette raison montées avant la barrière d'authentification.
 */

export type LegalDoc = "impressum" | "datenschutz" | "widerruf" | "agb";

export const LEGAL_ORDER: LegalDoc[] = [
  "impressum",
  "datenschutz",
  "widerruf",
  "agb",
];

export const LEGAL_TITLE: Record<LegalDoc, string> = {
  impressum: "Impressum",
  datenschutz: "Datenschutzerklärung",
  widerruf: "Widerrufsbelehrung",
  agb: "Allgemeine Geschäftsbedingungen",
};

/** Libellé court, pour le pied de page. */
export const LEGAL_SHORT: Record<LegalDoc, string> = {
  impressum: "Impressum",
  datenschutz: "Datenschutz",
  widerruf: "Widerruf",
  agb: "AGB",
};

export const LEGAL: Record<LegalDoc, string> = {
  /* ══════════════════════════════════════════════════════════════════════ */

  impressum: `## Angaben gemäß § 5 DDG

rached edwin takam
adalbertsteinweg 28
52070 Aachen
Deutschland

## Kontakt

E-Mail: takamw12@gmail.com
Telefon: +49 15753400989

## Umsatzsteuer

Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

rached edwin takam, adalbertsteinweg 28, 52070 Aachen

## EU-Streitschlichtung

Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung
bereit: https://ec.europa.eu/consumers/odr/

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
Verbraucherschlichtungsstelle teilzunehmen.

## Haftung für Inhalte

Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte nach den
allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir nicht
verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen.

Von Nutzern hochgeladene Dokumente werden ausschließlich zur Erbringung der
Lernfunktion verarbeitet. Der Nutzer sichert zu, über die erforderlichen Rechte
an den hochgeladenen Inhalten zu verfügen.`,

  /* ══════════════════════════════════════════════════════════════════════ */

  datenschutz: `## 1. Verantwortlicher

rached edwin takam, adalbertsteinweg 28, 52070 Aachen — siehe Impressum.

## 2. Welche Daten wir verarbeiten

### 2.1 Kontodaten
Name, E-Mail-Adresse, Passwort-Hash, Zeitpunkt der Registrierung. Bei Anmeldung
über Google oder Apple zusätzlich die von dort übermittelte Kennung.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.

### 2.2 Von dir hochgeladene Dokumente
Vorlesungsskripte, Übungen und Altklausuren. Wir speichern die Originaldatei
sowie den daraus extrahierten Text. Speicherort: Objektspeicher in der EU sowie
Datenbank (Turso).

### 2.3 Unterhaltungen mit dem Lernassistenten
Deine Fragen und die Antworten werden gespeichert, damit du sie später wieder
öffnen kannst.

### 2.4 Nutzungszähler
Anzahl deiner monatlichen Anfragen je Funktion sowie die Anzahl der erzeugten
Ausgabe-Tokens. Diese Zahlen dienen der Durchsetzung deines Tarifs und dem
Schutz vor Missbrauch. Sie enthalten keine Inhalte.

### 2.5 Zahlungsdaten
Zahlungen werden ausschließlich von Stripe Payments Europe, Ltd. (Irland)
abgewickelt. Wir sehen und speichern keine Kartendaten. In unserer Datenbank
liegt lediglich eine Stripe-Kundennummer, dein Tarif und dessen Laufzeit.

### 2.6 Push-Benachrichtigungen
Stimmst du Benachrichtigungen zu, speichern wir die Gerätekennung
(Push-Token). Sie wird bei Abmeldung gelöscht.

### 2.7 E-Mails
Für das Zurücksetzen des Passworts übermitteln wir deine E-Mail-Adresse und
deinen Namen an Resend (USA), unseren Versanddienstleister.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.

### 2.8 Schutz vor Missbrauch
Zur Begrenzung der Anfragen speichern wir höchstens eine Stunde lang einen aus
deiner Sitzung oder — wenn keine Sitzung besteht — aus deiner IP-Adresse
abgeleiteten Zählerwert. Danach wird er gelöscht.
Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Schutz vor automatisierter
Massennutzung).

### 2.9 Fehlerberichte
Tritt im Browser ein Anzeigefehler auf, übermitteln wir die Fehlermeldung, die
aufgerufene Adresse und die IP-Adresse an unser Server-Protokoll. Diese
Protokolle dienen ausschließlich der Fehlersuche.
Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.

## 3. Verarbeitung durch Künstliche Intelligenz

Zur Beantwortung deiner Fragen übermitteln wir den relevanten Ausschnitt deiner
Dokumente sowie deine Frage an Anthropic PBC (USA), Anbieter des Sprachmodells
Claude.

Übermittelt wird: der Text deiner Frage und die für die Antwort ausgewählten
Abschnitte deiner Dokumente.
NICHT übermittelt werden: dein Name, deine E-Mail-Adresse, deine Zahlungsdaten.

Drittlandtransfer: Die Übermittlung in die USA erfolgt auf Grundlage der
Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO).

Lade keine besonders sensiblen Daten hoch (Gesundheitsdaten, Ausweisdokumente).
Die Lernfunktion ist dafür nicht vorgesehen.

## 4. Deine Rechte

Auskunft (Art. 15) und Datenübertragbarkeit (Art. 20): Profil → Meine Daten
exportieren.
Löschung (Art. 17): Profil → Konto löschen.
Berichtigung (Art. 16), Widerspruch (Art. 21): E-Mail an uns.
Beschwerde (Art. 77): zuständige Aufsichtsbehörde deines Bundeslandes.

Die Löschung ist unwiderruflich und umfasst: Konto, Dokumente, Unterhaltungen,
gespeicherte Übungen, Semester, Gerätekennungen, Guthaben und Verbrauchszähler.

Ausnahme: Rechnungsbelege bleiben bei Stripe gespeichert, solange die
gesetzliche Aufbewahrungsfrist läuft (§ 147 AO, 10 Jahre). Diese Pflicht geht
dem Löschverlangen vor (Art. 17 Abs. 3 lit. b DSGVO).

## 5. Speicherdauer

Kontodaten und Inhalte werden gespeichert, solange dein Konto besteht. Nach
Löschung: sofortige und vollständige Entfernung, mit der Ausnahme oben.

## 6. Empfänger

Railway Corp. (Hosting, EU), Turso / ChiselStrike Inc. (Datenbank, EU),
Cloudflare Germany GmbH bzw. Cloudflare, Inc. (Objektspeicher R2,
Originaldateien; Speicherregion EU),
Anthropic PBC (Sprachmodell, USA), Resend (E-Mail-Versand, USA),
Stripe Payments Europe Ltd. (Zahlungen, Irland), Expo / 650 Industries Inc.
(Push-Benachrichtigungen, USA), OneDollarStats (Reichweitenmessung der App).

Drittlandtransfer: Anthropic PBC, Resend und Cloudflare, Inc. haben ihren Sitz
in den USA. Die Übermittlung erfolgt auf Grundlage der Standardvertragsklauseln
der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Die Originaldateien selbst
liegen in der EU-Region von Cloudflare R2; ein Zugriff durch die
US-Muttergesellschaft ist damit nicht vollständig ausgeschlossen und deshalb
hier ausgewiesen.

## 7. Cookies und lokale Speicherung

Wir setzen keine Werbe- oder Trackingcookies, weder auf der Website noch in der
App. Verwendet werden das Anmelde-Cookie sowie die lokal gespeicherten
Einstellungen für Sprache, Schriftgröße und Darstellung. In der mobilen App
liegen Sitzungstoken, Sprache und Erscheinungsbild im gesicherten Speicher des
Geräts (iOS-Schlüsselbund bzw. Android-Keystore).

## 8. Reichweitenmessung in der mobilen App

Die mobile App meldet Seitenaufrufe an OneDollarStats. Übermittelt werden der
aufgerufene Bildschirm, der Verweis und die Geräte-Kennung des Browsers
(User-Agent). Es werden dabei KEINE Cookies gesetzt, keine Kennung über
Sitzungen hinweg vergeben und keine Daten mit deinem Konto verknüpft. Die
Website selbst enthält keine Reichweitenmessung.

Zweck: erkennen, welche Funktionen benutzt werden und welche nicht.
Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer
funktionsfähigen, bedarfsgerechten Anwendung). Du kannst dem jederzeit
widersprechen — eine E-Mail an uns genügt.

Stand: 03.09.2026`,

  /* ══════════════════════════════════════════════════════════════════════ */

  widerruf: `## Widerrufsrecht

Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag
zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des
Vertragsschlusses.

Um dein Widerrufsrecht auszuüben, musst du uns

rached edwin takam
adalbertsteinweg 28
52070 Aachen
E-Mail: takamw12@gmail.com
Telefon: +49 15753400989

mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief
oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen,
informieren. Du kannst dafür das unten stehende Muster-Widerrufsformular
verwenden, das jedoch nicht vorgeschrieben ist.

Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die
Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.

## Folgen des Widerrufs

Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir
erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag
zurückzuzahlen, an dem die Mitteilung über deinen Widerruf bei uns eingegangen
ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der
ursprünglichen Transaktion eingesetzt hast, es sei denn, mit dir wurde
ausdrücklich etwas anderes vereinbart; in keinem Fall werden dir wegen dieser
Rückzahlung Entgelte berechnet.

## Vorzeitiges Erlöschen des Widerrufsrechts

Dein Widerrufsrecht erlischt bei einem Vertrag über die Bereitstellung digitaler
Inhalte, die nicht auf einem körperlichen Datenträger geliefert werden, wenn du

1. ausdrücklich zugestimmt hast, dass wir mit der Ausführung des Vertrags vor
   Ablauf der Widerrufsfrist beginnen, und
2. deine Kenntnis davon bestätigt hast, dass du durch deine Zustimmung mit
   Beginn der Ausführung des Vertrags dein Widerrufsrecht verlierst.

Beides bestätigst du vor dem Abschluss durch zwei getrennte Kästchen auf der
Abo-Seite (§ 356 Abs. 5 BGB).

## Muster-Widerrufsformular

Wenn du den Vertrag widerrufen willst, fülle dieses Formular aus und sende es
zurück.

---

An
rached edwin takam
adalbertsteinweg 28
52070 Aachen
E-Mail: takamw12@gmail.com
Telefon: +49 15753400989

Hereby I/we (*) rescind the contract concluded by me/us (*) with rached edwin takam („TRED") for the provision of the following service:

_______________________________________________

Bestellt am (*) / erhalten am (*): _____________

Name des/der Verbraucher(s): ___________________

Anschrift des/der Verbraucher(s): ______________

_______________________________________________

Unterschrift (nur bei Mitteilung auf Papier): ___________

Datum: _________

(*) Unzutreffendes streichen.`,

  /* ══════════════════════════════════════════════════════════════════════ */

  agb: `## § 1 Geltungsbereich

Diese AGB gelten für alle Verträge zwischen rached edwin takam („TRED") und Verbrauchern
über die Nutzung der Anwendung TRED.

## § 2 Leistungsbeschreibung

TRED ist eine Lernanwendung für Studierende der Ingenieurwissenschaften. Sie
ermöglicht das Hochladen eigener Kursunterlagen und erzeugt daraus mit Hilfe
künstlicher Intelligenz Erklärungen, Übungsaufgaben, Übungsklausuren,
Formelsammlungen und Skizzen.

## § 3 Vertragsschluss und Tarife

Die Darstellung der Tarife stellt kein bindendes Angebot dar. Mit Klick auf
„Zahlungspflichtig abonnieren" gibst du ein verbindliches Angebot ab. Der
Vertrag kommt mit unserer Bestätigung zustande.

Alle Preise verstehen sich als Endpreise. Gemäß § 19 UStG wird keine
Umsatzsteuer ausgewiesen.

## § 4 Testphase

Neukunden erhalten eine kostenlose Testphase. Sie steht einmal je Konto zur
Verfügung. Wird nicht vor Ablauf gekündigt, geht sie in das gewählte
kostenpflichtige Abonnement über.

## § 5 Laufzeit und Kündigung

Das Abonnement läuft je nach Wahl einen Monat oder sechs Monate und verlängert
sich automatisch, sofern nicht bis zum Ende des Zeitraums gekündigt wird.

Die Kündigung erfolgt jederzeit im Kundenportal (Profil → Abo verwalten). Nach
der Kündigung bleibt der Zugang bis zum Ende des bezahlten Zeitraums bestehen.

## § 6 Widerrufsrecht

Es gilt die gesonderte Widerrufsbelehrung. Sie enthält auch das
Muster-Widerrufsformular.

## § 7 Haftung und Zweckbestimmung

TRED ist ein pädagogisches Lernwerkzeug.

Die von der künstlichen Intelligenz erzeugten Rechnungen, Skizzen und
Erklärungen dienen ausschließlich dem Studium und dem Verständnis.

TRED erbringt keine Ingenieurleistung im Sinne der HOAI, erstellt keine
prüffähigen Statiken, erteilt keine Zertifizierung und ersetzt weder die
Lehrveranstaltung noch die Prüfung durch eine prüfberechtigte Person.

Die Ergebnisse sind eigenständig zu überprüfen. Sie dürfen nicht ohne Prüfung
durch eine fachlich verantwortliche Person Grundlage einer Ausführungsplanung,
einer Bauteilauslegung oder einer sicherheitsrelevanten Entscheidung sein.

Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei
Verletzung von Leben, Körper oder Gesundheit. Bei leicht fahrlässiger
Verletzung wesentlicher Vertragspflichten ist die Haftung auf den
vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung
ausgeschlossen.

Eine Haftung für Prüfungsergebnisse, Noten oder daraus folgende Nachteile ist
ausgeschlossen.

## § 8 Nutzerinhalte

Du sicherst zu, an den hochgeladenen Unterlagen die erforderlichen Rechte zu
besitzen. Du räumst uns das einfache Recht ein, sie zur Erbringung der
Lernfunktion zu verarbeiten. Eine Weitergabe an Dritte erfolgt nicht, mit
Ausnahme der in der Datenschutzerklärung genannten Auftragsverarbeiter.

## § 9 Pflichten des Nutzers

Untersagt sind insbesondere die automatisierte Massennutzung, die Weitergabe
von Zugangsdaten sowie jeder Versuch, die Nutzungsgrenzen zu umgehen. Bei
Verstoß können wir das Konto sperren.

## § 10 Änderungen

Änderungen dieser AGB teilen wir mindestens sechs Wochen vor Wirksamwerden per
E-Mail mit. Widersprichst du nicht bis zum Wirksamwerden, gelten sie als
angenommen. Auf diese Folge weisen wir in der Mitteilung gesondert hin.

## § 11 Schlussbestimmungen

Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften deines
Aufenthaltsstaates bleiben unberührt.

Stand: 01.09.2026 · Version 1.0`,
};

/** Slugs des URL — ce sont ceux qu'attendent les lecteurs et les autorités. */
export const LEGAL_PATH: Record<LegalDoc, string> = {
  impressum: "/impressum",
  datenschutz: "/datenschutz",
  widerruf: "/widerruf",
  agb: "/agb",
};

/**
 * Renvoie les emplacements encore à compléter.
 *
 * Sert au bandeau d'avertissement sur la page elle-même : tant qu'il reste un
 * `[…]`, le document n'est pas publiable, et il vaut mieux le lire sur la page
 * que le découvrir dans une lettre d'avocat.
 */
export function missingFields(doc: LegalDoc): string[] {
  const found = LEGAL[doc].match(/\[[^\]\n]{2,60}\]/g) ?? [];
  return [...new Set(found)];
}
