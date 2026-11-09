import { CircleHelp, CornerDownLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import { BoardStatus, GlassBoard, PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { FloatingProfessor, HoersaalStage } from "@/components/hoersaal-stage";
import { BoardText, ChoiceButtons } from "@/components/tafel-board";
import { TURN_MS, type ProfessorPose } from "@/lib/professor-choreography";
import { professorText, useProfessor } from "@/lib/professors";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Digitaler Hörsaal — maquette visuelle (aucune donnée, aucune IA).
 *
 * L'idée : entrer dans un amphithéâtre, pas sur un site web. UN seul
 * conteneur plein écran (components/hoersaal-stage.tsx, la même scène que le
 * vrai tuteur /chat). De haut en bas, dans le flux : la Tafel, son rebord
 * « Farben », puis la barre du chat (détails dans hoersaal-stage.tsx) :
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ la Tafel                         ┌────────┐   │
 *   │                                  │ prof   │ ← flottant, déplaçable
 *   │                                  └────────┘   │
 *   │ ═══ rebord « Farben » : couleurs du tableau ═══│
 *   └──────────────────────────────────────────────┘
 *   (dans le rebord : « Farben » à gauche, la saisie en verre dépoli à
 *    droite — une seule ligne ; plus de barre séparée sous le tableau)
 *
 * Écriture : police manuscrite Caveat (auto-hébergée, public/fonts) pour ce
 * que le professeur ÉCRIT ; Inter / Fraunces pour l'interface. Les formules
 * restent en KaTeX : l'exactitude passe avant le style.
 *
 * SLOTS — chaque zone porte un `data-slot` qui correspond au calque Figma du
 * même nom (voir GUIDE_FOUNDER.md, Étape A) :
 *
 *   board     ↔ Figma « Tafel »                 (défaut : <TafelPlaceholderContent />)
 *   avatar    ↔ Figma « Professor/AvatarSlot »  (défaut : professeur choisi, en hologramme)
 *
 * L'avatar temps réel (HeyGen LiveAvatar) ne sera rendu que si
 * VITE_AVATAR_ENABLED=true ET qu'un composant est passé dans `avatar`.
 */

export const AVATAR_ENABLED = import.meta.env.VITE_AVATAR_ENABLED === "true";

export interface VirtualClassroomSlots {
  /** Remplace le contenu du tableau (sous l'en-tête). */
  board?: ReactNode;
  /** Vidéo de l'avatar (ex. <LiveAvatarStream />). Ignoré si le flag est éteint. */
  avatar?: ReactNode;
}

const DONE_STEPS = ["Beobachtung", "Physik"];

/**
 * La chorégraphie en boucle, sans son (maquette) : il écrit de dos, se
 * retourne, explique, puis recommence. Le vrai tuteur suit le flux de l'IA
 * (components/hologram-professor.tsx → useProfessorChoreography).
 */
const DEMO: { pose: ProfessorPose; ms: number }[] = [
  { pose: "schreiben", ms: 3500 },
  { pose: "drehen", ms: TURN_MS },
  { pose: "erklaeren", ms: 4500 },
];

function useDemoPose(): ProfessorPose {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setI((n) => (n + 1) % DEMO.length), DEMO[i].ms);
    return () => clearTimeout(id);
  }, [i]);
  return DEMO[i].pose;
}

const POSE_STATUS: Partial<Record<ProfessorPose, string>> = {
  schreiben: "tafel.profWriting",
  drehen: "tafel.profTurning",
  erklaeren: "tafel.profExplaining",
};

export function VirtualClassroom({ board, avatar }: VirtualClassroomSlots = {}) {
  const { t, locale } = useT();
  const { composer, extras } = useClassroomComposer();
  const professor = useProfessor();
  const pose = useDemoPose();
  const status = POSE_STATUS[pose];
  return (
    <div data-slot="virtual-classroom" className="flex h-dvh w-full flex-col overflow-hidden">
      <HoersaalStage
        board={
          <GlassBoard
            eyebrow="Digitaler Hörsaal · Grundlagen der Elektrotechnik"
            title="Kirchhoffsche Gesetze"
            status={pose === "schreiben" ? <BoardStatus>{t("tafel.writing")}</BoardStatus> : undefined}
            composer={composer}
            composerExtras={extras}
          >
            <div data-slot="tafel" className="flex flex-1 flex-col items-center justify-center gap-6">
              {board ?? <TafelPlaceholderContent />}
            </div>
          </GlassBoard>
        }
      >
        <FloatingProfessor
          professor={professor}
          pose={pose}
          video={AVATAR_ENABLED ? avatar : undefined}
          status={status ? t(status) : undefined}
          subtitle={professorText(professor.title, locale)}
          dragLabel={t("tafel.dragProfessor")}
        />
      </HoersaalStage>
    </div>
  );
}

