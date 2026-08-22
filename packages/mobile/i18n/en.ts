import type { Translations } from "@/i18n/de";

/**
 * Anglais. Typé `Translations` : une clé manquante ne compile pas.
 *
 * Les termes techniques allemands (Querkraft, Biegemoment, …) restent en
 * allemand dans les réponses de l'IA — c'est le vocabulaire de l'examen que
 * l'étudiant passera. L'interface est traduite, pas la matière.
 */
export const en: Translations = {
  common: {
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    retry: "Try again",
    loading: "Loading …",
    error: "Something went wrong",
    back: "Back",
    continue: "Continue",
    close: "Close",
    confirm: "Confirm",
    search: "Search",
    empty: "Nothing here",
    offline: "No connection to the server",
  },

  auth: {
    signInTitle: "Welcome back",
    signInSubtitle: "Sign in to keep learning.",
    signUpTitle: "Create account",
    signUpSubtitle: "Start free — no card needed.",
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters",
    signIn: "Sign in",
    signUp: "Sign up",
    signOut: "Sign out",
    noAccount: "No account yet?",
    hasAccount: "Already registered?",
    inviteCode: "Invite code",
    inviteRequired: "Sign-up currently requires an invite code.",
    invalidCredentials: "Email or password is incorrect.",
    emailTaken: "That email is already registered.",
    signOutConfirm: "Sign out?",
  },

  tabs: {
    chat: "Learn",
    documents: "Materials",
    exercises: "Exercises",
    profile: "Profile",
  },

  chat: {
    title: "Study assistant",
    placeholder: "Ask me about your lecture notes …",
    send: "Send",
    stop: "Stop",
    newChat: "New chat",
    emptyTitle: "What are we working on?",
    emptyBody:
      "Upload your notes or just ask. I never compute numbers myself — they come from verified tools.",
    thinking: "Thinking …",
    conversations: "Conversations",
    deleteChat: "Delete conversation",
    contextDocument: "Context: {{title}}",
    disclaimer:
      "Study aid — verify results yourself. Not an engineering service.",
  },

  quota: {
    badgeMonthly: "{{count}} left",
    badgeCredits: "{{count}} credits",
    exhaustedTitle: "Quota used up",
    exhaustedFree:
      "Your free monthly quota is used up. It resets on {{date}}.",
    exhaustedPaid: "Your monthly quota is used up. It resets on {{date}}.",
    exhaustedCta: "See Premium",
    buyCreditsCta: "Buy credits",
    lowWarning: "Only {{count}} requests left this month.",
    tokenCapTitle: "Monthly limit reached",
    tokenCapBody:
      "You have reached the monthly output limit. It resets at the start of the month.",
  },

  documents: {
    title: "My materials",
    upload: "Upload",
    uploading: "Uploading …",
    extracting: "Extracting text …",
    emptyTitle: "No materials yet",
    emptyBody:
      "Upload your lecture notes, an exercise sheet or a past exam. The assistant will answer from them.",
    pages: "{{count}} pages",
    kindScript: "Lecture notes",
    kindExercise: "Exercise",
    kindExam: "Past exam",
    kindOther: "Other",
    deleteConfirm: "Delete this document? This cannot be undone.",
    assignSemester: "Assign to semester",
    unsupported: "This file format is not supported.",
    tooLarge: "The file is too large.",
    uploadPick: "Choose file",
    uploadNoText: "No readable text in this file. A photographed page without text recognition will not work.",
    uploadFailed: "Upload failed.",
    uploadDone: "Document added.",
    limitReached: "You have reached the limit of {{limit}} documents.",
  },

  semesters: {
    title: "Semesters",
    create: "Create semester",
    name: "Label",
    namePlaceholder: "e.g. 3rd semester",
    university: "University",
    program: "Programme",
    docCount: "{{count}} materials",
    share: "Share",
    shareInfo: "Share this code with your study group.",
    redeem: "Redeem code",
    deleteConfirm: "Delete semester? Your materials stay.",
  },

  exercises: {
    title: "Saved exercises",
    emptyTitle: "Nothing saved yet",
    emptyBody: "Exercises you save in the chat appear here.",
    points: "{{count}} points",
    difficultyEasy: "Easy",
    difficultyMedium: "Medium",
    difficultyHard: "Hard",
    solution: "Show solution",
    hideSolution: "Hide solution",
  },

  plan: {
    title: "Your plan",
    free: "Free",
    premium: "Premium",
    founder: "Founder",
    monthly: "Monthly",
    semester: "Semester",
    perMonth: "/month",
    save: "Save {{amount}}",
    subscribe: "Subscribe",
    manage: "Manage subscription",
    cancelAnytime: "Cancel anytime",
    validUntil: "Active until {{date}}",
    trial: "{{days}} days free",
    trialUsed: "Trial already used",
    notConfigured: "Payments are not set up yet.",
    usage: "{{used}} of {{limit}}",
    featureUnlimited: "500 AI requests per month",
    featureDocuments: "Up to 200 documents",
    featureExercises: "Generate practice exams",
    featureSupport: "Priority support",
    restore: "Restore purchase",
  },

  credits: {
    title: "Credits",
    balance: "{{count}} credits",
    subtitle:
      "Credits never expire and are only used after your monthly quota.",
    buy: "Buy credits",
    pack: "{{count}} credits",
    pricePer: "{{price}} per request",
    history: "History",
    historyEmpty: "No activity yet",
    typePurchase: "Purchase",
    typeSpend: "Used",
    typeGrant: "Granted",
    typeRefund: "Refund",
    purchaseSuccess: "Credits added.",
    purchasePending: "Payment processing — your credits will appear shortly.",
  },

  account: {
    title: "Profile",
    language: "Language",
    languageDe: "Deutsch",
    languageEn: "English",
    languageFr: "Français",
    notifications: "Notifications",
    notificationsBody: "Get a ping when an exercise is ready.",
    notificationsDenied: "Notifications are disabled in system settings.",
    testNotification: "Send test notification",
    dataExport: "Export my data",
    dataExportBody: "All your data as a JSON file (GDPR Art. 15 and 20).",
    dataExportDone: "Export created.",
    deleteAccount: "Delete account",
    deleteAccountBody:
      "Irreversible. Account, materials, conversations, credits — all removed.",
    deleteAccountConfirmTitle: "Permanently delete account",
    deleteAccountConfirmBody:
      "An active subscription is cancelled first. Type LÖSCHEN to confirm.",
    deleteAccountKeyword: "LÖSCHEN",
    deleteAccountWrongKeyword: "Please type LÖSCHEN exactly.",
    version: "Version {{version}}",
  },

  legal: {
    title: "Legal",
    impressum: "Legal notice",
    privacy: "Privacy",
    terms: "Terms",
    withdrawal: "Right of withdrawal",
    consentStart:
      "I expressly request that you begin the service before the withdrawal period ends.",
    consentLose:
      "I understand that I thereby lose my right of withdrawal (§ 356 (5) BGB).",
    consentRequired: "Please confirm both points to continue.",
  },

  errors: {
    unauthorized: "Please sign in again.",
    network: "No connection. Check your internet.",
    server: "The server is not responding right now.",
    unknown: "Unknown error.",
  },
};
