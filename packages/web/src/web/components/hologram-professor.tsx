import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { TTS_EVENT } from "@/components/ai-answer";
import type { Professor } from "@/lib/professors";
import { nextPose, TURN_MS, TURN_SECONDS, type ChoreographyEvent, type ProfessorPose } from "@/lib/professor-choreography";
import { PROFESSOR_STYLE } from "@/lib/speech";
import { speak, stopSpeaking } from "@/lib/voice";
import { cn } from "@/lib/utils";

/**
 * Le professeur hologramme du Hörsaal.
 *
 *   schreiben  de dos, tourné vers le tableau — calme, sans bulle, sans bruit
 *   drehen     il se retourne : rotation Y de 180° → 0° en 0,8 s (framer-motion)
 *   erklaeren  de face, il parle ; le halo pulse au rythme de la voix
 *   idle       de face, en silence
 *
 * Deux faces dans un même volume 3D : le portrait devant, la silhouette de
 * dos derrière (backface cachée) — la rotation montre l'une puis l'autre.
 * Mouvement réduit demandé par l'appareil : pas de rotation, pas de pulsation.
 */
export function HologramProfessor({
  professor,
  pose,
  beat = 0,
  size = "md",
}: {
  professor: Professor;
  pose: ProfessorPose;
  /** Incrémenté à chaque mot prononcé : une onde part du halo. */
  beat?: number;
  size?: "md" | "lg";
}) {
  const reduce = useReducedMotion();
  const back = pose === "schreiben";
  const speaking = pose === "erklaeren";
  const dim = size === "lg" ? "size-44" : "size-16 sm:size-20";

  return (
    <div
      data-slot="hologram-professor"
      data-pose={pose}
      className={cn("relative shrink-0", dim)}
      style={{ perspective: 900 }}
      aria-hidden
    >
      {/* Le faisceau du projecteur, sous l'hologramme */}
      <div className="pointer-events-none absolute -bottom-2 left-1/2 h-3 w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgb(103_232_249/0.45),transparent_70%)] blur-[2px]" />

      {/* Halo : calme et faible, sauf quand il parle */}
      <motion.div
        className="absolute inset-0 rounded-full bg-cyan-300/20 shadow-[0_0_40px_12px_rgb(34_211_238/0.25),0_0_24px_6px_rgb(234_179_8/0.25)]"
        animate={
          speaking && !reduce
            ? { scale: [1, 1.1, 1], opacity: [0.55, 1, 0.55] }
            : { scale: 1, opacity: back ? 0.35 : 0.6 }
        }
        transition={speaking && !reduce ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />
      {/* Une onde par mot prononcé (voix de l'appareil) */}
      {speaking && !reduce && beat > 0 && (
        <motion.div
          key={beat}
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-cyan-200/70"
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.35, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}

      {/* Le volume qui tourne */}
      <motion.div
        className="relative size-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={false}
        animate={{ rotateY: back ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { duration: TURN_SECONDS, ease: [0.45, 0, 0.2, 1] }}
      >
        {/* Face : le portrait, teinté comme un hologramme */}
        <div
          className="absolute inset-0 overflow-hidden rounded-full ring-2 ring-cyan-300/70 [backface-visibility:hidden]"
          style={{ WebkitBackfaceVisibility: "hidden" }}
        >
          <ProfessorPortrait professor={professor} eager={size === "lg"} />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(103_232_249/0.10),rgb(34_211_238/0.22))] mix-blend-screen" />
          <span className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(180deg,rgb(255_255_255/0.25)_0px,rgb(255_255_255/0.25)_1px,transparent_1px,transparent_3px)]" />
        </div>

        {/* Dos : la silhouette, tournée vers le tableau */}
        <div
          className="absolute inset-0 overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_35%,#164e63,#0b1222_75%)] ring-2 ring-cyan-300/50 [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)", WebkitBackfaceVisibility: "hidden" }}
        >
          <svg viewBox="0 0 100 100" className="size-full">
            <defs>
              <linearGradient id="holo-back" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#67e8f9" stopOpacity="0.9" />
                <stop offset="1" stopColor="#22d3ee" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            {/* Tête vue de dos, nuque, épaules */}
            <ellipse cx="50" cy="40" rx="17" ry="19" fill="url(#holo-back)" opacity="0.55" />
            <path d="M43 57 Q50 61 57 57 L58 64 Q50 67 42 64 Z" fill="url(#holo-back)" opacity="0.45" />
            <path d="M14 100 Q16 70 42 64 Q50 67 58 64 Q84 70 86 100 Z" fill="url(#holo-back)" opacity="0.5" />
            {/* Le bras levé vers le tableau (à sa gauche, comme dans le Hörsaal) */}
            <path d="M26 72 Q14 56 10 40" stroke="#a5f3fc" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.7" />
          </svg>
          <span className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(180deg,rgb(255_255_255/0.25)_0px,rgb(255_255_255/0.25)_1px,transparent_1px,transparent_3px)]" />
        </div>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* La chorégraphie, branchée sur le flux du chat                              */
