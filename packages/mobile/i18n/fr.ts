import type { Translations } from "@/i18n/de";

/**
 * Français. Typé `Translations` : une clé manquante ne compile pas.
 *
 * Note : le mot-clé de suppression de compte reste **LÖSCHEN** dans les trois
 * langues. Il est comparé littéralement côté serveur (`z.literal("LÖSCHEN")`) —
 * le traduire casserait la suppression de compte pour les francophones.
 */
export const fr: Translations = {
  common: {
    cancel: "Annuler",
    save: "Enregistrer",
    delete: "Supprimer",
    retry: "Réessayer",
    loading: "Chargement …",
    error: "Une erreur est survenue",
    back: "Retour",
    continue: "Continuer",
    close: "Fermer",
    confirm: "Confirmer",
    search: "Rechercher",
    empty: "Rien ici",
    offline: "Pas de connexion au serveur",
  },

  auth: {
    signInTitle: "Bon retour",
    signInSubtitle: "Connecte-toi pour continuer à réviser.",
    signUpTitle: "Créer un compte",
    signUpSubtitle: "Commence gratuitement — sans carte bancaire.",
    name: "Nom",
    email: "E-mail",
    password: "Mot de passe",
    passwordHint: "Au moins 8 caractères",
    signIn: "Se connecter",
    signUp: "S'inscrire",
    signOut: "Se déconnecter",
    noAccount: "Pas encore de compte ?",
    hasAccount: "Déjà inscrit ?",
    inviteCode: "Code d'invitation",
    inviteRequired: "L'inscription nécessite pour l'instant un code d'invitation.",
    invalidCredentials: "E-mail ou mot de passe incorrect.",
    emailTaken: "Cette adresse est déjà utilisée.",
    signOutConfirm: "Se déconnecter ?",
    forgot: "Mot de passe oublié ?",
    forgotSent:
      "Si un compte existe pour cette adresse, le courriel est parti.",
    errorGeneric: "Cela n'a pas fonctionné. Réessaie.",
    inviteInvalid: "Ce code d'invitation n'est pas valide.",
  },

  tabs: {
    chat: "Réviser",
    documents: "Supports",
    exercises: "Exercices",
    profile: "Profil",
  },

  chat: {
    title: "Assistant de révision",
    placeholder: "Pose-moi une question sur ton cours …",
    send: "Envoyer",
    stop: "Arrêter",
    newChat: "Nouvelle conversation",
    emptyTitle: "On travaille sur quoi ?",
    emptyBody:
      "Téléverse un cours ou pose directement ta question. Je ne calcule jamais moi-même — les nombres viennent d'outils vérifiés.",
    thinking: "Réflexion …",
    conversations: "Conversations",
    deleteChat: "Supprimer la conversation",
    contextDocument: "Contexte : {{title}}",
    disclaimer:
      "Aide à l'apprentissage — vérifie les résultats toi-même. Ce n'est pas une prestation d'ingénierie.",
  },

  quota: {
    badgeMonthly: "{{count}} restantes",
    badgeCredits: "{{count}} crédits",
    exhaustedTitle: "Quota épuisé",
    exhaustedFree:
      "Ton quota mensuel gratuit est épuisé. Il se réinitialise le {{date}}.",
    exhaustedPaid:
      "Ton quota mensuel est épuisé. Il se réinitialise le {{date}}.",
    exhaustedCta: "Voir Premium",
    buyCreditsCta: "Acheter des crédits",
    lowWarning: "Plus que {{count}} demandes ce mois-ci.",
    tokenCapTitle: "Limite mensuelle atteinte",
    tokenCapBody:
      "Tu as atteint la limite mensuelle de génération. Elle se réinitialise au début du mois.",
  },

  documents: {
    title: "Mes supports",
    upload: "Téléverser",
    uploading: "Envoi en cours …",
    extracting: "Extraction du texte …",
    emptyTitle: "Aucun support",
    emptyBody:
      "Téléverse ton polycopié, une feuille d'exercices ou un ancien examen. L'assistant répondra à partir de là.",
    pages: "{{count}} pages",
    kindScript: "Polycopié",
    kindExercise: "Exercice",
    kindExam: "Ancien examen",
    kindOther: "Autre",
    deleteConfirm: "Supprimer ce support ? C'est irréversible.",
    assignSemester: "Rattacher à un semestre",
    unsupported: "Ce format de fichier n'est pas pris en charge.",
    tooLarge: "Le fichier est trop volumineux.",
    uploadPick: "Choisir un fichier",
    uploadNoText: "Aucun texte lisible dans ce fichier. Une page photographiée sans reconnaissance de texte ne fonctionne pas.",
    uploadFailed: "L'envoi a échoué.",
    uploadDone: "Support ajouté.",
    limitReached: "Tu as atteint la limite de {{limit}} supports.",
  },

  semesters: {
    title: "Semestres",
    create: "Créer un semestre",
    name: "Intitulé",
    namePlaceholder: "ex. 3e semestre",
    university: "Établissement",
    program: "Filière",
    docCount: "{{count}} supports",
    share: "Partager",
    shareInfo: "Partage ce code avec ton groupe de révision.",
    redeem: "Utiliser un code",
    deleteConfirm: "Supprimer le semestre ? Les supports sont conservés.",
  },

  exercises: {
    title: "Exercices enregistrés",
    emptyTitle: "Rien d'enregistré",
    emptyBody: "Les exercices que tu enregistres dans le chat apparaissent ici.",
    points: "{{count}} points",
    difficultyEasy: "Facile",
    difficultyMedium: "Moyen",
    difficultyHard: "Difficile",
    solution: "Afficher la correction",
    hideSolution: "Masquer la correction",
  },

  plan: {
    title: "Ton offre",
    free: "Gratuit",
    premium: "Premium",
    founder: "Fondateur",
    monthly: "Mensuel",
    semester: "Semestriel",
    perMonth: "/mois",
    save: "Économise {{amount}}",
    subscribe: "S'abonner",
    manage: "Gérer l'abonnement",
    cancelAnytime: "Résiliable à tout moment",
    validUntil: "Actif jusqu'au {{date}}",
    trial: "{{days}} jours d'essai gratuit",
    trialUsed: "Essai déjà utilisé",
    notConfigured: "Les paiements ne sont pas encore configurés.",
    usage: "{{used}} sur {{limit}}",
    featureUnlimited: "500 requêtes IA par mois",
    featureDocuments: "Jusqu'à 200 supports",
    featureExercises: "Génération d'examens blancs",
    featureSupport: "Support prioritaire",
    restore: "Restaurer l'achat",
  },

  credits: {
    title: "Crédits",
    balance: "{{count}} crédits",
    subtitle:
      "Les crédits n'expirent pas et ne sont consommés qu'après ton quota mensuel.",
    buy: "Acheter des crédits",
    pack: "{{count}} crédits",
    pricePer: "{{price}} par requête",
    history: "Historique",
    historyEmpty: "Aucun mouvement",
    typePurchase: "Achat",
    typeSpend: "Consommé",
    typeGrant: "Crédité",
    typeRefund: "Remboursement",
    purchaseSuccess: "Crédits ajoutés.",
    purchasePending:
      "Paiement en cours de traitement — tes crédits arrivent dans un instant.",
  },

  account: {
    title: "Profil",
    language: "Langue",
    languageDe: "Deutsch",
    languageEn: "English",
    languageFr: "Français",
    notifications: "Notifications",
    notificationsBody: "Être prévenu quand un exercice est prêt.",
    notificationsDenied:
      "Les notifications sont désactivées dans les réglages du système.",
    testNotification: "Envoyer une notification de test",
    dataExport: "Exporter mes données",
    dataExportBody: "Toutes tes données en JSON (art. 15 et 20 RGPD).",
    dataExportDone: "Export créé.",
    deleteAccount: "Supprimer le compte",
    deleteAccountBody:
      "Irréversible. Compte, supports, conversations, crédits — tout est effacé.",
    deleteAccountConfirmTitle: "Supprimer définitivement le compte",
    deleteAccountConfirmBody:
      "Un abonnement en cours est d'abord résilié. Tape LÖSCHEN pour confirmer.",
    deleteAccountKeyword: "LÖSCHEN",
    deleteAccountWrongKeyword: "Tape exactement LÖSCHEN.",
    theme: "Apparence",
    themeSystem: "Comme le système",
    themeLight: "Clair",
    themeDark: "Sombre",
    dataTitle: "Tes données",
    version: "Version {{version}}",
  },

  report: {
    action: "Signaler",
    title: "Signaler cette réponse",
    body:
      "Dis-nous ce qui n'allait pas. La réponse et ton commentaire nous " +
      "parviennent — pas aux autres étudiants.",
    reason_harmful: "Dangereux ou risqué",
    reason_wrong: "Faux sur le fond",
    reason_offensive: "Offensant ou déplacé",
    reason_other: "Autre chose",
    notePlaceholder: "Qu'est-ce qui n'allait pas ? (facultatif)",
    send: "Signaler",
    thanksTitle: "Merci",
    thanksBody:
      "Le signalement est enregistré. Nous le regardons — tu n'auras pas de " +
      "réponse, mais chaque signalement est lu.",
  },
  legal: {
    title: "Mentions légales",
    impressum: "Mentions légales",
    privacy: "Confidentialité",
    terms: "CGV",
    withdrawal: "Droit de rétractation",
    consentStart:
      "Je demande expressément que la prestation commence avant la fin du délai de rétractation.",
    consentLose:
      "Je sais que je perds ainsi mon droit de rétractation (§ 356 al. 5 BGB).",
    consentRequired: "Confirme les deux points pour continuer.",
  },

  errors: {
    unauthorized: "Reconnecte-toi.",
    network: "Pas de connexion. Vérifie ton accès Internet.",
    server: "Le serveur ne répond pas actuellement.",
    unknown: "Erreur inconnue.",
  },
};
