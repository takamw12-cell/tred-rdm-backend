export function LanguageSwitcher() {
  const currentLocale = typeof window !== "undefined" 
    ? localStorage.getItem("tred.locale") || "de" 
    : "de";

  // On utilise un simple <select> HTML pour éviter tout crash de composant
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;
    localStorage.setItem("tred.locale", newLocale);
    window.location.reload(); // Recharge la page pour appliquer la langue
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
      <select
        value={currentLocale}
        onChange={handleLanguageChange}
        className="bg-background border border-border rounded-md px-2 py-1 text-sm h-8"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}