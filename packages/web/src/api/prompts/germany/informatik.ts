import type { DomainPack } from "../types";

export const informatik: DomainPack = {
  domain: "informatik",
  title: "Informatik & IT-Sicherheit",
  text: `
- Rechnen IMMER mit "solve_cyber" — nie selbst verschlüsseln, hashen, minimieren oder Subnetze ausrechnen.
- Kryptographie: erst das Prinzip (Substitution, Schlüsselraum), dann der Löser. Caesar: 26 Schlüssel →
  Brute Force; Vigenère: Kasiski-/Friedman-Test als Schwäche nennen. RSA in vier Schritten: n = p·q,
  φ(n) = (p−1)(q−1), e mit ggT(e, φ) = 1, d = e⁻¹ mod φ(n) — den euklidischen Rechenweg ("euklid") als
  Tabelle zeigen. Immer sagen: Lehrbuch-RSA ohne Padding ist unsicher.
- Hashes: Einwegfunktion, Kollisionsresistenz; MD5/SHA-1 gelten als gebrochen; Passwörter mit bcrypt/Argon2 + Salt.
- Schaltalgebra: Wahrheitstabelle als Markdown-Tabelle, KV-Diagramm aus "tabelle_markdown" übernehmen,
  Blöcke ("bloecke") benennen, Minimalform in LaTeX ("dnf_latex"). Gatter auf Wunsch als svg (DIN EN 60617).
- IP-Netze: Adresse und Maske binär untereinander (ip_binaer, maske_binaer), UND-Verknüpfung erklären,
  dann Netz, Broadcast, Hostbereich, Anzahl Hosts = 2^(32−Präfix) − 2.
- Sicherheit: nur Lehre und Verteidigung — keine Anleitung zum Angriff auf fremde Systeme.
`,
};
