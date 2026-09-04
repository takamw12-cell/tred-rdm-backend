import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Le guide du premier lancement — quatre étapes, un projecteur, une bulle.
 *
 * ── Pourquoi il existe ────────────────────────────────────────────────────
 *
 * Onze comptes créés, zéro document déposé. L'inscription menait à un tableau
 * de bord vide, sans rien indiquer. Le produit entier dépend d'un premier
 * téléversement qui n'arrivait jamais.
 *
 * ── Les cibles sont désignées par attribut, pas par `ref` ──────────────────
 *
 * Chaque élément à montrer porte `data-tour="…"`. Faire remonter quatre `ref`
 * à travers l'en-tête, la barre latérale et le tableau de bord aurait imposé
 * une prop à chaque composant traversé — et cassé le jour où l'un d'eux est
 * déplacé. Un attribut voyage avec l'élément.
 *
 * Conséquence assumée : une cible absente de la page n'est pas une erreur.
 * L'étape est simplement sautée — voir `useSpotlight`.
 *
 * ── Le trou lumineux ──────────────────────────────────────────────────────
 *
 * Pas de masque SVG ni de découpe : un `box-shadow` de 9999 pixels autour d'un
 * rectangle transparent assombrit tout SAUF ce rectangle, en une déclaration,
 * et suit les coins arrondis. Le voile ne capte pas le clic sur la cible :
 * `pointer-events` reste sur le voile, jamais sur le trou.
 */

/** Le nom de chaque cible. Le même mot est écrit sur l'élément. */
export const TOUR_TARGETS = ["nav", "upload", "chat", "language"] as const;
export type TourTarget = (typeof TOUR_TARGETS)[number];

/**
 * La clé de persistance porte un numéro de version.
 *
 * Le jour où les étapes changent, `v2` fera revoir le guide à tout le monde —
 * y compris à ceux qui l'ont déjà vu. Sans ce numéro, il faudrait choisir
 * entre ne jamais le remontrer et le remontrer à chaque déploiement.
 */
const STORAGE_KEY = "tred.guide.v1";

/** Le guide a-t-il déjà été vu ou passé ? */
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // Navigation privée, stockage refusé : on considère « vu ». Un guide qui
    // revient à chaque page serait pire que pas de guide du tout.
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    /* rien à faire : il reviendra, c'est le moindre mal */
  }
}

/** Efface la trace seule — sans relancer l'affichage. */
export function resetGuide(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignoré */
  }
}

/**
 * Le nom de l'événement qui réveille le guide.
 *
 * Le composant est monté en permanence dans `AppLayout` et ne lit le stockage
 * qu'une fois, au montage. Effacer la clé depuis les réglages ne ferait donc
 * rien avant le prochain rechargement de la page — un bouton qui ne répond
 * pas. L'événement lui parle directement, sans imposer un contexte partagé
 * entre deux composants qui n'ont rien d'autre à se dire.
 */
const EVENEMENT_RELANCE = "tred:guide-relance";

