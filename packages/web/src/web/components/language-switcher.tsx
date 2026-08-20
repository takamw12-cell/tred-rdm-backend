import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LanguageSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();

  // Liste des 12 langues incluant le top 10 mondial
  const languages = [
    { code: 'de', label: 'DE Deutsch' },
    { code: 'en', label: 'EN English' },
    { code: 'fr', label: 'FR Français' },
    { code: 'es', label: 'ES Español' },    // #4 Mondial
    { code: 'zh', label: 'ZH 中文' },       // #1 Mondial (Mandarin)
    { code: 'hi', label: 'HI हिन्दी' },     // #3 Mondial (Hindi)
    { code: 'ar', label: 'AR العربية' },    // #6 Mondial (Arabe)
    { code: 'pt', label: 'PT Português' },  // #9 Mondial
    { code: 'ru', label: 'RU Русский' },    // #8 Mondial
    { code: 'bn', label: 'BN বাংলা' },      // #7 Mondial (Bengali)
    { code: 'ja', label: 'JA 日本語' },     // Japonais
    { code: 'it', label: 'IT Italiano' },   // Italien
  ];

  const handleLanguageChange = async (newLocale: string) => {
    if (!session) return;
    try {
      // Met à jour la colonne locale de l'utilisateur dans Turso
      await api.users.updateLocale.mutate({ locale: newLocale });
      // Recharge la page pour que le chat et l'interface prennent la langue en compte
      window.location.reload();
    } catch (error) {
      console.error("Erreur lors du changement de langue :", error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={session?.user?.locale || "de"}
        onValueChange={handleLanguageChange}
      >
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