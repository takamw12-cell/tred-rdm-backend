import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUserStore } from "@/stores/user";
import { backgroundsFor, categoryForProgram } from "@/lib/background-sets";

/**
 * Fond photographique tournant, façon « Windows Spotlight ».
 *
 * Photos sous licence Unsplash dans /public/backgrounds/<catégorie>/ — voir
 * CREDITS.md. Une nouvelle image toutes les 10 minutes, en fondu.
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

const DEFAULT_ROTATE_MS = 10 * 60 * 1000;
const FADE_MS = 1500;

/**
 * Mode test : `?bg=30` dans l'URL → rotation toutes les 30 s et étiquette
 * « filière · image » en bas à droite. Rien ne change pour les autres
 * utilisateurs ; on vérifie ainsi une filière sans attendre 10 minutes.
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
const VEILS = {
  vivid: "from-background/70 via-background/35 to-background/20",
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

  // La filière change (réglages, onboarding) : on bascule sans attendre.
  useEffect(() => {
    if (!images.includes(current)) setCurrent(images[0]);
  }, [images, current]);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const interval = setInterval(() => {
      const list = imagesRef.current;
      const next = list[(list.indexOf(currentRef.current) + 1) % list.length];
      // Préchargement : le fondu ne démarre qu'une fois l'image décodée.
      const img = new Image();
      img.src = next;
      img
        .decode()
        .catch(() => undefined)
        .then(() => {
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
  }, [rotateMs]);

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

function Layer({ src, visible, fadeIn = false }: { src: string; visible: boolean; fadeIn?: boolean }) {
  // Monté à opacité 0 puis passé à 1 au rendu suivant : c'est ce qui
  // déclenche la transition CSS.
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (!fadeIn) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [fadeIn]);

  return (
    <img
      src={src}
      alt=""
      decoding="async"
      className="absolute inset-0 size-full object-cover transition-opacity ease-in-out"
      style={{ opacity: shown ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
    />
  );
}
