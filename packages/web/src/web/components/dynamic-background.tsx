import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";
import { useUserStore } from "@/stores/user";
import { useT } from "@/i18n";
import { backgroundsFor, categoryForProgram, portraitOf, shuffled } from "@/lib/background-sets";
import { VEILS } from "@/lib/background-veils";

/**
 * Fond photographique tournant (refonte du 11 nov. 2026).
 *
 * - 10 images par filière (scripts/generate-universal-backgrounds.mjs ;
 *   tant qu'une filière n'a pas les siennes : ses photos d'avant, puis le
 *   fond général — lib/background-sets.ts). Une nouvelle image toutes les
 *   10 secondes, fondu enchaîné d'1 seconde.
 * - Ordre ALÉATOIRE (shuffle, nouveau tirage à chaque tour) : jamais deux
 *   fois la même séquence, jamais deux fois la même image de suite.
 * - Deux couches FIXES (A et B) superposées : l'image suivante est chargée
 *   dans la couche cachée, décodée (`new Image()` + `decode()`), puis on
 *   bascule l'opacité. Pas de démontage, jamais de fondu vers un écran vide,
 *   et l'onglet masqué ne travaille pas (minuteur suspendu).
 * - Bouton Pause discret (au-dessus du bouton de retours). Avec
 *   `prefers-reduced-motion`, le fond est en pause par défaut. Le choix de
 *   l'utilisateur est retenu sur l'appareil.
 * - Mode test : `?bg=30` → rotation en 30 s + étiquette de diagnostic.
 * - Voile en dégradé, selon la page (VEILS), calibré pour le contraste AA
 *   (tests/background-sets.test.ts).
 * - Rendu dans <body> par un portail : la page parente est animée
 *   (transform), ce qui casserait `position: fixed`.
 */

export const ROTATE_MS = 10_000;
export const FADE_MS = 1_000;
const PAUSE_KEY = "aerostudy-bg-paused";

/** Mode test : `?bg=30` → rotation toutes les 30 s et étiquette « filière · image ». */
function readDebugSeconds(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("bg");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.max(3, n)) : 30;
}

/** Pause retenue sur l'appareil ; sinon `prefers-reduced-motion` décide. */
function readPaused(): boolean {
  try {
    const saved = localStorage.getItem(PAUSE_KEY);
    if (saved !== null) return saved === "1";
  } catch {
    /* navigation privée : on retombe sur la préférence système */
  }
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export { VEILS };

/** Téléphone (ou tablette étroite) en portrait : la variante portrait, à l'affichage comme au préchargement. */
const PORTRAIT_MEDIA = "(orientation: portrait) and (max-width: 1024px)";
const isPortrait = () => typeof window !== "undefined" && !!window.matchMedia?.(PORTRAIT_MEDIA).matches;
const urlFor = (src: string) => (src && isPortrait() ? portraitOf(src) : src);

/** Résout quand l'image est téléchargée ET décodée — ou en erreur : jamais bloqué. */
function preload(url: string): Promise<void> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return img.decode().catch(() => undefined);
}

