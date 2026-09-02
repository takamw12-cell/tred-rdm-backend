import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";

import { de } from "./de";
import { en } from "./en";
import { fr } from "./fr";

/**
 * Initialisation des langues de l'application mobile.
 *
 * ── Ce fichier n'existait pas ─────────────────────────────────────────────
 *
 * `app/_layout.tsx` faisait `import { i18n, initI18n } from "../i18n"` alors
 * que le dossier ne contenait que `de.ts`, `en.ts` et `fr.ts`. Metro ne
 * pouvait pas résoudre l'import : **aucun build ne pouvait aboutir.**
 *
 * ── Pourquoi une initialisation asynchrone ────────────────────────────────
 *
 * La langue retenue est lue dans le stockage sécurisé, ce qui prend un aller-
 * retour. `_layout.tsx` garde l'écran de démarrage affiché pendant ce temps :
 * l'utilisateur ne voit donc jamais l'éclair d'allemand avant que sa langue
 * s'applique.
 *
 * ── Le repli ──────────────────────────────────────────────────────────────
 *
 * Pas de langue enregistrée → celle du téléphone. Pas traduite → l'allemand,
 * qui est la langue du cours et celle de l'examen.
 */

export const LANGUAGES = ["de", "en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

/** La clé sous laquelle le choix est conservé entre deux lancements. */
const STORAGE_KEY = "tred.language";

export const i18n: I18nInstance = i18next;

function isSupported(code: string | null | undefined): code is Language {
  return !!code && (LANGUAGES as readonly string[]).includes(code);
}

/** La langue du téléphone, réduite à son code court : « fr-CA » → « fr ». */
function deviceLanguage(): Language {
  const tags = Localization.getLocales();
  for (const tag of tags) {
    const short = tag.languageCode?.toLowerCase();
    if (isSupported(short)) return short;
  }
  return "de";
}

/**
 * Le choix enregistré, s'il existe.
 *
 * `SecureStore` n'est pas disponible sur le web ; l'appel y jette. On se
 * rabat alors sur la langue du téléphone plutôt que de faire tomber l'app.
 */
async function storedLanguage(): Promise<Language | null> {
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    return isSupported(value) ? value : null;
  } catch {
    return null;
  }
}

let started: Promise<I18nInstance> | null = null;

export function initI18n(): Promise<I18nInstance> {
  // Une seule initialisation, même si React monte le layout deux fois — ce
  // qui arrive en mode strict et au rechargement à chaud.
  if (started) return started;

  started = (async () => {
    const language = (await storedLanguage()) ?? deviceLanguage();

    await i18next.use(initReactI18next).init({
      resources: {
        de: { translation: de },
        en: { translation: en },
        fr: { translation: fr },
      },
      lng: language,
      fallbackLng: "de",
      // React échappe déjà tout ce qu'il rend : ré-échapper ici transformerait
      // « Klausur & Übung » en « Klausur &amp; Übung » à l'écran.
      interpolation: { escapeValue: false },
      returnNull: false,
      compatibilityJSON: "v4",
    });

    return i18next;
  })();

  return started;
}

/** Change la langue et la retient pour les prochains lancements. */
export async function setLanguage(language: Language): Promise<void> {
  await i18next.changeLanguage(language);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, language);
  } catch {
    /* navigation web ou stockage refusé : le choix vaut pour cette session */
  }
}
