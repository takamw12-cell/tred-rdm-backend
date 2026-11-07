# Fachmodule — international

Hier entstehen die Fachmodule für Studierende außerhalb Deutschlands.
Ein Modul überschreibt nur das, was sich wirklich unterscheidet; alles andere
kommt aus `../germany/` (Rückfall in `../index.ts`).

## Was sich typischerweise ändert

| Fach | Deutschland (germany) | UK / USA (international) |
|---|---|---|
| Technische Mechanik | Freikörperbild, Lager (Fest-/Loslager), N/Q/M, Zug positiv | Free-Body Diagram, pin/roller supports, N/V/M (shear V), sign conventions of the course (Hibbeler, Beer & Johnston) |
| Technisches Zeichnen | DIN EN ISO 128, Projektionsmethode 1, ISO 2768, ISO GPS | ASME Y14.5 (GD&T), third-angle projection (USA), BS 8888 (UK) |
| Elektrotechnik | Zählpfeilsysteme (Verbraucher/Erzeuger), DIN-Schaltzeichen | passive sign convention, ANSI/IEEE symbols |
| Einheiten | SI | SI und US customary (lbf, in, psi) — immer beide nennen |

## Ein Modul hinzufügen

1. `mechanik.ts` anlegen, `DomainPack` exportieren (siehe `../germany/mechanik.ts`).
2. In `index.ts` eintragen: `export const INTERNATIONAL: PackSet = { mechanik };`
3. `curriculumFor()` in `../index.ts` liefert `"international"`, sobald das
   Studienprofil ein Land außerhalb Deutschlands hat (Feld noch nicht vorhanden).
4. Test in `tests/domain-packs.test.ts` ergänzen.