export function DynamicBackground({ variant = "calm" }: { variant?: keyof typeof VEILS }) {
  const { t } = useT();
  const program = useUserStore((s) => s.profile.degree);
  const category = useMemo(() => categoryForProgram(program), [program]);
  const images = useMemo(() => backgroundsFor(category), [category]);

  const [debugSeconds] = useState(readDebugSeconds);
  const rotateMs = debugSeconds !== null ? debugSeconds * 1000 : ROTATE_MS;
  const [paused, setPaused] = useState(readPaused);

  // Première image tirée au hasard, elle aussi.
  const [initial] = useState(() => shuffled(images)[0] ?? "");
  /** Les deux couches (URL résolue paysage/portrait) et celle qui est devant. */
  const [layers, setLayers] = useState<[string, string]>(() => [urlFor(initial), ""]);
  const [front, setFront] = useState<0 | 1>(0);
  const [shown, setShown] = useState(initial);

  /** Tour en cours (ordre aléatoire), consommé image par image. */
  const queue = useRef<string[]>([]);
  /** Miroir de `front`/`shown` pour les minuteurs (mis à jour au moment du fondu, jamais au rendu). */
  const state = useRef({ front: 0 as 0 | 1, shown: initial, busy: false });

  /** Fondu vers `src` : chargement dans la couche cachée, puis bascule de l'opacité. */
  const showImage = useCallback(async (src: string) => {
    if (state.current.busy || src === state.current.shown) return;
    state.current.busy = true;
    const url = urlFor(src);
    await preload(url);
    const back = state.current.front === 0 ? 1 : 0;
    setLayers((l) => (back === 0 ? [url, l[1]] : [l[0], url]));
    // Une frame pour que la couche cachée reçoive son image AVANT le fondu.
    requestAnimationFrame(() => {
      state.current.front = back;
      state.current.shown = src;
      setFront(back);
      setShown(src);
      setTimeout(() => {
        state.current.busy = false;
      }, FADE_MS);
    });
  }, []);

  const nextImage = useCallback(() => {
    if (queue.current.length === 0) queue.current = shuffled(images, state.current.shown);
    return queue.current.shift();
  }, [images]);

  // Nouvelle filière (réglages, onboarding) : nouveau tirage, fondu immédiat.
  useEffect(() => {
    queue.current = shuffled(images, state.current.shown).filter((s) => s !== state.current.shown);
    if (!images.includes(state.current.shown)) {
      const first = queue.current.shift();
      if (first) void showImage(first);
    }
  }, [images, showImage]);

  // La rotation : arrêtée en pause et quand l'onglet est masqué.
  useEffect(() => {
    if (paused || images.length < 2) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        const next = nextImage();
        if (next) void showImage(next);
      }, rotateMs);
    };
    const onVisibility = () => (document.hidden ? clearInterval(timer) : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paused, images, rotateMs, nextImage, showImage]);

  // Pendant que l'image actuelle est affichée, on précharge la suivante :
  // le prochain fondu part sans attendre le réseau.
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      if (queue.current.length === 0) queue.current = shuffled(images, state.current.shown);
      const upcoming = queue.current[0];
      if (upcoming) void preload(urlFor(upcoming));
    }, FADE_MS + 500);
    return () => clearTimeout(id);
  }, [shown, paused, images]);

  const togglePause = () => {
    setPaused((p) => {
      try {
        localStorage.setItem(PAUSE_KEY, p ? "0" : "1");
      } catch {
        /* rien à retenir : le choix vaut pour cette visite */
      }
      return !p;
    });
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#070B14]">
        {layers.map((url, i) => (
          <div
            key={i}
            data-bg-layer={i}
            className="absolute inset-0 bg-cover bg-center transition-opacity ease-in-out will-change-[opacity]"
            style={{
              backgroundImage: url ? `url("${url}")` : undefined,
              opacity: front === i ? 1 : 0,
              transitionDuration: `${FADE_MS}ms`,
            }}
          />
        ))}
        {/* Le voile : plus dense en haut, où le titre est posé sur la photo ;
            léger plus bas, où les cartes en verre (.glass-scope) assurent
            elles-mêmes la lisibilité. */}
        <div className={`absolute inset-0 bg-gradient-to-b transition-colors duration-700 ${VEILS[variant]}`} />
        {debugSeconds !== null && (
          <div className="bg-primary text-primary-foreground absolute bottom-3 left-3 rounded-md px-2 py-1 font-mono text-[11px] leading-tight">
            {category} · {shown.split("/").slice(-2).join("/")} · {debugSeconds}s · {images.length} img
            <br />
            Studiengang: {program || "—"}
          </div>
        )}
      </div>
      {images.length > 1 && (
        <button
          type="button"
          onClick={togglePause}
          aria-pressed={paused}
          aria-label={paused ? t("background.play") : t("background.pause")}
          title={paused ? t("background.play") : t("background.pause")}
          className={
            // Discret : petit, translucide, juste au-dessus du bouton de retours.
            "fixed right-[1.375rem] bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-30 grid size-8 place-items-center rounded-full " +
            "border border-white/15 bg-black/35 text-white/75 backdrop-blur-md transition hover:bg-black/55 hover:text-white " +
            "focus-visible:ring-[3px] focus-visible:ring-[#EAB308]/50 focus-visible:outline-none lg:right-[1.875rem] lg:bottom-[4.5rem]"
          }
        >
          {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        </button>
      )}
    </>,
    document.body,
  );
}
