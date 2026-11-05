import { useUserStore } from "@/stores/user";
import { useT } from "@/i18n";
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
 * Les noms de filières restent en allemand dans toutes les langues : ce sont
 * des noms propres de Studiengänge, tels qu'ils figurent sur l'inscription.
 */
export const STUDIENGAENGE = [
  "Luft- und Raumfahrttechnik",
  "Mechatronik",
  "Elektrotechnik",
  "Maschinenbau",
  "Bauingenieurwesen",
  "Informatik",
  "Mathematik/Physik",
] as const;

const OTHER = "__other__";

export function StudiengangPicker() {
  const { t } = useT();
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const known = (STUDIENGAENGE as readonly string[]).includes(profile.degree);
  // Une filière saisie à l'onboarding hors liste reste affichée telle quelle.
  const value = known ? profile.degree : profile.degree ? profile.degree : OTHER;

  return (
    <Select
      value={value}
      onValueChange={(v) => setProfile({ ...profile, degree: v === OTHER ? "" : v })}
    >
      <SelectTrigger className="w-64 max-w-full" aria-label={t("settings.studiengangLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STUDIENGAENGE.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
        {!known && profile.degree && <SelectItem value={profile.degree}>{profile.degree}</SelectItem>}
        <SelectItem value={OTHER}>{t("settings.studiengangOther")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
