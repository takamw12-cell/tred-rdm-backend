import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

// On ajoute les props pour recevoir les messages et la fonction pour les mettre à jour
export function LanguageSwitcher({ messages = [], setMessages = () => {} }: { messages?: any[], setMessages?: (msgs: any[]) => void }) {
  
  const currentLocale = typeof window !== "undefined" 
    ? localStorage.getItem("tred.locale") || "de" 
    : "de";

  const handleLanguageChange = async (newLocale: string) => {
    try {
      // 1. On met à jour la langue pour les prochains messages
      localStorage.setItem("tred.locale", newLocale);
      
      // 2. S'il y a des messages dans l'historique, on les traduit automatiquement
      if (messages && messages.length > 0) {
        // On prépare les textes pour l'API
        const textsToTranslate = messages.map((msg, index) => ({
          id: String(index), // On utilise l'index comme ID simple pour le front
          content: msg.content
        }));

        // 3. On appelle le backend pour traduire tout l'historique
        const { results } = await api.agent.translate.mutate({
          texts: textsToTranslate,
          target: newLocale
        });

        // 4. On met à jour l'interface avec les messages traduits (sans recharger la page !)
        const translatedMessages = messages.map((msg, index) => ({
          ...msg,
          content: results.find(r => r.id === String(index))?.content || msg.content
        }));
        
        setMessages(translatedMessages);
      }
      
      // NOTE IMPORTANTE : On ne fait PAS de window.location.reload() ici.
      // On garde l'historique traduit à l'écran. Le prochain message envoyé utilisera la nouvelle langue.

    } catch (error) {
      console.error("Erreur de traduction automatique :", error);
      // En cas d'erreur, on force juste le rechargement pour éviter un blocage
      window.location.reload(); 
    }
  };

  // ... (Liste des 12 langues que tu as déjà) ...
  const languages = [ /* ... garde ta liste existante ici ... */ ];

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