/* -------------------------------------------------------------------------- */

const AUTO_SPEAK_KEY = "tred-professor-autospeak";

function readAutoSpeak(): boolean {
  try {
    return localStorage.getItem(AUTO_SPEAK_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Pilote l'hologramme à partir de `busy` (le flux de l'IA) :
 * flux en cours → schreiben ; fin du flux → drehen (0,8 s) → erklaeren, lecture
 * automatique de `answerText()` ; fin de la lecture → idle.
 *
 * `answerText` est lu AU MOMENT où le flux se termine (la réponse complète).
 */
export function useProfessorChoreography({
  busy,
  failed,
  answerText,
  locale,
  professor,
}: {
  busy: boolean;
  /** Le flux s'est terminé sur une erreur : pas de lecture. */
  failed: boolean;
  answerText: () => string;
  locale: string;
  professor: Professor;
}) {
  const [pose, setPose] = useState<ProfessorPose>("idle");
  const [beat, setBeat] = useState(0);
  const [autoSpeak, setAutoSpeakState] = useState(readAutoSpeak);
  const prevBusy = useRef(busy);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Les dernières valeurs, lues depuis les minuteries sans fermeture périmée.
  const latest = useRef({ answerText, locale, professor, autoSpeak, failed });
  latest.current = { answerText, locale, professor, autoSpeak, failed };

  const dispatch = useCallback((e: ChoreographyEvent) => setPose((p) => nextPose(p, e)), []);

  useEffect(() => {
    const was = prevBusy.current;
    prevBusy.current = busy;
    if (busy && !was) {
      // Une nouvelle question : on coupe la voix et il se tourne vers le tableau.
      if (timer.current) clearTimeout(timer.current);
      stopSpeaking();
      dispatch({ type: "streamStart" });
      return;
    }
    if (!busy && was) {
      const { answerText: read, failed: err } = latest.current;
      const text = err ? "" : read();
      dispatch({ type: "streamEnd", hasAnswer: Boolean(text) });
      if (!text) return;
      timer.current = setTimeout(() => {
        const { locale: lang, professor: prof, autoSpeak: on } = latest.current;
        dispatch({ type: "turned", willSpeak: on });
        if (!on) return;
        window.dispatchEvent(new CustomEvent(TTS_EVENT, { detail: "hologram" }));
        setBeat(0);
        void speak(text, lang, {
          professorId: prof.id,
          defaultStyle: PROFESSOR_STYLE[prof.id],
          onEnd: () => dispatch({ type: "spoken" }),
          onWord: () => setBeat((b) => b + 1),
        }).then((ok) => {
          if (!ok) dispatch({ type: "spoken" });
        });
      }, TURN_MS);
    }
  }, [busy, dispatch]);

  // Un bouton « Écouter » lancé ailleurs coupe le professeur ; quitter la page aussi.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "hologram") dispatch({ type: "stop" });
    };
    window.addEventListener(TTS_EVENT, onOther);
    return () => {
      window.removeEventListener(TTS_EVENT, onOther);
      if (timer.current) clearTimeout(timer.current);
      stopSpeaking();
    };
  }, [dispatch]);

  const stop = useCallback(() => {
    stopSpeaking();
    dispatch({ type: "stop" });
  }, [dispatch]);

  const setAutoSpeak = useCallback(
    (on: boolean) => {
      setAutoSpeakState(on);
      try {
        localStorage.setItem(AUTO_SPEAK_KEY, on ? "1" : "0");
      } catch {
        /* navigation privée : le réglage vaut pour la session */
      }
      if (!on) stop();
    },
    [stop],
  );

  return { pose, beat, autoSpeak, setAutoSpeak, stop };
}