/**
 * Contenu de démonstration. Comme dans le vrai tuteur, TOUT est au tableau :
 * l'étape calculée, le commentaire du professeur et sa question, avec les
 * options cliquables (components/tafel-board.tsx).
 */
function TafelPlaceholderContent() {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <>
      <StepChecklist
        steps={[...DONE_STEPS.map((label) => ({ label, done: true })), { label: "Gleichungen", done: false }]}
      />
      <PaperNote title="Schritt 3 — Gleichungen" stamp={<SolverStamp />}>
        <div className="[&_.katex]:text-[1.5em] [&_.katex-display]:my-4 [&_.katex-display]:!overflow-visible">
          <MarkdownContent
            content={
              "Knotenregel: $I_1 = I_2 + I_3$\n\n" +
              "$$\n" +
              "I_1 = \\frac{U_q}{R_1 + R_2 \\parallel R_3} = \\frac{12\\,\\mathrm{V}}{2\\,\\Omega + 2\\,\\Omega} = 3\\,\\mathrm{A}\n" +
              "$$"
            }
          />
        </div>
        <p className="font-hand mt-2 text-xl text-[color:var(--board-muted)]">
          R₂ ∥ R₃ — zwei gleiche Widerstände parallel ergeben die Hälfte.
        </p>
      </PaperNote>
      <PaperNote title="Frage" tilt={0.4}>
        <BoardText text={String.raw`Was passiert mit $I_1$, wenn $R_3 \to \infty$?`} />
        <div className="mt-3">
          <ChoiceButtons
            options={[
              { key: "A", text: "$I_1$ steigt" },
              { key: "B", text: "$I_1$ sinkt auf 2 A" },
              { key: "C", text: "$I_1$ bleibt 3 A" },
            ]}
            onChoice={(a) => setChosen(a.slice(0, 1))}
            chosen={chosen}
          />
        </div>
      </PaperNote>
    </>
  );
}

/* ── La barre du bas ─────────────────────────────────────────────────── */

type ProfessorMode = "answer" | "ask";

/** « Je réponds » / « Pose une question » — au-dessus du champ de saisie. */
function ModeSwitch({ mode, onChange }: { mode: ProfessorMode; onChange: (m: ProfessorMode) => void }) {
  const options: { value: ProfessorMode; label: string; icon: typeof CircleHelp }[] = [
    { value: "answer", label: "Je réponds", icon: CornerDownLeft },
    { value: "ask", label: "Pose une question", icon: CircleHelp },
  ];
  return (
    <fieldset data-slot="professor-mode" className="bg-muted/70 ring-border inline-grid grid-cols-2 gap-1 rounded-full border-0 p-1 ring-1">
      <legend className="sr-only">Mode d'échange avec le professeur</legend>
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            mode === value
              ? "bg-[#EAB308] text-[#0F172A] shadow-[0_6px_18px_-8px_rgb(234_179_8/0.8)]"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * La saisie, dans le rebord du tableau (comme le vrai tuteur) : « Farben »
 * à gauche, le champ à droite, sur la même ligne. Le choix « Je réponds /
 * Pose une question » est posé juste au-dessus du rebord.
 */
function useClassroomComposer() {
  const [mode, setMode] = useState<ProfessorMode>("answer");
  const composer = (
    <div data-slot="chat-composer" className="flex items-center gap-2 rounded-2xl border border-white/50 bg-white/45 px-3 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_6px_16px_-10px_rgb(0_0_0/0.5)] backdrop-blur-xl backdrop-saturate-150 focus-within:bg-white/70 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#EAB308]/60">
      <input
        aria-label={mode === "ask" ? "Ta question au professeur" : "Ta réponse au professeur"}
        placeholder={mode === "ask" ? "Pose ta question au professeur…" : "Réponds au professeur…"}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-[#0F172A] outline-none placeholder:text-[#475569]"
      />
      <button type="button" className="rounded-xl bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
        {mode === "ask" ? "Demander" : "Envoyer"}
      </button>
    </div>
  );
  return { composer, extras: <ModeSwitch mode={mode} onChange={setMode} /> };
}

/** Route /classroom : wouter passe ses propres props, on ne les transmet pas. */
export default function VirtualClassroomPage() {
  return <VirtualClassroom />;
}
