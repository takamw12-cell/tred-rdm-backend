import { useLocaleStore } from "@/stores/locale";
import type { Locale } from "@/i18n/types";

/**
 * Sélecteur de langue.
 *
 * ── Ce qui n'allait pas ───────────────────────────────────────────────────
 *
 * La version précédente écrivait dans `localStorage["tred.locale"]` puis
 * rechargeait la page. Or le store de langue persiste sous la clé
 * `aerostudy-locale`. Deux clés différentes : **changer la langue ne touchait
 * donc jamais l'interface.** Elle changeait la langue du tuteur — le chat lit
 * bien `tred.locale` — et rien d'autre. D'où « les langues ne fonctionnent
 * pas » : le menu passait en italien, tous les libellés restaient en français.
 *
 * Elle contournait aussi `setLocale`, qui est l'endroit où la langue est
 * transmise au serveur (`account.setLocale`). Rien n'était donc conservé.
 *
 * ── Deux langues, pas une ─────────────────────────────────────────────────
 *
 * L'interface est traduite en quatre langues ; le tuteur en parle douze. Ce
 * n'est pas une incohérence à masquer : pour un étudiant, la langue des
 * RÉPONSES compte bien plus que celle des boutons. Les huit langues sans
 * traduction d'interface restent donc proposées, marquées d'un point ; le
 * tuteur y répond, les libellés gardent la dernière langue d'interface.
 */

/** Les langues dont l'interface est traduite — voir i18n/messages/. */
const UI_LOCALES = ["de", "en", "fr", "es"] as const;

/** Tout ce que le tuteur sait parler — voir api/lib/languages.ts. */
const CHOICES: { code: string; label: string }[] = [
  { code: "de", label: "DE  Deutsch" },
  { code: "en", label: "EN  English" },
  { code: "fr", label: "FR  Français" },
  { code: "es", label: "ES  Español" },
  { code: "it", label: "IT  Italiano" },
  { code: "pt", label: "PT  Português" },
  { code: "ru", label: "RU  Русский" },
  { code: "ar", label: "AR  العربية" },
  { code: "zh", label: "ZH  中文" },
  { code: "hi", label: "HI  हिन्दी" },
  { code: "bn", label: "BN  বাংলা" },
  { code: "ja", label: "JA  日本語" },
];

function isUiLocale(code: string): code is Locale {
  return (UI_LOCALES as readonly string[]).includes(code);
}

export function LanguageSwitcher() {
  const locale = useLocaleStore((s) => s.locale);

  function change(code: string) {
    // 1. Le tuteur. Le chat lit cette clé à chaque requête ; elle vaut pour
    //    les douze langues, y compris celles sans traduction d'interface.
    try {
      localStorage.setItem("tred.locale", code);
    } catch {
      /* navigation privée : le choix vaudra pour la session en cours */
    }

    // 2. L'interface — seulement si elle est traduite. Passer un code inconnu
    //    au store ferait chercher un paquet de traductions inexistant.
    //    `setLocale` prévient aussi le serveur : c'est ce qui manquait.
    if (isUiLocale(code)) {
      useLocaleStore.getState().setLocale(code);
    }

    // Aucun `window.location.reload()` : il faisait perdre la conversation en
    // cours, et n'a jamais été nécessaire — `useT()` s'abonne au store.
  }

  // Le menu montre le choix RÉEL de l'utilisateur, pas la langue de
  // l'interface : les deux peuvent légitimement différer.
  let current: string = locale;
  try {
    current = localStorage.getItem("tred.locale") ?? locale;
  } catch {
    /* on garde la langue de l'interface */
  }

  return (
    <select
      value={current}
      onChange={(e) => change(e.target.value)}
      aria-label="Sprache"
      className="bg-background border-border h-8 rounded-md border px-2 py-1 text-sm"
    >
      {CHOICES.map((choice) => (
        <option key={choice.code} value={choice.code}>
          {choice.label}
          {isUiLocale(choice.code) ? "" : " ·"}
        </option>
      ))}
    </select>
  );
}
