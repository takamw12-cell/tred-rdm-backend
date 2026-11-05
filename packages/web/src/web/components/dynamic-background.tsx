import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUserStore } from "@/stores/user";
import { backgroundsFor, categoryForProgram, portraitOf } from "@/lib/background-sets";

/**
 * Fond photographique tournant, façon « Windows Spotlight ».
 *
 * Photos sous licence Unsplash dans /public/backgrounds/<catégorie>/ — voir
 * CREDITS.md. Une nouvelle image toutes les 5 minutes, en fondu.
 *
 * V2 : les images suivent la filière du profil (« Luft- und Raumfahrttechnik »
 * → réacteurs, « Mechatronik » → robots…). Le choix est dans
 * lib/background-sets.ts ; une filière inconnue garde le fond général.
 *
 * Choix :
 * - On commence par la première image de la filière, puis la liste défile
 *   dans l'ordre (images de la filière intercalées avec le fond général).
 * - Mode test : `?bg=30` → rotation en 30 s + étiquette de diagnostic.
 * - L'image suivante est PRÉCHARGÉE avant le fondu : jamais de fondu vers un
 *   écran vide sur une connexion lente.
 * - Monté UNE fois dans le layout : toute l'app partage le même fond.
 * - Voile en dégradé, selon la page (VEILS) : léger sur le dashboard, plus
 *   couvrant sur les pages de lecture ; les cartes en verre dépoli
 *   (.glass-scope, styles.css) gardent le texte lisible partout.
 * - Rendu dans <body> par un portail : la page parente est animée
 *   (transform), ce qui casserait `position: fixed`.
 * - `prefers-reduced-motion` : la règle globale de styles.css ramène le
 *   fondu à ~0 ms, l'image change donc sans animation.
 */

const DEFAULT_ROTATE_MS = 5 * 60 * 1000;
const FADE_MS = 1500;

/**
 * Mode test : `?bg=30` dans l'URL → rotation toutes les 30 s et étiquette
 * « filière · image » en bas à droite. Rien ne change pour les autres
 * utilisateurs ; on vérifie ainsi une filière sans attendre 5 minutes.
 */
function readDebugSeconds(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("bg");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.max(5, n)) : 30;
}

/**
 * `vivid` : dashboard — voile léger, la photo porte l'ambiance.
 * `calm`  : pages de lecture (chat, exercices…) — voile plus couvrant ; les
 *           cartes en verre assurent le contraste du texte.
 */
export const VEILS = {
  // Dashboard : l'amphithéâtre sombre du Hörsaal (validé le 5 nov. 2026).
  // La photo de la filière reste visible, assombrie ; les cartes en verre
  // ressortent comme des écrans éclairés. Le texte posé hors carte est blanc.
  vivid: "from-[#070B14]/90 via-[#0B1222]/72 to-[#070B14]/85",
  // 80 % minimum : sur la photo la plus sombre, le texte gris posé hors des
  // bulles (nom « TRED », boutons d'action) reste vers 4:1.
  calm: "from-background/90 via-background/85 to-background/80",
} as const;

export function DynamicBackground({ variant = "calm" }: { variant?: keyof typeof VEILS }) {
  const program = useUserStore((s) => s.profile.degree);
  const category = useMemo(() => categoryForProgram(program), [program]);
  const images = useMemo(() => backgroundsFor(category), [category]);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const [debugSeconds] = useState(readDebugSeconds);
  const rotateMs = debugSeconds !== null ? debugSeconds * 1000 : DEFAULT_ROTATE_MS;

  // On commence TOUJOURS par la première image de la liste : pour une filière
  // reconnue, c'est la sienne (la fusée pour la LRT) — l'étudiant voit tout de
  // suite que le fond lui parle. La suite défile dans l'ordre.
  const [current, setCurrent] = useState(() => images[0]);
  /** Image en train d'apparaître par-dessus `current`, ou null. */
  const [incoming, setIncoming] = useState<string | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  // La filière change (réglages, onboarding) : fondu IMMÉDIAT vers sa
  // première image — même si l'image actuelle figure aussi dans la nouvelle
  // liste — et le minuteur repart de zéro (dépendance `category` plus bas).
  useEffect(() => {
    const first = imagesRef.current[0];
    if (currentRef.current === first) return;
    const run = { cancelled: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    void preload(first).then(() => {
      if (run.cancelled) return;
      setIncoming(first);
      run.timer = setTimeout(() => {
        setCurrent(first);
        setIncoming(null);
      }, FADE_MS);
    });
    return () => {
      run.cancelled = true;
      if (run.timer) clearTimeout(run.timer);
    };
  }, [category]);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const interval = setInterval(() => {
      const list = imagesRef.current;
      const next = list[(list.indexOf(currentRef.current) + 1) % list.length];
      // Préchargement : le fondu ne démarre qu'une fois l'image décodée.
      preload(next).then(() => {
          if (cancelled) return;
          setIncoming(next);
          fadeTimer = setTimeout(() => {
            setCurrent(next);
            setIncoming(null);
          }, FADE_MS);
        });
    }, rotateMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [rotateMs, category]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Layer key={current} src={current} visible />
      {incoming !== null && <Layer key={incoming} src={incoming} visible={false} fadeIn />}
      {/* Le voile, en dégradé : plus dense en haut, où le titre et la date
          sont posés directement sur la photo ; léger plus bas, où les cartes
          en verre dépoli (.glass-scope) assurent elles-mêmes la lisibilité. */}
      <div className={`absolute inset-0 bg-gradient-to-b transition-colors duration-700 ${VEILS[variant]}`} />
      {debugSeconds !== null && (
        <div className="bg-primary text-primary-foreground absolute right-3 bottom-3 rounded-md px-2 py-1 font-mono text-[11px] leading-tight">
          {category} · {current.split("/").slice(-2).join("/")} · {debugSeconds}s
          <br />
          Studiengang: {program || "—"}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Téléphone (ou tablette étroite) en portrait : on sert la variante
 * portrait. Même requête pour le <source> et pour le préchargement, sinon on
 * précharge une image que le navigateur n'affichera pas.
 */
const PORTRAIT_MEDIA = "(orientation: portrait) and (max-width: 1024px)";

function preload(src: string): Promise<void> {
  const img = new Image();
  const portrait = typeof window !== "undefined" && window.matchMedia?.(PORTRAIT_MEDIA).matches;
  img.src = portrait ? portraitOf(src) : src;
  return img.decode().catch(() => undefined);
}

function Layer({ src, visible, fadeIn = false }: { src: string; visible: boolean; fadeIn?: boolean }) {
  // Monté à opacité 0 puis passé à 1 au rendu suivant : c'est ce qui
  // déclenche la transition CSS.
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (!fadeIn) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [fadeIn]);

  // object-cover : l'image remplit l'écran sans jamais être déformée, quel
  // que soit le format ; object-center garde le sujet centré au recadrage.
  return (
    <picture>
      <source media={PORTRAIT_MEDIA} srcSet={portraitOf(src)} type="image/webp" />
      <img
        src={src}
        alt=""
        decoding="async"
        className="absolute inset-0 size-full object-cover object-center transition-opacity ease-in-out"
        style={{ opacity: shown ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
      />
    </picture>
  );
}
