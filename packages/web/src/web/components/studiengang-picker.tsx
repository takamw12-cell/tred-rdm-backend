import { useState } from "react";
import { useUserStore } from "@/stores/user";
import { useT } from "@/i18n";
import {
  CUSTOM_STUDIENGANG_MAX,
  STUDIENGAENGE,
  customStudiengangSchema,
  isListedStudiengang,
  studiengangLabel,
} from "@/lib/studiengaenge";
import { Input } from "@/components/ui/input";
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
 * (DynamicBackground → lib/background-sets.ts) et le tuteur (studyProfile
 * envoyé avec chaque question → api/lib/study-profile.ts) lisent ce même
 * champ : le changement s'applique IMMÉDIATEMENT, sans rechargement.
 *
 * La liste et ses traductions (12 langues) sont dans lib/studiengaenge.ts :
 * la valeur enregistrée reste le nom allemand, seul l'affichage est traduit.
 *
 * « Andere » ouvre un champ libre, obligatoire : c'est le texte saisi
 * (« Biophysik ») qui est enregistré, jamais « Andere ». Il est enregistré à
 * la validation (Entrée ou sortie du champ), pas à chaque lettre : le fond ne
 * change pas pendant la frappe.
 */
const OTHER = "__other__";

export function StudiengangPicker() {
  const { t, locale } = useT();
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const listed = isListedStudiengang(profile.degree);
  /** « Andere » est choisi : la filière est une saisie libre (ou encore vide). */
  const [other, setOther] = useState(!listed);
  const [draft, setDraft] = useState(listed ? "" : profile.degree);
  const [error, setError] = useState(false);

  function choose(v: string) {
    if (v === OTHER) {
      setOther(true);
      setDraft("");
      setError(false);
      // Plus de filière de la liste : le fond repasse au général jusqu'à la saisie.
      setProfile({ ...profile, degree: "" });
      return;
    }
    setOther(false);
    setError(false);
    setProfile({ ...profile, degree: v });
  }

  function commit() {
    const parsed = customStudiengangSchema.safeParse(draft);
    if (!parsed.success) {
      setError(true);
      return;
    }
    setError(false);
    setDraft(parsed.data);
    if (parsed.data !== profile.degree) setProfile({ ...profile, degree: parsed.data });
  }

  return (
    <div className="flex w-72 max-w-full flex-col gap-2">
      <Select value={other ? OTHER : profile.degree} onValueChange={choose}>
        <SelectTrigger className="w-full" aria-label={t("settings.studiengangLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STUDIENGAENGE.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {studiengangLabel(s, locale)}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>{t("settings.studiengangOther")}</SelectItem>
        </SelectContent>
      </Select>
      {other && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <Input
            data-testid="studiengang-other"
            value={draft}
            required
            maxLength={CUSTOM_STUDIENGANG_MAX}
            placeholder={t("settings.studiengangOtherPlaceholder")}
            aria-label={t("settings.studiengangOtherPlaceholder")}
            aria-invalid={error}
            aria-describedby={error ? "studiengang-other-error" : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(false);
            }}
            onBlur={commit}
          />
          {error && (
            <p id="studiengang-other-error" role="alert" className="text-destructive mt-1 text-xs">
              {t("settings.studiengangOtherRequired")}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