/** Le bouton « revoir le guide » : efface la trace ET rouvre tout de suite. */
export function restartGuide(): void {
  resetGuide();
  window.dispatchEvent(new Event(EVENEMENT_RELANCE));
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGE = 8;

/**
 * Mesure la cible et suit ses déplacements.
 *
 * `useLayoutEffect` et non `useEffect` : la mesure doit précéder la peinture,
 * sinon la bulle apparaît un instant au mauvais endroit puis saute.
 */
function useSpotlight(target: TourTarget | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  const mesurer = useCallback(() => {
    if (!target) return setRect(null);
    // Plusieurs éléments peuvent porter la même cible : le menu latéral sur
    // grand écran, le bouton hamburger sur téléphone. On prend le PREMIER
    // RÉELLEMENT VISIBLE — un `querySelector` simple aurait pris celui qui
    // vient en premier dans le document, y compris quand il est replié.
    const candidats = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
    let r: DOMRect | null = null;
    for (const el of candidats) {
      const c = el.getBoundingClientRect();
      if (c.width > 0 && c.height > 0) {
        r = c;
        break;
      }
    }
    if (!r) return setRect(null);

    setRect({
      top: r.top - MARGE,
      left: r.left - MARGE,
      width: r.width + MARGE * 2,
      height: r.height + MARGE * 2,
    });
  }, [target]);

  useLayoutEffect(() => {
    mesurer();
    window.addEventListener("resize", mesurer);
    window.addEventListener("scroll", mesurer, true);
    return () => {
      window.removeEventListener("resize", mesurer);
      window.removeEventListener("scroll", mesurer, true);
    };
  }, [mesurer]);

  return rect;
}

export function OnboardingGuide({
  /** Ouvert de force — pour le bouton « revoir le guide ». */
  open,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
} = {}) {
  const { t } = useT();

  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const bulle = useRef<HTMLDialogElement>(null);

  // Au premier rendu seulement. Le guide ne se rouvre jamais tout seul.
  useEffect(() => {
    if (open !== undefined) return setVisible(open);
    if (!guideSeen()) setVisible(true);
  }, [open]);

  // Redemandé depuis les réglages : on repart de la première étape.
  useEffect(() => {
    const relancer = () => {
      setIndex(0);
      setVisible(true);
    };
    window.addEventListener(EVENEMENT_RELANCE, relancer);
    return () => window.removeEventListener(EVENEMENT_RELANCE, relancer);
  }, []);

  const cible = TOUR_TARGETS[index] ?? null;
  const rect = useSpotlight(visible ? cible : null);

  const fermer = useCallback(() => {
    markSeen();
    setVisible(false);
    onClose?.();
  }, [onClose]);

  const suivant = useCallback(() => {
    setIndex((i) => {
      if (i >= TOUR_TARGETS.length - 1) {
        fermer();
        return i;
      }
      return i + 1;
    });
  }, [fermer]);

  const precedent = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  /**
   * Une étape dont la cible est absente est sautée automatiquement.
   *
   * Le sélecteur de langue vit dans l'en-tête, qui n'existe pas sur toutes les
   * pages. Sans ce saut, le guide s'arrêterait sur un voile noir sans rien
   * éclairer — et l'étudiant croirait à un blocage.
   */
  useEffect(() => {
    if (!visible || rect !== null) return;
    const timer = window.setTimeout(() => {
      if (index >= TOUR_TARGETS.length - 1) fermer();
      else setIndex((i) => i + 1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [visible, rect, index, fermer]);

  // Clavier : Échap passe, les flèches naviguent. Un guide qu'on ne peut
  // quitter qu'à la souris est une prison sur un ordinateur portable.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
      if (e.key === "ArrowRight") suivant();
      if (e.key === "ArrowLeft") precedent();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, fermer, suivant, precedent]);

  // Le focus part sur la bulle : sans cela, un lecteur d'écran continue de
  // lire la page derrière le voile, qui n'est plus atteignable.
  useEffect(() => {
    if (visible && rect) bulle.current?.focus();
  }, [visible, rect, index]);

  if (!visible || !rect) return null;

  // La bulle passe au-dessus quand la cible est dans la moitié basse — sinon
  // elle sortirait de l'écran sur la barre d'onglets du bas.
  const dessous = rect.top + rect.height < window.innerHeight / 2;
  const largeur = Math.min(340, window.innerWidth - 32);
  const gauche = Math.min(
    Math.max(16, rect.left + rect.width / 2 - largeur / 2),
    window.innerWidth - largeur - 16,
  );

  const dernier = index === TOUR_TARGETS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* Le voile. Le rectangle lui-même est transparent : c'est son ombre
          portée de 9999 px qui assombrit tout le reste. */}
      <button
        type="button"
        onClick={fermer}
        aria-label={t("guide.skip")}
        className="pointer-events-auto absolute cursor-default rounded-xl transition-all duration-300 motion-reduce:transition-none"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
          outline: "2px solid var(--color-signature, #eab308)",
          outlineOffset: 2,
        }}
      />

      {/* Un vrai <dialog>, pas une div qui joue au dialogue : le rôle est
          implicite, et les lecteurs d'écran le traitent correctement. Il reste
          NON modal (`open` et non `showModal()`), parce que le voile sombre est
          dessiné à la main juste au-dessus — la boîte doit pouvoir flotter à
          l'endroit exact de la cible. */}
      <dialog
        ref={bulle}
        open
        aria-labelledby="guide-titre"
        className={cn(
          "border-border bg-card text-foreground pointer-events-auto absolute m-0 rounded-2xl border p-4 shadow-2xl outline-none",
          "transition-all duration-300 motion-reduce:transition-none",
        )}
        style={{
          width: largeur,
          left: gauche,
          top: dessous ? rect.top + rect.height + 14 : undefined,
          bottom: dessous ? undefined : window.innerHeight - rect.top + 14,
        }}
      >
        {/* La flèche. Un simple carré tourné à 45°, du côté de la cible. */}
        <span
          aria-hidden
          className="border-border bg-card absolute size-3 rotate-45 border"
          style={{
            left: Math.min(
              Math.max(16, rect.left + rect.width / 2 - gauche - 6),
              largeur - 28,
            ),
            top: dessous ? -7 : undefined,
            bottom: dessous ? undefined : -7,
            borderRight: dessous ? "none" : undefined,
            borderBottom: dessous ? "none" : undefined,
            borderLeft: dessous ? undefined : "none",
            borderTop: dessous ? undefined : "none",
          }}
        />

        <div className="mb-2 flex items-start gap-2">
          <span className="text-signature font-mono text-[11px] font-semibold tabular-nums">
            {index + 1}/{TOUR_TARGETS.length}
          </span>
          <h2 id="guide-titre" className="flex-1 text-sm leading-snug font-semibold">
            {t(`guide.${cible}Title` as "guide.navTitle")}
          </h2>
          <button
            type="button"
            onClick={fermer}
            aria-label={t("guide.skip")}
            className="text-muted-foreground hover:text-foreground -mt-0.5 shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-muted-foreground mb-4 text-[13px] leading-relaxed">
          {t(`guide.${cible}Body` as "guide.navBody")}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fermer}
            className="text-muted-foreground hover:text-foreground mr-auto text-xs underline underline-offset-2"
          >
            {t("guide.skip")}
          </button>

          {index > 0 && (
            <Button size="sm" variant="ghost" onClick={precedent} className="gap-1 px-2">
              <ChevronLeft className="size-4" />
              {t("guide.back")}
            </Button>
          )}

          <Button size="sm" onClick={suivant} className="gap-1">
            {dernier ? t("guide.done") : t("guide.next")}
            {!dernier && <ChevronRight className="size-4" />}
          </Button>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
