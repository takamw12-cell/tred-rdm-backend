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

/**
 * Attaques réelles (2026-11-09) : le SVG est lu par le parseur HTML, bien plus
 * permissif que le XML. Aucune de ces formes ne doit laisser un gestionnaire
 * d'événement, un schéma exécutable ou un élément actif.
 */
describe("sanitizeSvg — attaques XSS du parseur HTML", () => {
  /** Ce qui ne doit JAMAIS survivre, quelle que soit la forme. */
  const unsafe = (out: string) =>
    /(?<=[\s/"'])on[a-z]+\s*=|javascript:|vbscript:|<\s*(script|iframe|embed|object|img|foreignobject)\b|data:text\/html|@import/i.test(out);

  test.each([
    ["séparateur « / »", "<svg/onload=alert(1)><rect/></svg>"],
    ["sans espace après une valeur", '<svg viewBox="0 0 1 1"onload="alert(1)"></svg>'],
    ["valeur sans guillemets", "<svg><rect onclick=alert(1) /></svg>"],
    ["majuscules", '<svg><rect OnMouseOver="alert(1)"/></svg>'],
    ["« > » dans une valeur entre guillemets", '<svg><rect title="a>" onload="alert(1)"/></svg>'],
    ["href sans guillemets", "<svg><a href=javascript:alert(1)><text>x</text></a></svg>"],
    ["xlink:href en entités", '<svg><a xlink:href="&#106;avascript:alert(1)"><text>x</text></a></svg>'],
    ["schéma coupé par une tabulation", '<svg><a href="java&#9;script:alert(1)"><text>x</text></a></svg>'],
    ["&colon;", '<svg><a href="javascript&colon;alert(1)"><text>x</text></a></svg>'],
    ["script non fermé", "<svg><script>alert(1)</svg>"],
    ["fermeture de script avec espace", "<svg><script>alert(1)</script ></svg>"],
    ["img qui sort du SVG", "<svg><img src=x onerror=alert(1)></svg>"],
    ["img dans un <title> (point d'intégration HTML)", "<svg><title><img src=x onerror=alert(1)></title></svg>"],
    ["iframe srcdoc", '<svg><iframe srcdoc="<script>alert(1)</script>"></iframe></svg>'],
    ["embed / object", '<svg><embed src="javascript:alert(1)"/><object data="javascript:alert(1)"></object></svg>'],
    ["use vers un SVG en data:", '<svg><use href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"/></svg>'],
    ["image externe (pistage)", '<svg><image href="https://evil.example/pixel.png"/></svg>'],
    ["foreignObject", '<svg><foreignObject><body onload="alert(1)"/></foreignObject></svg>'],
    ["CSS @import et url() externe", '<svg><style>@import url(https://evil.example/x.css); rect{fill:url(https://evil.example/p)}</style></svg>'],
    ["style inline javascript:", '<svg><rect style="background:url(javascript:alert(1))"/></svg>'],
    ["formaction", '<svg><a formaction="javascript:alert(1)"><text>x</text></a></svg>'],
  ])("%s", (_name, payload) => {
    expect(unsafe(sanitizeSvg(payload))).toBe(false);
  });

  test("pas de <svg> du tout : rien n'est affiché", () => {
    expect(sanitizeSvg('<iframe srcdoc="<script>alert(1)</script>"></iframe>')).toBe("");
    expect(sanitizeSvg("<img src=x onerror=alert(1)>")).toBe("");
    expect(sanitizeSvg("")).toBe("");
  });

  test("le légitime reste intact : texte des étiquettes, dégradés, références internes, animations", () => {
    const ok =
      '<svg viewBox="0 0 100 40"><defs><linearGradient id="g"><stop offset="0" stop-color="#EAB308"/></linearGradient>' +
      '<path id="fil" d="M0 0 L10 10"/></defs><rect fill="url(#g)" width="10" height="10"/>' +
      '<text x="1" y="20">actio = reactio, action = reaction, data = 5</text>' +
      '<circle r="2"><animateMotion dur="2s" repeatCount="indefinite"><mpath href="#fil"/></animateMotion></circle></svg>';
    const out = sanitizeSvg(ok);
    expect(out).toContain('fill="url(#g)"');
    expect(out).toContain("action = reaction, data = 5");
    expect(out).toContain('<mpath href="#fil"/>');
    expect(out).toContain("animateMotion");
  });
});
