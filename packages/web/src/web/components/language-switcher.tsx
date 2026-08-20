import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// IMPORTANT : On importe client, pas api, pour correspondre à ton projet !
import { client } from "@/lib/api"; 

export function LanguageSwitcher({ messages = [], setMessages = () => {} }: { messages?: any[], setMessages?: (msgs: any[]) => void }) {
  
  const currentLocale = typeof window !== "undefined" 
    ? localStorage.getItem("tred.locale") || "de" 
    : "de";

  const handleLanguageChange = async (newLocale: string) => {
    try {
      localStorage.setItem("tred.locale", newLocale);
      
      if (messages && messages.length > 0) {
        const textsToTranslate = messages.map((msg, index) => ({
          id: String(index),
          content: msg.content
        }));

        // On utilise client à la place de api
        const { results } = await client.agent.translate.mutate({
          texts: textsToTranslate,
          target: newLocale
        });

        const translatedMessages = messages.map((msg, index) => ({
          ...msg,
          content: results.find(r => r.id === String(index))?.content || msg.content
        }));
        
        setMessages(translatedMessages);
      }
    } catch (error) {
      console.error("Erreur de traduction automatique :", error);
      window.location.reload(); 
    }
  };

  // Ta liste de langues (reste inchangée) :
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