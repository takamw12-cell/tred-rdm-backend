import { CircleHelp, CornerDownLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import { BoardStatus, GlassBoard, PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { FloatingProfessor, HoersaalStage } from "@/components/hoersaal-stage";
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
 *       ┌──────────────────────────────┐
 *       │ bulle du prof + saisie (verre)│ ← barre du chat, tout en bas
 *       └──────────────────────────────┘
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
          >
            <div data-slot="tafel" className="flex flex-1 flex-col items-center justify-center gap-6">
              {board ?? <TafelPlaceholderContent />}
            </div>
          </GlassBoard>
        }
        dock={<ClassroomDock />}
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

/** Contenu de démonstration : sera remplacé par les étapes réelles (lib/tafel.ts). */
function TafelPlaceholderContent() {
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

/** Messages + saisie, dans la barre en verre dépoli (comme le vrai tuteur). */
function ClassroomDock() {
  const [mode, setMode] = useState<ProfessorMode>("answer");
  return (
    <div className="text-foreground">
      <div data-slot="dock-messages" className="px-3 pt-3 sm:px-5">
        <div
          data-slot="professor-bubble"
          className="bg-card ring-border max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm ring-1"
        >
          Regarde la Tafel : R₂ et R₃ sont en parallèle, donc on les remplace par 2 Ω.
          <p className="mt-1.5 font-medium">À toi : que se passe-t-il pour I₁ si R₃ → ∞ ?</p>
        </div>
      </div>
      <div data-slot="chat-composer" className="p-2.5 sm:p-3">
        <div className="mb-2">
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>
        <div className="border-input bg-card flex items-center gap-2 rounded-2xl border px-3 py-2 transition-shadow focus-within:ring-4 focus-within:ring-[#EAB308]/30">
          <input
            aria-label={mode === "ask" ? "Ta question au professeur" : "Ta réponse au professeur"}
            placeholder={mode === "ask" ? "Pose ta question au professeur…" : "Réponds au professeur…"}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
          />
          <button type="button" className="rounded-xl bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#0F172A]">
            {mode === "ask" ? "Demander" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Route /classroom : wouter passe ses propres props, on ne les transmet pas. */
export default function VirtualClassroomPage() {
  return <VirtualClassroom />;
}
