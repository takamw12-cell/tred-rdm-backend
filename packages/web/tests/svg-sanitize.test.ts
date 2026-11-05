import { describe, expect, test } from "bun:test";

import { sanitizeSvg } from "../src/web/lib/svg-sanitize";

const wrap = (inner: string) => `<svg viewBox="0 0 10 10">${inner}</svg>`;

describe("sanitizeSvg — animations autorisées (NIVEAU 9d)", () => {
  test("animateMotion + mpath vers un id interne passent intacts", () => {
    const s = wrap(
      '<path id="leiter" d="M0,5 H10"/><circle r="1"><animateMotion dur="3s" repeatCount="indefinite"><mpath href="#leiter"/></animateMotion></circle>',
    );
    expect(sanitizeSvg(s)).toBe(s);
  });

  test("animate sur width (condensateur) passe", () => {
    const s = wrap('<rect width="0" height="2"><animate attributeName="width" values="0;5;10" dur="4s" repeatCount="indefinite"/></rect>');
    expect(sanitizeSvg(s)).toBe(s);
  });

  test("animate sur stroke-dashoffset (sinusoïde) passe", () => {
    const s = wrap('<path d="M0,5 C2,0 4,0 5,5" pathLength="1" stroke-dasharray="1"><animate attributeName="stroke-dashoffset" values="1;0" dur="3s"/></path>');
    expect(sanitizeSvg(s)).toBe(s);
  });
});

describe("sanitizeSvg — vecteurs XSS par animation", () => {
  test("<set> qui réécrit href en javascript: est retiré", () => {
    const out = sanitizeSvg(wrap('<a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a>'));
    expect(out).not.toContain("set");
    expect(out).not.toContain("javascript");
  });

  test("animate sur href est retiré", () => {
    const out = sanitizeSvg(wrap('<a><animate attributeName="href" values="javascript:alert(1)"/></a>'));
    expect(out).not.toContain("animate");
  });

  test("attributeName masqué par une entité est retiré", () => {
    const out = sanitizeSvg(wrap('<a><animate attributeName="hr&#101;f" to="x"/></a>'));
    expect(out).not.toContain("animate");
  });

  test("valeur avec un schéma d'URL est retirée, même sur un attribut autorisé", () => {
    const out = sanitizeSvg(wrap('<rect><animate attributeName="fill" values="red;javascript:alert(1)"/></rect>'));
    expect(out).not.toContain("animate");
  });

  test("onbegin / onend sur une animation sont retirés", () => {
    const out = sanitizeSvg(wrap('<rect><animate attributeName="x" to="5" onbegin="alert(1)"/></rect>'));
    expect(out).not.toContain("onbegin");
    expect(out).toContain('attributeName="x"');
  });

  test("règles d'origine conservées : script, foreignObject, href externe", () => {
    const out = sanitizeSvg(
      wrap('<script>alert(1)</script><foreignObject><div/></foreignObject><use href="https://evil/x.svg#a"/>'),
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("evil");
  });
});

import { enforceTredPalette } from "../src/web/lib/svg-sanitize";

describe("charte TRED — aucun violet dans un schéma", () => {
  test("violets hex remplacés selon la clarté, autres couleurs intactes", () => {
    const svg =
      '<svg><rect fill="#ECECFF" stroke="#9370DB"/><text fill="#4c1d95">A</text>' +
      '<line stroke="#2563EB"/><circle fill="#EF4444"/><rect fill="#8b5cf6"/></svg>';
    const out = enforceTredPalette(svg);
    expect(out).not.toMatch(/ECECFF|9370DB|4c1d95|8b5cf6/i);
    expect(out).toContain('stroke="#EAB308"'); // #9370DB, violet moyen
    expect(out).toContain('fill="#1A1A1A"'); // #4c1d95, violet sombre
    expect(out).toContain('stroke="#2563EB"'); // bleu des forces : intact
    expect(out).toContain('fill="#EF4444"'); // rouge : intact
  });

  test("noms de couleurs et CSS inline", () => {
    const out = enforceTredPalette('<svg><rect fill="purple" style="stroke:violet;fill:#ffffff"/></svg>');
    expect(out).toContain('fill="#1A1A1A"');
    expect(out).toContain("stroke:#EAB308");
    expect(out).toContain("fill:#ffffff");
  });
});
