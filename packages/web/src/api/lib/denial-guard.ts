/**
 * Le garde-fou : le tuteur a-t-il nié les documents de l'étudiant ?
 *
 * ── Pourquoi un test sur le prompt ne suffit pas ──────────────────────────
 *
 * `tests/tutor-prompt.test.ts` verrouille ce que le prompt DIT. Il ne peut
 * rien dire de ce que le modèle en FERA. Le 3 septembre, la panne venait du
 * contrat — le prompt affirmait « rien téléversé » — et le test l'attrape.
 * Mais un modèle peut aussi désobéir à une instruction correcte, et aucun test
 * hors ligne ne le verra.
 *
 * Ce module lit la réponse produite. Il ne la corrige pas : réécrire un texte
 * déjà envoyé à l'écran est pire que le laisser passer. Il la SIGNALE, ce qui
 * transforme une panne invisible en ligne dans l'écran d'administration.
 *
 * ── La distinction qui décide de tout ─────────────────────────────────────
 *
 * « Cette information ne figure pas dans tes documents » est une réponse
 * PARFAITEMENT LÉGITIME, et le prompt la demande explicitement. Le garde ne
 * doit surtout pas la signaler.
 *
 * Ce qui est fautif, c'est de nier l'ACCÈS ou l'EXISTENCE : « je ne vois aucun
 * fichier », « je n'ai pas accès aux conversations précédentes », « tu n'as
 * rien téléversé ». La différence n'est pas de degré, elle est de nature :
 * l'une parle du contenu, l'autre contredit ce que l'étudiant a sous les yeux.
 */

/**
 * Les tournures fautives, dans les trois langues que le tuteur produit.
 *
 * Chaque motif est délibérément étroit. Un garde trop large signalerait des
 * réponses correctes, on cesserait de le lire, et il ne servirait plus à rien
 * — la fin habituelle des alertes automatiques.
 */
const DENIS: { pattern: RegExp; label: string }[] = [
  // ── Allemand ────────────────────────────────────────────────────────
  {
    pattern: /kein(?:e|en)?\s+(?:Zugriff|Zugang)\s+auf\s+(?:deine|die|vorherige|frühere)/i,
    label: "nie l'accès (de)",
  },
  {
    // « keine Dateien AUS FRÜHEREN GESPRÄCHEN sehen » : il y a du texte
    // entre les deux, et la première version de ce motif l'a manqué.
    pattern: /keine\s+(?:Dateien|Dokumente|Unterlagen)[^.!?]{0,45}sehen/i,
    label: "dit ne voir aucun fichier (de)",
  },
  {
    pattern: /(?:starte|beginne|fange)\s+(?:für\s+mich\s+)?(?:wieder\s+)?bei\s+null/i,
    label: "dit repartir de zéro (de)",
  },
  {
    pattern: /(?:hast|haben)\s+(?:du\s+)?(?:noch\s+)?keine\s+(?:Unterlagen|Dokumente|Dateien)\s+hochgeladen/i,
    label: "affirme que rien n'a été téléversé (de)",
  },
  {
    pattern: /keinen\s+Zugriff\s+auf\s+(?:vorherige|frühere)\s+(?:Sitzungen|Gespräche|Unterhaltungen)/i,
    label: "nie l'accès aux conversations précédentes (de)",
  },

  // ── Français ────────────────────────────────────────────────────────
  {
    pattern: /je\s+n'?ai\s+pas\s+(?:accès|acces)\s+(?:à|a)\s+(?:tes|les|vos)\s+(?:fichiers|documents)/i,
    label: "nie l'accès (fr)",
  },
  {
    pattern: /je\s+ne\s+(?:vois|peux\s+voir)\s+aucun\s+(?:fichier|document)/i,
    label: "dit ne voir aucun fichier (fr)",
  },
  {
    pattern: /(?:je\s+)?(?:repars|recommence|démarre)\s+(?:de|à)\s+zéro/i,
    label: "dit repartir de zéro (fr)",
  },
  {
    pattern: /conversations?\s+précédentes?[^.]{0,40}(?:pas\s+accès|ne\s+vois|invisible)/i,
    label: "nie les conversations précédentes (fr)",
  },

  // ── Anglais ─────────────────────────────────────────────────────────
  {
    pattern: /(?:I\s+)?(?:don'?t|do\s+not|cannot|can'?t)\s+have\s+access\s+to\s+(?:your|the|previous)\s+(?:files|documents|uploads)/i,
    label: "nie l'accès (en)",
  },
  {
    pattern: /(?:I\s+)?(?:cannot|can'?t)\s+see\s+any\s+(?:files|documents|uploads)/i,
    label: "dit ne voir aucun fichier (en)",
  },
  {
    pattern: /start(?:s|ing)?\s+(?:over\s+)?from\s+scratch/i,
    label: "dit repartir de zéro (en)",
  },
  {
    pattern: /(?:no|without)\s+access\s+to\s+(?:previous|earlier|past)\s+(?:sessions|conversations|chats)/i,
    label: "nie l'accès aux sessions précédentes (en)",
  },
];

/**
 * La réponse nie-t-elle les documents ?
 *
 * `documentCount` est le nombre de documents RÉELLEMENT passés au modèle.
 * À zéro, il n'y a rien à nier : la même phrase devient vraie, et le garde se
 * tait. C'est ce paramètre qui empêche le garde d'être un simple filtre de
 * mots.
 */
export function detectDocumentDenial(
  answer: string,
  documentCount: number,
): { label: string; excerpt: string } | null {
  if (documentCount <= 0) return null;
  if (!answer) return null;

  // On cherche la faute la plus TÔT dans le texte, pas le premier motif de la
  // liste. Une réponse peut en contenir deux ; c'est celle qu'on lit d'abord
  // qui a fait basculer la confiance, et c'est elle qu'il faut montrer.
  let meilleur: { label: string; index: number; longueur: number } | null = null;

  for (const { pattern, label } of DENIS) {
    const m = pattern.exec(answer);
    if (!m) continue;
    if (meilleur === null || m.index < meilleur.index) {
      meilleur = { label, index: m.index, longueur: m[0].length };
    }
  }

  if (meilleur === null) return null;

  // On garde le voisinage, pas la réponse entière : c'est la phrase qui permet
  // de juger, et une réponse complète noierait la liste.
  const debut = Math.max(0, meilleur.index - 60);
  const fin = Math.min(answer.length, meilleur.index + meilleur.longueur + 60);
  return { label: meilleur.label, excerpt: answer.slice(debut, fin).trim() };
}
