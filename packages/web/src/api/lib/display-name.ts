/**
 * Le nom affiché d'un étudiant. Fonctions pures, partagées par le serveur et
 * l'interface.
 *
 * Règle : on n'affiche QUE ce qui vient du compte connecté. Dans l'ordre :
 * son nom, sinon la partie de son e-mail avant le « @ », sinon le mot
 * « Student » traduit. Aucun nom n'est jamais écrit en dur.
 */

/** « anna.schmidt@uni.de » → « anna.schmidt ». Vide si ce n'est pas un e-mail. */
export function emailLocalPart(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : "";
}

/**
 * Le nom tel que l'étudiant l'a saisi, ou "" s'il n'en a pas.
 * Une inscription sans nom enregistrait l'e-mail entier dans `user.name` :
 * un « nom » qui contient un « @ » n'en est donc pas un.
 */
export function realName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n || n.includes("@")) return "";
  if (email && n.toLowerCase() === email.trim().toLowerCase()) return "";
  return n;
}

/**
 * Le nom complet saisi à l'inscription est-il acceptable ? Il est obligatoire :
 * au moins deux lettres, et jamais une adresse e-mail. Même règle dans le
 * formulaire (pages/login.tsx) et sur le serveur (auth.ts).
 */
export function isValidSignupName(name: string | null | undefined, email?: string | null): boolean {
  const n = realName(name, email);
  return (n.match(/\p{L}/gu) ?? []).length >= 2;
}

export interface Identity {
  /** Nom complet à afficher (barre latérale). */
  full: string;
  /** Pour « Hallo {name} ». */
  first: string;
  /** Une ou deux lettres pour la pastille. */
  initials: string;
  /** Vrai si l'étudiant n'a pas encore de nom : on peut l'inviter à compléter son profil. */
  needsName: boolean;
}

export interface IdentityInput {
  /** `session.user.name` */
  name?: string | null;
  /** `session.user.email` */
  email?: string | null;
  /** Nom saisi à l'onboarding sur CET appareil, uniquement s'il appartient à ce compte. */
  profileName?: string | null;
  /** « Student », dans la langue de l'interface. */
  fallback: string;
}

function initialsOf(text: string): string {
  const words = text.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

export function resolveIdentity(input: IdentityInput): Identity {
  const name = realName(input.name, input.email) || realName(input.profileName, input.email);
  if (name) {
    return { full: name, first: name.split(" ")[0]!, initials: initialsOf(name), needsName: false };
  }
  const local = emailLocalPart(input.email);
  if (local) return { full: local, first: local, initials: initialsOf(local), needsName: true };
  return { full: input.fallback, first: input.fallback, initials: initialsOf(input.fallback), needsName: true };
}
