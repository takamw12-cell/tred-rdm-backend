import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/api";
import { authClient } from "@/lib/auth";
import {
  DEFAULT_PROFESSOR,
  PROFESSORS,
  isProfessorId,
  type Professor,
} from "../../api/lib/professors";

export {
  DEFAULT_PROFESSOR,
  PROFESSORS,
  PROFESSOR_IDS,
  professorText,
  type Professor,
  type ProfessorId,
} from "../../api/lib/professors";

/**
 * Le professeur choisi par l'étudiant connecté. Sans session (page publique
 * /classroom) ou en cas d'erreur : le professeur par défaut, sans requête.
 */
export function useProfessor(): Professor {
  const { data: session } = authClient.useSession();
  const query = useQuery({
    ...orpc.account.getProfessor.queryOptions(),
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
  });
  const id = query.data?.professorId;
  return PROFESSORS[isProfessorId(id) ? id : DEFAULT_PROFESSOR];
}

/** Textes du vestiaire (de / en / fr ; les autres langues lisent l'anglais). */
const UI = {
  de: {
    section: "Mein virtueller Professor",
    sectionDesc: "Wähle, wer dir an der Tafel erklärt. Der Ton ändert sich, die Richtigkeit nie.",
    choose: "Diesen Professor wählen",
    mine: "Mein Professor",
    saved: "Gespeichert! Dein Professor wartet im Hörsaal.",
    failed: "Konnte nicht gespeichert werden. Bitte später erneut versuchen.",
    change: "Professor wechseln",
  },
  en: {
    section: "My virtual professor",
    sectionDesc: "Choose who explains at the board. The tone changes, the correctness never does.",
    choose: "Choose this professor",
    mine: "My professor",
    saved: "Saved! Your professor is waiting in the lecture hall.",
    failed: "Could not save. Please try again later.",
    change: "Change professor",
  },
  fr: {
    section: "Mon professeur virtuel",
    sectionDesc: "Choisis qui t'explique au tableau. Le ton change, l'exactitude jamais.",
    choose: "Choisir ce professeur",
    mine: "Mon professeur",
    saved: "Enregistré ! Ton professeur t'attend dans l'amphi.",
    failed: "Impossible d'enregistrer. Réessaie plus tard.",
    change: "Changer de professeur",
  },
} as const;

export function professorUi(locale: string) {
  return locale === "de" || locale === "fr" ? UI[locale] : UI.en;
}
