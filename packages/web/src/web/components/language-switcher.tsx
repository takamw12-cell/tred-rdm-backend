import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

export function LanguageSwitcher() {
  // Pour l'instant, on lit la langue depuis le localStorage (fallback "de")
  // Idéalement, il faudrait lire la session, mais on peut le faire plus tard.
  const currentLocale = localStorage.getItem("tred.locale") || "de";

  const handleLanguageChange = async (newLocale: string) => {
    try {
      // Appel à l'API pour mettre à jour la locale en base (si l'utilisateur est connecté)
      await api.users.updateLocale.mutate({ locale: newLocale });
      // On stocke aussi en local pour l'interface
      localStorage.setItem("tred.locale", newLocale);
      // Recharge la page pour appliquer la nouvelle langue
      window.location.reload();
    } catch (error) {
      console.error("Erreur lors du changement de langue :", error);
    }
  };

  const languages = [
    { code: 'de', label: 'DE Deutsch' },
    { code: 'en', label: 'EN English' },
    { code: 'fr', label: 'FR Français' },
    { code: 'es', label: 'ES Español' },
    { code: 'zh', label: 'ZH 中文' },
    { code: 'hi', label: 'HI हिन्दी' },
    { code: 'ar', label: 'AR العربية' },
    { code: 'pt', label: 'PT Português' },
    { code: 'ru', label: 'RU Русский' },
    { code: 'bn', label: 'BN বাংলা' },
    { code: 'ja', label: 'JA 日本語' },
    { code: 'it', label: 'IT Italiano' },
  ];

  return (
    <div className="flex items-center gap-2">
      <Select value={currentLocale} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue placeholder="Langue" />
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}