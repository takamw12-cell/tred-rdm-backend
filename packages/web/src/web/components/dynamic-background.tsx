import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";
import { useUserStore } from "@/stores/user";
import { useT } from "@/i18n";
import { backgroundsFor, categoryForProgram, portraitOf, shuffled } from "@/lib/background-sets";
import { VEILS } from "@/lib/background-veils";
import { PRELOAD_TIMEOUT_MS, ROTATION_TICK_MS, busyExpired, pausedFromStorage, shouldRotate } from "@/lib/background-rotation";

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
 *   bascule l'opacité. Pas de démontage, jamais de fondu vers un écran vide.
 * - Rotation pilotée par une HORLOGE (lib/background-rotation.ts) : un
 *   battement d'une seconde compare l'heure au dernier changement. Sur
 *   téléphone et tablette, le navigateur suspend les minuteurs en arrière-plan
 *   et iOS ne signale pas toujours le retour ; un `setInterval(10 s)` arrêté
 *   puis jamais relancé laissait le fond figé. L'onglet masqué ne travaille
 *   toujours pas, et le fond repart dès qu'il redevient visible.
 * - Un chargement d'image qui n'aboutit pas (réseau mobile) est abandonné au
 *   bout de quelques secondes : la rotation ne reste jamais bloquée dessus.
 * - Bouton Pause discret (au-dessus du bouton de retours). Le fond n'est en
 *   pause QUE si l'utilisateur l'a demandé ; son choix est retenu sur
 *   l'appareil. Le réglage système « réduire les animations » ne le fige plus
 *   (correction du 11 nov. 2026 : il le laissait sur la première image).
 * - Indépendant du mode immersif : le fond est dans un portail, hors de
 *   l'interface qui s'efface.
 * - Mode test : `?bg=30` → rotation en 30 s + étiquette de diagnostic (image,
 *   variante portrait, nombre de changements, pause, dernière erreur).
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

/** En pause seulement si l'utilisateur l'a demandé sur cet appareil. */
function readPaused(): boolean {
  try {
    return pausedFromStorage(localStorage.getItem(PAUSE_KEY));
  } catch {
    /* navigation privée : rien de retenu, le fond tourne */
    return false;
  }
}

export { VEILS };

/** Téléphone (ou tablette étroite) en portrait : la variante portrait, à l'affichage comme au préchargement. */
const PORTRAIT_MEDIA = "(orientation: portrait) and (max-width: 1024px)";
const isPortrait = () => typeof window !== "undefined" && !!window.matchMedia?.(PORTRAIT_MEDIA).matches;
const urlFor = (src: string) => (src && isPortrait() ? portraitOf(src) : src);

/**
 * Résout « ok » quand l'image est téléchargée ET décodée, « error » si elle
 * est illisible, « timeout » si le réseau ne répond pas à temps. Jamais
 * bloqué : sur Safari, `decode()` peut ne jamais aboutir.
 */
function preload(url: string): Promise<"ok" | "error" | "timeout"> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  return Promise.race([
    img.decode().then(
      () => "ok" as const,
      // `decode()` refuse parfois une image pourtant chargée : on se fie alors au chargement.
      () => (img.complete && img.naturalWidth > 0 ? ("ok" as const) : ("error" as const)),
    ),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), PRELOAD_TIMEOUT_MS)),
  ]);
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
  const state = useRef({ front: 0 as 0 | 1, shown: initial, busySince: null as number | null, lastSwitch: Date.now() });
  /** Diagnostic (`?bg=…`) : nombre de changements et dernier incident de chargement. */
  const [diag, setDiag] = useState({ switches: 0, issue: "" });

  /** Fondu vers `src` : chargement dans la couche cachée, puis bascule de l'opacité. */
  const showImage = useCallback(async (src: string) => {
    if (src === state.current.shown) return;
    // Un fondu resté « en cours » trop longtemps (chargement perdu) ne bloque plus rien.
    if (state.current.busySince !== null && !busyExpired(state.current.busySince, Date.now())) return;
    state.current.busySince = Date.now();
    const url = urlFor(src);
    const loaded = await preload(url);
    if (loaded !== "ok") {
      // Image illisible ou réseau trop lent : on garde l'image affichée (jamais
      // de fondu vers un écran vide) et la rotation essaiera la suivante.
      state.current.busySince = null;
      state.current.lastSwitch = Date.now();
      setDiag((d) => ({ ...d, issue: `${loaded}: ${url.split("/").pop()}` }));
      return;
    }
    const back = state.current.front === 0 ? 1 : 0;
    setLayers((l) => (back === 0 ? [url, l[1]] : [l[0], url]));
    // Une frame pour que la couche cachée reçoive son image AVANT le fondu.
    requestAnimationFrame(() => {
      state.current.front = back;
      state.current.shown = src;
      state.current.lastSwitch = Date.now();
      setFront(back);
      setShown(src);
      setDiag((d) => ({ ...d, switches: d.switches + 1 }));
      setTimeout(() => {
        state.current.busySince = null;
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

  // La rotation, pilotée par l'horloge : un battement court demande « est-il
  // temps ? ». Un minuteur suspendu par le téléphone (arrière-plan, économie
  // d'énergie) est rattrapé au premier battement qui passe ; rien n'est à
  // « relancer ». Les événements de retour ne servent qu'à ne pas attendre le
  // battement suivant — iOS n'envoie pas toujours `visibilitychange`.
  useEffect(() => {
    if (paused || images.length < 2) return;
    // Reprise (ou sortie de pause) : l'image affichée a droit à sa durée entière.
    state.current.lastSwitch = Date.now();
    const check = () => {
      const due = shouldRotate({
        now: Date.now(),
        lastSwitch: state.current.lastSwitch,
        rotateMs,
        hidden: document.visibilityState === "hidden",
        paused: false,
        imageCount: images.length,
      });
      if (!due) return;
      const next = nextImage();
      if (next) void showImage(next);
    };
    const timer = setInterval(check, ROTATION_TICK_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
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
            {category} · {urlFor(shown).split("/").slice(-2).join("/")} · {debugSeconds}s · {images.length} img
            <br />
            {isPortrait() ? "portrait" : "paysage"} · {diag.switches} changement(s) · {paused ? "EN PAUSE (bouton)" : "en rotation"}
            {diag.issue ? ` · ${diag.issue}` : ""}
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
          data-bg-control
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
