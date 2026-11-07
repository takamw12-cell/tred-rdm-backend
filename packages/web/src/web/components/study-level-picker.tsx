import { useUserStore, STUDY_LEVELS, type StudyLevel } from "@/stores/user";
import { useT } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Niveau d'études (Lycée, Bachelor, Master, Doctorat) — réglages.
 *
 * Écrit dans le profil (stores/user.ts) ; part avec chaque question du chat
 * (pages/chat.tsx → studyProfile.level) et le tuteur adapte la profondeur des
 * explications (api/lib/study-profile.ts). « Lycée » active aussi la famille
 * école du routeur de domaines (lib/domains/).
 */
export function StudyLevelPicker() {
  const { t } = useT();
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  return (
    <Select
      value={profile.studyLevel || undefined}
      onValueChange={(v) => setProfile({ ...profile, studyLevel: v as StudyLevel })}
    >
      <SelectTrigger className="w-72 max-w-full" aria-label={t("common.studyLevel")}>
        <SelectValue placeholder={t("onboarding.selectStudyLevel")} />
      </SelectTrigger>
      <SelectContent>
        {STUDY_LEVELS.map((l) => (
          <SelectItem key={l} value={l}>
            {t(`studyLevels.${l}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
