import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Fond animé.
 *
 * ── Ce qui bouge, et ce qui ne bouge pas ──────────────────────────────────
 *
 * La trame de papier millimétré reste IMMOBILE. Des lignes qui défilent
 * derrière une formule sont insupportables au bout de dix minutes, et c'est
 * exactement le genre de détail qui fait fermer un onglet sans savoir pourquoi.
 * Ce qui bouge, c'est la lumière : deux halos très larges et très pâles qui
 * dérivent lentement par-dessus. On ne les regarde pas, on les sent.
 *
 * C'est la différence entre un fond d'application professionnelle et un fond
 * de page d'atterrissage : le premier se remarque à peine, le second doit se
 * remarquer. D'où deux intensités :
 *
 *   • `hero`    — /login et l'accueil. Visible, assumé, quelques secondes.
 *   • `ambient` — derrière l'application. Trois fois plus pâle et deux fois
 *                 plus lent. Une formule KaTeX doit rester parfaitement nette
 *                 par-dessus.
 *
 * ── Ce que ça coûte ───────────────────────────────────────────────────────
 *
 * Uniquement `transform` : traité par le compositeur, sur le GPU, sans recalcul
 * de mise en page ni redessin. Aucun `filter: blur()` animé — le flou se
 * recalcule à chaque image et fait chauffer les portables ; ici le flou est
 * déjà contenu dans le dégradé radial. Aucun canvas, aucun
 * `requestAnimationFrame`, aucun JavaScript pendant l'animation : le navigateur
 * met tout en pause dès que l'onglet passe à l'arrière-plan.
 *
 * ── Accessibilité ─────────────────────────────────────────────────────────
 *
 * `prefers-reduced-motion` arrête la dérive. Ce n'est pas une politesse : le
 * mouvement périphérique déclenche migraines et nausées chez une partie des
 * gens. Le fond reste alors présent, simplement figé.
 */

const STYLE_ID = "tred-ambient-style";

/**
 * Les couleurs viennent de `--primary`, `--grid-line` et `--grid-step`, déjà
 * définis dans styles.css pour les deux thèmes. Aucun second jeu de couleurs à
 * maintenir : le fond suit le thème clair et le thème sombre tout seul, et sa
 * trame s'aligne exactement sur celle qui existe déjà.
 */
const CSS = `
@keyframes tred-drift-a {
  0%, 100% { transform: translate3d(-7%, -5%, 0) scale(1); }
  33%      { transform: translate3d(5%, 4%, 0) scale(1.14); }
  66%      { transform: translate3d(-3%, 7%, 0) scale(0.94); }
}
@keyframes tred-drift-b {
  0%, 100% { transform: translate3d(5%, 7%, 0) scale(1.06); }
  50%      { transform: translate3d(-6%, -4%, 0) scale(0.9); }
}

.tred-amb {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  /* Volontairement transparent : le fond de page est déjà peint par <body>. */
  background: transparent;
}

/* Trame technique, fixe. TRED est une application d'ingénierie — du papier
   millimétré dit ce qu'est le produit mieux qu'une nébuleuse violette. */
.tred-amb__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px);
  background-size: var(--grid-step) var(--grid-step);
}

/* La trame s'efface vers le bas : elle décore le haut de l'écran et disparaît
   là où l'on lit vraiment. */
.tred-amb--ambient .tred-amb__grid {
  mask-image: linear-gradient(to bottom, #000 0%, transparent 58%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 58%);
}

.tred-amb__glow {
  position: absolute;
  border-radius: 9999px;
  will-change: transform;
}

.tred-amb__glow--a {
  top: -30vmax;
  left: -20vmax;
  width: 74vmax;
  height: 74vmax;
  background: radial-gradient(circle at center, var(--tred-glow-1) 0%, transparent 62%);
  animation: tred-drift-a 38s ease-in-out infinite;
}

.tred-amb__glow--b {
  bottom: -34vmax;
  right: -24vmax;
  width: 64vmax;
  height: 64vmax;
  background: radial-gradient(circle at center, var(--tred-glow-2) 0%, transparent 60%);
  animation: tred-drift-b 52s ease-in-out infinite;
}

/* Derrière l'application : deux fois plus lent. On ne doit pas pouvoir dire si
   ça bouge sans fixer un point pendant dix secondes. */
.tred-amb--ambient .tred-amb__glow--a { animation-duration: 76s; }
.tred-amb--ambient .tred-amb__glow--b { animation-duration: 104s; }

@media (prefers-reduced-motion: reduce) {
  .tred-amb__glow { animation: none !important; }
}
`;

/** La feuille est injectée UNE fois : deux écrans peuvent afficher le fond. */
function useAmbientStyle(): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
    // Pas de nettoyage au démontage : la feuille sert à toute l'application, et
    // la retirer ferait scintiller l'écran suivant le temps de la réinjecter.
  }, []);
}

export function AmbientBackground({
  variant = "ambient",
  className,
}: {
  /** `hero` sur /login et l'accueil ; `ambient` derrière l'application. */
  variant?: "hero" | "ambient";
  className?: string;
}) {
  useAmbientStyle();

  const hero = variant === "hero";

  const vars = {
    "--tred-glow-1": hero
      ? "color-mix(in oklab, var(--primary) 24%, transparent)"
      : "color-mix(in oklab, var(--primary) 8%, transparent)",
    "--tred-glow-2": hero
      ? "color-mix(in oklab, var(--primary) 15%, transparent)"
      : "color-mix(in oklab, var(--primary) 5%, transparent)",
  } as React.CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn("tred-amb", hero ? "tred-amb--hero" : "tred-amb--ambient", className)}
      style={vars}
    >
      <div className="tred-amb__grid" />
      <div className="tred-amb__glow tred-amb__glow--a" />
      <div className="tred-amb__glow tred-amb__glow--b" />
    </div>
  );
}
