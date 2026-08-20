import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LanguageSwitcher() {
  const currentLocale = typeof window !== "undefined" ? localStorage.getItem("tred.locale") || "de" : "de";

  const handleLanguageChange = (newLocale: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tred.locale", newLocale);
      // Recharge la page pour appliquer la nouvelle langue
      window.location.reload();
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