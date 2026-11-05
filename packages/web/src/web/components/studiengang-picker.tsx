import { useUserStore } from "@/stores/user";
import { useT } from "@/i18n";
import { STUDIENGAENGE, studiengangLabel } from "@/lib/studiengaenge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Studiengang (filière) — réglages.
 *
 * Écrit dans le profil (stores/user.ts). Le fond de l'application
 * (DynamicBackground → lib/background-sets.ts) lit ce même champ : le
 * changement s'applique IMMÉDIATEMENT, sans rechargement.
 *
 * La liste et ses traductions (12 langues) sont dans lib/studiengaenge.ts :
 * la valeur enregistrée reste le nom allemand, seul l'affichage est traduit.
 */
const OTHER = "__other__";

export function StudiengangPicker() {
  const { t, locale } = useT();
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const known = STUDIENGAENGE.some((s) => s.value === profile.degree);
  // Une filière saisie à l'onboarding hors liste reste affichée telle quelle.
  const value = known ? profile.degree : profile.degree ? profile.degree : OTHER;

  return (
    <Select
      value={value}
      onValueChange={(v) => setProfile({ ...profile, degree: v === OTHER ? "" : v })}
    >
      <SelectTrigger className="w-72 max-w-full" aria-label={t("settings.studiengangLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STUDIENGAENGE.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {studiengangLabel(s, locale)}
          </SelectItem>
        ))}
        {!known && profile.degree && <SelectItem value={profile.degree}>{profile.degree}</SelectItem>}
        <SelectItem value={OTHER}>{t("settings.studiengangOther")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
