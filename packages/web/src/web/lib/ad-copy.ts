/**
 * Textes des emplacements publicitaires — allemand, français, anglais.
 * Les neuf autres langues de l'interface retombent sur l'anglais : ces
 * écrans sont nouveaux, leur traduction complète viendra avec la validation
 * du texte par le fondateur (CLAUDE.md § 4).
 */
export interface AdCopy {
  partnerTitle: string;
  ad: string;
  recommendation: string;
  hide: string;
  hideTitle: string;
  noDataShared: string;
  sessionDone: Record<"exam_end" | "long_chat", string>;
  sessionSub: string;
  adFunds: string;
  closeIn: (s: number) => string;
  close: string;
  goAdFree: string;
  rewardTitle: string;
  rewardIntro: (seconds: number, credits: number) => string;
  rewardLeft: (n: number) => string;
  rewardStart: string;
  rewardLoading: string;
  rewardTestAd: string;
  rewardWatching: (s: number) => string;
  rewardEarlyClose: string;
  rewardDone: (credits: number) => string;
  rewardContinue: string;
  rewardNoFill: string;
  rewardCap: string;
  rewardError: string;
  cancel: string;
  paywallTitle: string;
  paywallBody: string;
  paywallPremium: string;
  paywallPremiumSub: string;
  paywallWatch: (credits: number) => string;
  paywallWatchSub: (seconds: number) => string;
  paywallPacks: string;
  paywallReopen: string;
}

const de: AdCopy = {
  partnerTitle: "Partner-Ressourcen für dein Studium",
  ad: "Anzeige",
  recommendation: "Empfehlung",
  hide: "Ausblenden",
  hideTitle: "30 Tage ausblenden",
  noDataShared: "Keine Weitergabe deiner Daten an Partner.",
  sessionDone: { exam_end: "Klausur abgegeben — stark!", long_chat: "Starke Lernsession!" },
  sessionSub: "Kurze Pause. Dein Ergebnis wartet gleich auf dich.",
  adFunds: "Werbung finanziert deine Gratis-Credits.",
  closeIn: (s) => `Schließen in ${s} s`,
  close: "Schließen",
  goAdFree: "Werbefrei mit Premium",
  rewardTitle: "Credit freischalten",
  rewardIntro: (s, c) => `Schau ein kurzes Video (${s} s) bis zum Ende und erhalte ${c} Credit für deine nächste Frage.`,
  rewardLeft: (n) => `Heute noch ${n}× möglich.`,
  rewardStart: "Video starten",
  rewardLoading: "Video wird geladen …",
  rewardTestAd: "Testanzeige — keine echte Werbung",
  rewardWatching: (s) => `Noch ${s} s`,
  rewardEarlyClose: "Wenn du jetzt schließt, gibt es keinen Credit.",
  rewardDone: (c) => `+${c} Credit gutgeschrieben!`,
  rewardContinue: "Weiterlernen",
  rewardNoFill: "Gerade ist kein Video verfügbar. Versuch es gleich noch einmal.",
  rewardCap: "Für heute hast du alle Videos genutzt. Morgen geht's weiter — oder lerne unbegrenzt mit Premium.",
  rewardError: "Das hat nicht geklappt. Es wurde nichts abgebucht.",
  cancel: "Abbrechen",
  paywallTitle: "Dein Gratis-Kontingent ist aufgebraucht",
  paywallBody: "Du bist mitten im Lernen — so geht es weiter:",
  paywallPremium: "Premium freischalten",
  paywallPremiumSub: "1000 Fragen im Monat, keine Werbung.",
  paywallWatch: (c) => `Video ansehen, ${c} Credit erhalten`,
  paywallWatchSub: (s) => `${s} Sekunden, freiwillig.`,
  paywallPacks: "Oder Credits einzeln kaufen",
  paywallReopen: "Weitere Optionen",
};

