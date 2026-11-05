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
 * - L'image de départ dépend de l'heure (créneau de 10 min), pas du hasard :
 *   recharger la page ne fait pas sauter l'image, et deux onglets montrent la
 *   même.
 * - L'image suivante est PRÉCHARGÉE avant le fondu : jamais de fondu vers un
 *   écran vide sur une connexion lente.
 * - Voile crème à 75 % + léger flou : l'image se perçoit, le texte reste
 *   lisible. Les cartes du dashboard sont blanches et opaques en plus.
 * - Rendu dans <body> par un portail : la page parente est animée
 *   (transform), ce qui casserait `position: fixed`.
 * - `prefers-reduced-motion` : la règle globale de styles.css ramène le
 *   fondu à ~0 ms, l'image change donc sans animation.
 */

const ROTATE_MS = 10 * 60 * 1000;
const FADE_MS = 1500;

/** Image du créneau de 10 minutes en cours. */
const imageForNow = (images: string[]) =>
  images[Math.floor(Date.now() / ROTATE_MS) % images.length];

export function DynamicBackground() {
  const program = useUserStore((s) => s.profile.degree);
  const images = useMemo(() => backgroundsFor(categoryForProgram(program)), [program]);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const [current, setCurrent] = useState(() => imageForNow(images));
  /** Image en train d'apparaître par-dessus `current`, ou null. */
  const [incoming, setIncoming] = useState<string | null>(null);

  // La filière change (réglages, onboarding) : on bascule sans attendre.
  useEffect(() => {
    if (!images.includes(current)) setCurrent(imageForNow(images));
  }, [images, current]);

  useEffect(() => {
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const interval = setInterval(() => {
      const next = imageForNow(imagesRef.current);
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
    }, ROTATE_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Layer key={current} src={current} visible />
      {incoming !== null && <Layer key={incoming} src={incoming} visible={false} fadeIn />}
      {/* Le voile : c'est lui qui garantit la lisibilité. */}
      <div className="bg-background/75 absolute inset-0 backdrop-blur-sm" />
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
