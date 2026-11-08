/**
 * Les tokens TRED dérivés de palette.json (format du skill brand-identity) :
 * échelles renommées par fonction, rôles par mode, et les contrôles à passer.
 */

/** Échelles exportées : nom du token ← clé dans palette.json. */
export const SCALES = [
  ["primary", "primary", "Orange Signal : actions, liens, marque"],
  ["secondary", "ext-1", "Or Toque : XP, récompenses, progression"],
  ["accent", "accent", "Cyan Précision : focus, résultats vérifiés"],
  ["neutral", "neutral", "Neutres chauds : textes, surfaces, bordures"],
  ["neutral-cool", "neutral-cool", "Neutres froids : code, tableaux techniques"],
  ["success", "success", "Succès"],
  ["warning", "warning", "Avertissement"],
  ["error", "danger", "Erreur"],
  ["info", "info", "Information"],
];

export const BRAND = [
  ["orange", "#ff6b00", "Orange Signal", "Symbole, actions principales en mode sombre"],
  ["gold", "#eab308", "Or Toque", "Symbole, XP, récompenses"],
  ["cyan", "#00d4ff", "Cyan Précision", "Focus, badges « vérifié par le solveur »"],
  ["night", "#0a0a0a", "Nuit", "Fond du symbole et du mode sombre"],
];

/** Rôles par mode. Les 16 premiers viennent de palette.json (auditable par le skill), le reste est propre à TRED. */
export function roles(p) {
  const s = (scale, step) => p.scales[scale].steps[String(step)];
  const out = {};
  for (const mode of ["light", "dark"]) {
    const m = p.modes[mode];
    const light = mode === "light";
    const soft = (scale) => s(scale, light ? 50 : 950);
    out[mode] = {
      background: m.background,
      surface: m.surface,
      "surface-alt": m.surfaceAlt,
      border: m.border,
      "border-strong": s("neutral", 500),
      text: m.text,
      "text-muted": m.textMuted,
      primary: m.primary,
      "on-primary": m.onPrimary,
      "primary-soft": soft("primary"),
      secondary: light ? s("ext-1", 500) : s("ext-1", 300),
      "on-secondary": s("neutral", 950),
      accent: m.accent,
      "on-accent": m.onAccent,
      "accent-soft": soft("accent"),
      link: m.link,
      focus: m.focus,
      success: m.success,
      "success-soft": soft("success"),
      warning: m.warning,
      "warning-soft": soft("warning"),
      error: m.danger,
      "error-soft": soft("danger"),
      info: m.info,
      "info-soft": soft("info"),
    };
  }
  return out;
}

/**
 * Paires testées : [premier plan, fond, seuil, nature]. 4,5 = texte normal (WCAG 1.4.3),
 * 3 = composants d'interface et éléments graphiques (WCAG 1.4.11).
 */
export const PAIRS = [
  ["text", "background", 4.5, "Texte courant"],
  ["text", "surface", 4.5, "Texte sur carte"],
  ["text", "surface-alt", 4.5, "Texte sur surface secondaire"],
  ["text-muted", "background", 4.5, "Texte secondaire"],
  ["text-muted", "surface", 4.5, "Texte secondaire sur carte"],
  ["text-muted", "surface-alt", 4.5, "Texte secondaire sur surface secondaire"],
  ["on-primary", "primary", 4.5, "Libellé du bouton principal"],
  ["on-secondary", "secondary", 4.5, "Libellé sur or (XP)"],
  ["on-accent", "accent", 4.5, "Libellé sur cyan"],
  ["text", "primary-soft", 4.5, "Texte sur sélection orange"],
  ["accent", "accent-soft", 4.5, "Badge cyan"],
  ["link", "background", 4.5, "Lien"],
  ["link", "surface", 4.5, "Lien sur carte"],
  ["success", "background", 4.5, "Texte succès"],
  ["warning", "background", 4.5, "Texte avertissement"],
  ["error", "background", 4.5, "Texte erreur"],
  ["info", "background", 4.5, "Texte information"],
  ["success", "success-soft", 4.5, "Badge succès"],
  ["warning", "warning-soft", 4.5, "Badge avertissement"],
  ["error", "error-soft", 4.5, "Badge erreur"],
  ["info", "info-soft", 4.5, "Badge information"],
  ["primary", "background", 3, "Bouton principal contre la page"],
  ["secondary", "background", 3, "Barre d’XP contre la page"],
  ["accent", "background", 3, "Élément cyan contre la page"],
  ["border-strong", "background", 3, "Contour de champ"],
  ["border-strong", "surface", 3, "Contour de champ sur carte"],
  ["focus", "background", 3, "Anneau de focus"],
  ["focus", "surface", 3, "Anneau de focus sur carte"],
  ["link", "text", 3, "Lien contre texte courant", "underline"],
];

/** Couples porteurs de sens à vérifier sous daltonisme (CIEDE2000 après simulation). */
export const CVD_PAIRS = [
  ["primary", "error"],
  ["primary", "warning"],
  ["secondary", "warning"],
  ["warning", "error"],
  ["success", "error"],
  ["success", "warning"],
  ["primary", "accent"],
  ["accent", "info"],
  ["primary", "secondary"],
];