const fr: AdCopy = {
  partnerTitle: "Ressources partenaires pour tes études",
  ad: "Publicité",
  recommendation: "Recommandation",
  hide: "Masquer",
  hideTitle: "Masquer 30 jours",
  noDataShared: "Aucune donnée transmise aux partenaires.",
  sessionDone: { exam_end: "Examen rendu — bravo !", long_chat: "Belle session de travail !" },
  sessionSub: "Petite pause. Ton résultat t'attend juste après.",
  adFunds: "La publicité finance tes crédits gratuits.",
  closeIn: (s) => `Fermer dans ${s} s`,
  close: "Fermer",
  goAdFree: "Sans pub avec Premium",
  rewardTitle: "Débloquer un crédit",
  rewardIntro: (s, c) => `Regarde une courte vidéo (${s} s) jusqu'au bout et reçois ${c} crédit pour ta prochaine question.`,
  rewardLeft: (n) => `Encore ${n} fois aujourd'hui.`,
  rewardStart: "Lancer la vidéo",
  rewardLoading: "Chargement de la vidéo …",
  rewardTestAd: "Annonce de test — pas une vraie publicité",
  rewardWatching: (s) => `Encore ${s} s`,
  rewardEarlyClose: "Si tu fermes maintenant, pas de crédit.",
  rewardDone: (c) => `+${c} crédit ajouté !`,
  rewardContinue: "Continuer",
  rewardNoFill: "Aucune vidéo disponible pour l'instant. Réessaie dans un moment.",
  rewardCap: "Tu as utilisé toutes les vidéos du jour. À demain — ou apprends sans limite avec Premium.",
  rewardError: "Ça n'a pas marché. Rien n'a été débité.",
  cancel: "Annuler",
  paywallTitle: "Ton quota gratuit est épuisé",
  paywallBody: "Tu es en plein apprentissage — voici comment continuer :",
  paywallPremium: "Passer à Premium",
  paywallPremiumSub: "1000 questions par mois, sans publicité.",
  paywallWatch: (c) => `Regarder une vidéo, recevoir ${c} crédit`,
  paywallWatchSub: (s) => `${s} secondes, au choix.`,
  paywallPacks: "Ou acheter des crédits à l'unité",
  paywallReopen: "Autres options",
};

const en: AdCopy = {
  partnerTitle: "Partner resources for your studies",
  ad: "Ad",
  recommendation: "Recommendation",
  hide: "Hide",
  hideTitle: "Hide for 30 days",
  noDataShared: "Your data is never shared with partners.",
  sessionDone: { exam_end: "Exam submitted — well done!", long_chat: "Great study session!" },
  sessionSub: "Quick break. Your result is right behind this.",
  adFunds: "Ads fund your free credits.",
  closeIn: (s) => `Close in ${s} s`,
  close: "Close",
  goAdFree: "Go ad-free with Premium",
  rewardTitle: "Unlock a credit",
  rewardIntro: (s, c) => `Watch a short video (${s} s) to the end and get ${c} credit for your next question.`,
  rewardLeft: (n) => `${n} left today.`,
  rewardStart: "Start video",
  rewardLoading: "Loading video …",
  rewardTestAd: "Test ad — not a real advertisement",
  rewardWatching: (s) => `${s} s left`,
  rewardEarlyClose: "If you close now, you won't get the credit.",
  rewardDone: (c) => `+${c} credit added!`,
  rewardContinue: "Keep learning",
  rewardNoFill: "No video available right now. Try again in a moment.",
  rewardCap: "You've used all of today's videos. Back tomorrow — or learn without limits with Premium.",
  rewardError: "That didn't work. Nothing was charged.",
  cancel: "Cancel",
  paywallTitle: "Your free allowance is used up",
  paywallBody: "You're in the middle of studying — here's how to keep going:",
  paywallPremium: "Upgrade to Premium",
  paywallPremiumSub: "1000 questions a month, no ads.",
  paywallWatch: (c) => `Watch a video, get ${c} credit`,
  paywallWatchSub: (s) => `${s} seconds, your choice.`,
  paywallPacks: "Or buy single credits",
  paywallReopen: "More options",
};

export function adCopy(locale: string): AdCopy {
  return locale === "de" ? de : locale === "fr" ? fr : en;
}
