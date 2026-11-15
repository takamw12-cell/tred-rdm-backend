import { useEffect, useMemo, useRef, useState } from "react";
import { useUserStore } from "@/stores/user";
import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Box,
  Sparkles,
  X,
  Library,
  FileText,
  HelpCircle,
  RefreshCw,
  Cog,
  Plus,
  MessageSquare,
  Trash2,
  History,
  RotateCcw,
  ArrowLeft,
  CheckSquare,
  Square,
  ListChecks,
  GalleryVerticalEnd,
  Paperclip,
  Calculator,
  MessageCircleQuestion,
  Target,
  NotebookPen,
  Camera,
  FolderOpen,
  Image as ImageIcon,
  File as FileIcon,
  Clapperboard,
  Youtube,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ListenButton, SourceViewContext } from "@/components/ai-answer";
import { BoardChip, BoardScope, TafelBoard, type TafelPage } from "@/components/tafel-board";
import { chosenKey, moveFencedToPageTop, pageSplit, tafelPage } from "@/lib/tafel";
import { ReportAnswer } from "@/components/report-answer";
import { CodeExplainContext, CodeSendContext } from "@/components/code-block";
import { DocumentViewer } from "@/components/document-viewer";
import { CitationContext } from "@/lib/citations";
import { BEAM_LANG, beamBlockFromPart } from "@/components/beam-diagram";
import { solverChartBlockFromPart } from "@/lib/solver-charts";
import { chatPhase, PHASE_KEY } from "@/lib/chat-phase";
import { MEDIA_LANG, mediaBlockFromPart } from "@/lib/media-block";
import { CameraCapture } from "@/components/camera-capture";
import { Scratchpad } from "@/components/scratchpad";
import { downscaleImageToDataUrl, downscaleDataUrl, isUsableDataUrl } from "@/lib/image";
import { readChatFailure } from "@/lib/chat-error";
import { countPdfPages } from "@/lib/pdf-pages";
import { explorerModelFor, type ExplorerModelId } from "@/lib/explorer-models";
import { patienceKey } from "@/lib/patience";
import { MAX_ATTACHED_PDF_PAGES, pdfPagesExceeded, pruneHistoryFiles } from "../../api/lib/chat-attachments";
import { QuotaBanner } from "@/components/quota-banner";
import { useAdStore } from "@/stores/ads";
import { SmartPaywallModal } from "@/components/SmartPaywallModal";
import { useAdCopy } from "@/lib/use-ads";
import { INTERSTITIAL_RULES } from "@/lib/ad-mediation";
import { creditsMeKey } from "@/queries/credits";
import { useFeatures } from "@/queries/features";
import { Link, useLocation, useSearch } from "wouter";
import { conversationsOfScope, docFromSearch, mayApplyResume, searchWithDoc } from "@/lib/chat-sessions";
import { Repeat2, Volume2, VolumeX } from "lucide-react";
import { useProfessorChoreography } from "@/components/hologram-professor";
import { spokenAnswer } from "@/lib/professor-choreography";
import { VideoExplainer, type VideoScript } from "@/components/video-explainer";
import { ExplainerVideoDialog } from "@/components/explainer-video";
import { runExplainerVideo, type ExplainerState } from "@/lib/explainer-video";
import { UnderstandingQuiz } from "@/components/understanding-quiz";
import { useGenerateFlashcards } from "@/lib/flashcards-api";
import {
  VideoSearch,
  type YoutubeHit,
  type VideoSearchError,
} from "@/components/video-search";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { usePreferencesStore } from "@/stores/preferences";
import { DocumentLibrary } from "@/components/document-library";
import { parseSocratic, stripSocratic } from "@/lib/socratic";
import { Button } from "@/components/ui/button";
import { FloatingProfessor, HoersaalStage } from "@/components/hoersaal-stage";
import { professorText, professorUi, useProfessor } from "@/lib/professors";
import { client } from "@/lib/api";
import { useSemesterStore } from "@/stores/semester";
import { useReconciledSemester } from "@/hooks/use-reconciled-semester";
import { semestersListOptions } from "@/queries/semesters";
import { documentsListOptions } from "@/queries/documents";
import { subjectsListOptions } from "@/queries/subjects";
import {
  chatsListOptions,
  chatsListKey,
  chatSaveOptions,
  chatRemoveOptions,
  chatsTrashListOptions,
  chatsTrashListKey,
  chatRestoreOptions,
  chatPurgeOptions,
  chatEmptyTrashOptions,
  chatRemoveManyOptions,
  chatRestoreManyOptions,
  chatPurgeManyOptions,
} from "@/queries/chats";
import { startHoersaalTimer } from "@/lib/analytics";
import { useT } from "@/i18n";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";

/** Outils de calcul : leur présence met le tampon « Berechnet mit dem Löser » sur la Tafel. */
const SOLVER_TOOLS = new Set([
  "tool-rechnen",
  "tool-balkenstatik",
  "tool-schaltung_berechnen",
  "tool-thermo_berechnen",
  "tool-physik_berechnen",
  "tool-solve_cyber",
  "tool-solve_ai",
  "tool-solve_open_math",
  "tool-mathe_berechnen",
  "tool-elektro_berechnen",
  "tool-werkstoff_berechnen",
  "tool-chemie_berechnen",
  "tool-wirtschaft_berechnen",
  "tool-schule_berechnen",
]);

// Pull rendered text out of a UI message's parts.
//
// Le résultat de l'outil `balkenstatik` devient un bloc ```balkendiagramm à
// l'endroit exact de l'appel. Écrit par le code, pas par le modèle : c'est ce
// qui garantit que le schéma est celui du calcul. Et comme tout passe par ce
// texte, la sauvegarde et la traduction le conservent sans autre changement.
function rawMessageText(m: UIMessage): string {
  // Un même graphique de solveur n'est montré qu'une fois : si le modèle
  // rappelle l'outil malgré un résultat déjà calculé (fast-path), le second
  // bloc, identique, disparaît.
  const seenCharts = new Set<string>();
  return m.parts
    .map((p) => {
      if (p.type === "text") return p.text;
      const beam = beamBlockFromPart(p);
      if (beam) return beam;
      const chart = solverChartBlockFromPart(p);
      if (chart) {
        if (seenCharts.has(chart)) return "";
        seenCharts.add(chart);
        return chart;
      }
      return mediaBlockFromPart(p) ?? "";
    })
    .join("");
}

/**
 * Le texte affiché, sauvegardé et réutilisé : sans le compteur du mode
 * socratique ([[SOKRATES …]], lib/socratic.ts), que l'interface lit à part.
 */
function messageText(m: UIMessage): string {
  return stripSocratic(rawMessageText(m));
}

// Une réponse peut passer de longues secondes en raisonnement ou en appels
// d'outils sans un seul caractère de texte. `messageText()` ne les montre pas
// (et ne doit pas : ce texte est sauvegardé et traduit) : l'indicateur nomme
// l'étape en cours (lib/chat-phase.ts) pour que l'écran ne reste jamais muet.

// Le tuteur est-il en train d'ÉCRIRE du texte visible en ce moment ?
// Faux pendant un raisonnement ou un appel d'outil — y compris APRÈS une
// première phrase déjà affichée (« Voici l'animation 👇 » puis recherche).
function isStreamingText(m: UIMessage): boolean {
  const parts = m.parts.filter((p) => p.type !== "step-start");
  const last = parts[parts.length - 1] as { type: string; state?: string } | undefined;
  return last?.type === "text" && last.state !== "done";
}

function pickStudyProfile(p: { degree: string; university: string; semester: string; studyLevel?: string }) {
  return { degree: p.degree, university: p.university, semester: p.semester, level: p.studyLevel || undefined };
}

/** Une conversation et sa portée — voir « La session » dans ChatPage. */
interface ChatSession {
  /** Identifiant de la conversation, choisi par le navigateur (les enregistrements sont idempotents). */
  id: string;
  /** Le document de la conversation ; `null` = pas de document. */
  doc: { id: string; title: string } | null;
  /**
   * Le Fach (module) choisi en haut : sans document, c'est lui qui fait la
   * portée ; `null` = « Ganzes Semester ». Avec un document, il dit seulement
   * quelle liste le panneau « Meine Kurse » montre.
   */
  subjectId: string | null;
  /** Le semestre dans lequel la session a été ouverte. */
  semesterId: string | null;
  /** Les messages d'une conversation rouverte ; vide pour un tableau neuf. */
  initial: UIMessage[];
}

/** Comment l'adresse suit un changement de portée : nouvelle entrée d'historique, remplacement, ou rien. */
type UrlMode = "push" | "replace" | "none";

export default function ChatPage() {
  /**
   * ── La langue de cette page ─────────────────────────────────────────────
   *
   * Il y avait ici un dictionnaire de traduction écrit à la main, cent
   * trente-cinq lignes, deux langues : l'allemand et l'anglais. Il portait le
   * commentaire « LOCALISATION SÉCURISÉE (Remplacement du useT() externe) ».
   *
   * C'est lui, et lui seul, qui expliquait « les langues ne fonctionnent pas
   * dans le chat ». Les douze paquets de traduction de l'application ne
   * touchaient pas cette page : elle ne les lisait pas. Choisir l'italien
   * donnait de l'anglais, parce que la dernière ligne retombait sur `en`.
   *
   * Les soixante-dix clés qu'il appelait existent toutes dans les fichiers de
   * langue. Il n'y avait rien à écrire : seulement à brancher.
   *
   * Second effet, moins visible et plus grave : la langue était lue une fois
   * dans `localStorage` au rendu. Elle ne changeait donc jamais sans
   * rechargement, et l'effet de retraduction de la conversation — plus bas,
   * `useEffect` sur `[locale]` — ne se déclenchait jamais. Le store, lui,
   * prévient ses abonnés.
   */
  const { t, locale } = useT();
  const features = useFeatures();
  // Le professeur choisi dans le vestiaire : son visage, son nom, son ton.
  const professor = useProfessor();

  const [input, setInput] = useState("");
  const [libOpen, setLibOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Tiroir d'historique : les conversations du document ouvert, ou toutes.
  const [historyAll, setHistoryAll] = useState(false);

  // ── Mode Calcul (MATLAB / Python) ─────────────────────────────────────
  const [calcMode, setCalcMode] = useState(false);
  const codeLang = usePreferencesStore((s) => s.codeLang);

  // ── Mode socratique : des questions et des indices, pas la solution ───
  // Le choix est retenu sur cet appareil. Le tuteur compte les essais et
  // l'écrit en fin de réponse ; l'interface le lit (lib/socratic.ts).
  const [socratic, setSocratic] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("tred.socratic.v1") === "on";
  });
  useEffect(() => {
    window.localStorage.setItem("tred.socratic.v1", socratic ? "on" : "off");
  }, [socratic]);

  // ── Scratchpad / brouillon panel ──────────────────────────────────────
  const [scratchOpen, setScratchOpen] = useState(false);

  // ── Attachments (photos, scans, PDFs or text of coursework) ───────────
  type Attachment = {
    id: string;
    name: string;
    url: string; // data URL
    mediaType: string;
    /** Pages d'un PDF, comptées à l'ajout (lib/pdf-pages.ts). Absent : image, texte, PDF illisible ici. */
    pages?: number;
    kind: "image" | "doc"; // image → thumbnail + vision; doc → file chip
    text?: string; // extracted plain text for .txt files
  };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Three separate inputs so the "📎" menu can target files, gallery or camera.
  const filesInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file
  const ACCEPTED_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
  ];
  function isAccepted(f: File): boolean {
    if (ACCEPTED_TYPES.includes(f.type)) return true;
    // Some browsers report an empty type for .txt — fall back to the extension.
    return /\.(pdf|png|jpe?g|webp|txt)$/i.test(f.name);
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function fileToText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // Validate against type + size, then read each accepted file into an
  // attachment. `imagesOnly` restricts to images (used by the gallery option).
  async function addFiles(files: FileList | null, imagesOnly = false) {
    if (!files || files.length === 0) return;
    setAttachError(null);
    const accepted: File[] = [];
    // Un PDF joint part au modèle page par page (texte + image) : une centaine
    // de pages, c'était 230 000 tokens et 36 s avant le premier mot (15 nov.
    // 2026). La limite vaut pour TOUS les PDF de la question ; un Skript entier
    // va dans « Meine Kurse ». Compté ici, avant l'envoi : le fichier ne quitte
    // pas le téléphone pour être refusé à l'arrivée.
    const pagesOf = new Map<File, number>();
    let pdfPages = attachments.reduce((n, a) => n + (a.pages ?? 0), 0);
    for (const f of Array.from(files)) {
      const isImage = f.type.startsWith("image/");
      if (imagesOnly && !isImage) continue;
      if (!isAccepted(f)) {
        setAttachError(t("chat.fileType", { name: f.name }));
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setAttachError(t("chat.fileTooLarge", { name: f.name }));
        continue;
      }
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        // `null` : PDF illisible ici (protégé, abîmé) — il passe comme avant, le serveur recompte.
        const pages = await countPdfPages(f);
        if (pages !== null && pdfPagesExceeded(pdfPages + pages)) {
          setAttachError(t("chat.pdfTooLong", { name: f.name, pages: pdfPages + pages, max: MAX_ATTACHED_PDF_PAGES }));
          continue;
        }
        if (pages !== null) {
          pdfPages += pages;
          pagesOf.set(f, pages);
        }
      }
      accepted.push(f);
    }
    const built = await Promise.all(
      accepted.map(async (f): Promise<Attachment | null> => {
        const isImage = f.type.startsWith("image/");
        const isText = f.type === "text/plain" || /\.txt$/i.test(f.name);
        const url = isImage
          ? await downscaleImageToDataUrl(f)
          : await fileToDataUrl(f);
        // An image the browser could not encode would be rejected by the model
        // ("Input should be a valid string") and break the whole request.
        if (isImage && !isUsableDataUrl(url)) {
          setAttachError(t("chat.imageFailed", { name: f.name }));
          return null;
        }
        return {
          id: crypto.randomUUID(),
          name: f.name,
          url: url as string,
          // Downscaled photos are re-encoded as JPEG.
          mediaType: isImage
            ? "image/jpeg"
            : f.type || (isText ? "text/plain" : "application/octet-stream"),
          kind: isImage ? "image" : "doc",
          text: isText ? await fileToText(f) : undefined,
          pages: pagesOf.get(f),
        };
      }),
    );
    const next = built.filter((a): a is Attachment => a !== null);
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }

  // A confirmed camera photo arrives as a JPEG data URL.
  async function addCameraPhoto(dataUrl: string, name: string) {
    const url = await downscaleDataUrl(dataUrl);
    if (!isUsableDataUrl(url)) {
      setAttachError(t("chat.imageFailed", { name }));
      return;
    }
    setAttachments((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name, url, mediaType: "image/jpeg", kind: "image" },
    ]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  const semesterId = useReconciledSemester();
  const setActiveSemester = useSemesterStore((s) => s.setActive);
  const semsQuery = useQuery(semestersListOptions());
  const sems = semsQuery.data ?? [];
  const activeSem = sems.find((s) => s.id === semesterId) ?? null;

  // ── La session : UNE conversation, liée à UN document ────────────────
  // (ou à « Alle Materialien » : `doc` nul). Le document APPARTIENT à la
  // session ; il ne peut donc pas en diverger : une question part toujours
  // avec les extraits du document de SA conversation. Changer de document,
  // c'est changer de session — et `useChat`, qui reçoit l'identifiant de la
  // session, coupe alors le flux en cours (voir plus bas).
  //
  // Avant le 15 nov. 2026, le document était un état à part : changer de
  // document pendant qu'une réponse s'écrivait vidait le tableau sans arrêter
  // le flux. La réponse du document A finissait sous le document B, puis dans
  // l'historique de B.
  const [session, setSession] = useState<ChatSession>(() => ({
    id: crypto.randomUUID(),
    doc: null,
    subjectId: null,
    semesterId: semesterId ?? null,
    initial: [],
  }));
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** Le document de la session ouverte (null = toute la portée : semestre ou tous les cours). */
  const activeDoc = session.doc;

  // Documents in the current scope — used to resolve a chat citation's document
  // by title when the chat isn't pinned to a single document.
  const { data: scopeDocs = [] } = useQuery(documentsListOptions(semesterId));
  // Lu hors rendu (ouverture d'une conversation) : le module de chaque document.
  const scopeDocsRef = useRef(scopeDocs);
  scopeDocsRef.current = scopeDocs;

  /**
   * Le Fach (module) sur lequel le tuteur travaille — celui de la SESSION.
   *
   * Changer de module, c'est changer de session : le tableau repart du
   * message d'accueil (ou de la dernière conversation de ce module), et le
   * panneau « Meine Kurse » ne liste plus que ses documents. Avant le 15 nov.
   * 2026 c'était un état à part : la conversation restait au tableau et le
   * panneau montrait les documents de tout le semestre.
   *
   * Remis à zéro quand le semestre change (voir l'effet sur `semesterId`) :
   * garder l'identifiant d'un Fach d'un autre semestre ferait répondre le
   * serveur « subject not found » sur une question parfaitement normale.
   */
  const chatSubject = session.subjectId;
  const { data: subjectData } = useQuery(subjectsListOptions(semesterId));
  const chatSubjects = subjectData?.subjects ?? [];
  // Temps passé dans le Hörsaal (analyse, seulement avec consentement).
  useEffect(() => startHoersaalTimer(), []);

  // Source viewer: opened from an [[OFFICIAL]] citation to show the exact
  // passage the tutor quoted, highlighted in the course document.
  const [sourceView, setSourceView] = useState<
    { docId: string; highlight: string; page: number | null } | null
  >(null);

  // Chemin de secours (citation pas encore vérifiée par le serveur) : le
  // document est retrouvé par son titre. Aucun titre ne ressemble → RIEN ne
  // s'ouvre. Avant le 14 nov. 2026, on ouvrait alors le premier document de la
  // liste : une citation de la Thermodynamik pouvait montrer la Mechanik.
  const showSource = useMemo(
    () =>
      ({ excerpt, docTitle, page }: { excerpt: string; docTitle?: string | null; page?: number | null }) => {
        let id = activeDoc?.id ?? null;
        if (!id && docTitle) {
          const q = docTitle.toLowerCase();
          const found =
            scopeDocs.find((d) => d.title === docTitle) ??
            scopeDocs.find(
              (d) =>
                d.title.toLowerCase().includes(q) ||
                q.includes(d.title.toLowerCase()),
            );
          id = found?.id ?? null;
        }
        if (id) setSourceView({ docId: id, highlight: excerpt, page: page ?? null });
      },
    [activeDoc?.id, scopeDocs],
  );

  // Citations vérifiées (lib/citations.ts) : la portée est celle de la
  // question, et un badge ouvre le document et la page que le serveur a
  // confirmés.
  const citationContext = useMemo(
    () => ({
      scope: {
        documentId: activeDoc?.id ?? null,
        subjectId: activeDoc?.id ? null : chatSubject,
        semesterId: activeDoc?.id || chatSubject ? null : semesterId,
      },
      open: ({ documentId, page, excerpt }: { documentId: string; page: number | null; excerpt: string }) =>
        setSourceView({ docId: documentId, highlight: excerpt, page }),
    }),
    [activeDoc?.id, chatSubject, semesterId],
  );

  // ── Persistent conversation history ──────────────────────────────────
  const qc = useQueryClient();
  const convQuery = useQuery(chatsListOptions());
  const convList = convQuery.data ?? [];
  // Lue par les changements de portée, y compris ceux déclenchés hors rendu.
  const convListRef = useRef(convList);
  convListRef.current = convList;
  const saveMut = useMutation(chatSaveOptions());
  const removeMut = useMutation(chatRemoveOptions());

  // ── Trash (soft-deleted conversations) ────────────────────────────────
  const [showTrash, setShowTrash] = useState(false);
  const trashQuery = useQuery({
    ...chatsTrashListOptions(),
    enabled: showTrash,
  });
  const trashList = trashQuery.data ?? [];
  const restoreMut = useMutation(chatRestoreOptions());
  const purgeMut = useMutation(chatPurgeOptions());
  const emptyTrashMut = useMutation(chatEmptyTrashOptions());

  // ── Multi-select mode (bulk delete / restore) ─────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const removeManyMut = useMutation(chatRemoveManyOptions());
  const restoreManyMut = useMutation(chatRestoreManyOptions());
  const purgeManyMut = useMutation(chatPurgeManyOptions());

  function exitSelect() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) =>
      prev.size === ids.length ? new Set() : new Set(ids),
    );
  }

  // The client owns the conversation id so saves are idempotent upserts.
  const convId = session.id;
  // Lu par le transport au moment de l'envoi (comme les autres portées).
  const convIdRef = useRef(convId);
  convIdRef.current = convId;
  const bootRef = useRef(false);
  const savedSigRef = useRef("");
  // Chaque changement de portée prend un numéro : une session qui arrive du
  // serveur après un AUTRE clic est ignorée (lib/chat-sessions.ts › mayApplyResume).
  const scopeTokenRef = useRef(0);
  // La session du document est en train d'arriver : pas d'invitation « tableau prêt » entre-temps.
  const [scopeLoading, setScopeLoading] = useState(false);
  // L'adresse et le semestre que CETTE page a posés elle-même. Un écart avec
  // ce qui est affiché vient d'ailleurs (retour du navigateur, autre onglet) :
  // c'est alors la portée qui suit. Comparer à une valeur attendue, et non à
  // l'état de la session, ne dépend pas de l'ordre dans lequel React rend.
  const search = useSearch();
  const [, navigate] = useLocation();
  const urlDocId = docFromSearch(search);
  const expectedUrlDocRef = useRef(urlDocId);
  const expectedSemRef = useRef<string | null>(semesterId ?? null);

  // ── Live translation of the displayed exchange ───────────────────────
  // Messages are stored/generated in their native language; when the user
  // flips the language toggle we translate the visible conversation on the
  // fly (formulas, diagrams and German Fachbegriffe are preserved server-side)
  // without altering what's persisted.
  const sourceRef = useRef<Record<string, string>>({}); // native text per message
  const transCache = useRef<Record<string, string>>({}); // `${id}::${locale}` -> text
  const convLangRef = useRef<string>(locale); // native language of this conversation
  const displayLangRef = useRef<string>(locale); // language currently rendered
  const localeInitRef = useRef(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  // Refs let the transport read the latest values without rebuilding.
  const docIdRef = useRef<string | null>(null);
  const semIdRef = useRef<string | null>(null);
  const subIdRef = useRef<string | null>(null);
  const localeRef = useRef(locale);
  const calcModeRef = useRef(calcMode);
  const codeLangRef = useRef(codeLang);
  // Le document envoyé au tuteur est celui de la SESSION, rien d'autre.
  docIdRef.current = session.doc?.id ?? null;
  semIdRef.current = semesterId;
  subIdRef.current = chatSubject;
  localeRef.current = locale;
  calcModeRef.current = calcMode;
  codeLangRef.current = codeLang;
  const socraticRef = useRef(socratic);
  socraticRef.current = socratic;
  // « Ich gebe auf » : vrai pour UN envoi, remis à faux dès que la réponse arrive.
  const giveUpRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/messages",
        body: () => ({
          documentId: docIdRef.current,
          // La portée va du plus étroit au plus large : un document, sinon un
          // Fach, sinon le semestre. Le serveur applique le même ordre.
          subjectId: docIdRef.current ? null : subIdRef.current,
          semesterId: docIdRef.current || subIdRef.current ? null : semIdRef.current,
          locale: localeRef.current,
          calcMode: calcModeRef.current,
          codeLang: codeLangRef.current,
          // Mode socratique, et l'abandon pour ce seul envoi (api/lib/socratic.ts).
          socratic: socraticRef.current,
          socraticGiveUp: giveUpRef.current,
          // Filière, Hochschule, semestre : le tuteur adapte ses exemples
          // (LRT, Maschinenbau …). Lu au moment de l'envoi.
          studyProfile: pickStudyProfile(useUserStore.getState().profile),
          // Hörsaal sans chat : le tuteur écrit TOUTE sa réponse au tableau.
          hoersaal: true,
          // Rattache les calculs des solveurs à cette conversation (vidéo explicative).
          conversationId: convIdRef.current,
        }),
        // Une pièce jointe ne voyage qu'avec SA question. Sans cela, chaque
        // question suivante réexpédiait les fichiers des précédentes (jusqu'à
        // 20 Mo par PDF, sur un réseau de téléphone) pour que le serveur les
        // jette à l'arrivée. Même élagage que lui (api/lib/chat-attachments.ts) ;
        // l'affichage, lui, garde ses vignettes : seul le corps envoyé change.
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
          body: { ...body, id, messages: pruneHistoryFiles(messages), trigger, messageId },
        }),
      }),
    [],
  );

  // UNE instance de chat PAR session. Quand `id` change, @ai-sdk/react en crée
  // une neuve (avec `messages` pour contenu de départ) et ARRÊTE l'ancienne :
  // un flux encore en cours ne peut plus rien écrire dans la nouvelle
  // conversation, ni être enregistré sous son document.
  const { messages, sendMessage, status, error, regenerate, clearError } =
    useChat({ id: session.id, messages: session.initial, transport });
  const busy = status === "submitted" || status === "streaming";

  // L'abandon ne vaut que pour la requête qui vient de partir.
  useEffect(() => {
    if (status !== "submitted") giveUpRef.current = false;
  }, [status]);
  // Où en est l'exercice socratique : le compteur de la DERNIÈRE réponse du tuteur.
  const socraticState = useMemo(() => {
    if (!socratic) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role === "assistant") return parseSocratic(rawMessageText(m));
    }
    return null;
  }, [socratic, messages]);

  // Dernière réponse du tuteur, si elle n'a encore (ou finalement) aucun texte.
  const lastMsg = messages[messages.length - 1];
  const lastAssistantEmpty =
    lastMsg?.role === "assistant" && !messageText(lastMsg).trim() ? lastMsg : null;
  // L'indicateur reste visible pendant TOUTE la génération, sauf quand du texte
  // s'écrit sous les yeux de l'étudiant. Raisonnement et outils peuvent durer
  // longtemps, avant comme après une première phrase.
  const waitingForText =
    busy && (lastMsg?.role !== "assistant" || !isStreamingText(lastMsg));
  // Libellé : l'étape en cours — analyse, recherche, calcul… (lib/chat-phase.ts).
  const phase = chatPhase(busy && lastMsg?.role === "assistant" ? lastMsg.parts : undefined);
  // Le bouton d'envoi dit la même chose aux lecteurs d'écran pendant qu'il tourne.
  const busyLabel = waitingForText ? t(PHASE_KEY[phase]) : t("tafel.writing");
  // Dix secondes sans un mot : le tableau dit ce que le tuteur lit (lib/patience.ts).
  // La question en cours porte-t-elle un fichier ? Sa portée a-t-elle des documents ?
  const questionHasFiles = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    return (lastUser?.parts ?? []).some((p) => p.type === "file");
  }, [messages]);
  const scopeHasDocs = !!session.doc || scopeDocs.some((d) => !chatSubject || d.subjectId === chatSubject);
  // Flux terminé sans un mot (boucle d'outils, coupure…) : on le dit.
  const emptyAnswer = !busy && !error && lastAssistantEmpty !== null;

  // Latest messages, readable from callbacks/effects without stale closures.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Show a message in the language currently selected — falling back to its
  // native text when no translation overlay exists (new/streaming messages).
  function displayText(m: UIMessage): string {
    return overrides[m.id] ?? messageText(m);
  }

  // ── Le Hörsaal sans chat : chaque réponse est une PAGE de la Tafel ───────
  // Décision fondateur (2026-11-09) : la barre du bas ne garde que la saisie.
  // La question de l'étudiant, puis TOUTE la réponse (blocs [[TAFEL]],
  // @@STEP, texte libre) s'écrivent au tableau. Le schéma de poutre et les
  // médias calculés par le code passent en tête de la page.
  const pages: TafelPage[] = [];
  {
    let question: UIMessage | null = null;
    for (const m of messages) {
      if (m.role === "user") {
        question = m;
        continue;
      }
      if (m.role !== "assistant") continue;
      pages.push({
        id: m.id,
        messageId: m.id,
        question: question ? displayText(question) : undefined,
        images: question ? messageImages(question) : undefined,
        blocks: moveFencedToPageTop(
          moveFencedToPageTop(tafelPage(displayText(m)), MEDIA_LANG, "Medium"),
          BEAM_LANG,
          "Skizze",
        ),
        solverUsed: m.parts.some((p) => SOLVER_TOOLS.has(p.type)),
      });
      question = null;
    }
    // La question vient de partir : sa page est déjà au tableau, vide.
    if (question) {
      pages.push({
        id: `q-${question.id}`,
        question: displayText(question),
        images: messageImages(question),
        blocks: [],
        solverUsed: false,
      });
    }
  }
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const lastPage = pages[pages.length - 1];
  // La Tafel montre la page choisie (‹ ›), sinon la dernière.
  const [boardId, setBoardId] = useState<string | null>(null);
  const chosenIndex = boardId ? pages.findIndex((p) => p.id === boardId) : -1;
  const pageIndex = chosenIndex >= 0 ? chosenIndex : pages.length - 1;
  const activePage = pages[pageIndex];
  const onLastPage = pageIndex === pages.length - 1;
  // Une nouvelle page reprend la main sur un ancien choix.
  useEffect(() => {
    setBoardId(null);
  }, [lastPage?.id]);
  // L'option choisie sur une ancienne page : la question qui la suit.
  const chosenOnPage = chosenKey(pages[pageIndex + 1]?.question);

  // Le professeur hologramme : de dos pendant que la réponse s'écrit, il se
  // retourne à la fin du flux et la lit à voix haute (components/hologram-professor.tsx).
  const choreo = useProfessorChoreography({
    busy,
    failed: Boolean(error),
    answerText: () => {
      if (lastMsg?.role !== "assistant") return "";
      const pg = pageById.get(lastMsg.id);
      return spokenAnswer(pg ? pageSplit(pg.blocks) : undefined, displayText(lastMsg));
    },
    locale,
    professor,
  });
  const professorStatus =
    choreo.pose === "schreiben"
      ? t("tafel.profWriting")
      : choreo.pose === "drehen"
        ? t("tafel.profTurning")
        : choreo.pose === "erklaeren"
          ? t("tafel.profExplaining")
          : busy
            ? t("tafel.profWriting")
            : undefined;

  // Pull image attachments out of a UI message's file parts for rendering.
  function messageImages(m: UIMessage): { url: string; name?: string }[] {
    const out: { url: string; name?: string }[] = [];
    for (const p of m.parts) {
      if (p.type !== "file") continue;
      const fp = p as { url?: unknown; mediaType?: unknown; filename?: unknown };
      if (
        typeof fp.url === "string" &&
        String(fp.mediaType ?? "").startsWith("image/")
      ) {
        out.push({
          url: fp.url,
          name: typeof fp.filename === "string" ? fp.filename : undefined,
        });
      }
    }
    return out;
  }

  // A code block can ask the tutor to explain itself line by line.
  function explainCode(code: string, codeLangName: string) {
    if (busy) return;
    send(`${t("calc.explainPrompt")}\n\n\`\`\`${codeLangName}\n${code}\n\`\`\``);
  }

  // A Python block hands its real variable table back to the tutor.
  function sendFromCode(text: string) {
    if (busy || !text.trim()) return;
    send(text);
  }

  // Send the scratchpad's working-out to the tutor for feedback.
  function sendScratchToAi(text: string) {
    if (busy || !text.trim()) return;
    send(`${t("scratchpad.sendToAiPrompt")}\n\n${text}`);
  }

  // Translate every visible message into `target`, using a per-message cache
  // so toggling back and forth is instant and never re-hits the model. The
  // underlying messages state stays native — only the overlay changes.
  async function translateTo(target: string, msgs: UIMessage[]) {
    const relevant = msgs.filter((m) => m.role === "user" || m.role === "assistant");
    const next: Record<string, string> = {};
    const need: { id: string; content: string }[] = [];
    for (const m of relevant) {
      const source = sourceRef.current[m.id] ?? messageText(m);
      if (!source.trim()) continue;
      const cached = transCache.current[`${m.id}::${target}`];
      if (cached !== undefined) next[m.id] = cached;
      else need.push({ id: m.id, content: source });
    }
    if (need.length > 0) {
      setTranslating(true);
      try {
        const res = await fetch("/api/agent/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target, texts: need }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            results: { id: string; content: string }[];
          };
          for (const r of data.results) {
            transCache.current[`${r.id}::${target}`] = r.content;
            next[r.id] = r.content;
          }
        } else {
          for (const n of need) next[n.id] = n.content;
        }
      } catch {
        for (const n of need) next[n.id] = n.content;
      } finally {
        setTranslating(false);
      }
    }
    displayLangRef.current = target;
    setOverrides(next);
  }

  // Build a stable snapshot signature so we save each completed turn once.
  function snapshotOf(msgs: UIMessage[]) {
    return msgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: messageText(m) }))
      .filter((m) => m.content.trim());
  }

  // ── Sessions : ouvrir, reprendre, recommencer ────────────────────────
  // Tout ce qui tient à UNE conversation (traductions, signature du dernier
  // enregistrement, compteur des « autrement ») repart de zéro avec elle.
  function startSession(next: ChatSession, nativeLang: string = locale) {
    explainAttempts.current = {};
    savedSigRef.current = "";
    sourceRef.current = {};
    transCache.current = {};
    setOverrides({});
    convLangRef.current = nativeLang;
    displayLangRef.current = nativeLang;
    giveUpRef.current = false;
    setSession(next);
  }

  /** L'adresse suit la portée : /chat?doc=<id>, ou /chat pour « Alle Materialien ». */
  function syncUrl(docId: string | null, mode: UrlMode) {
    if (mode === "none" || docFromSearch(window.location.search) === docId) return;
    expectedUrlDocRef.current = docId;
    navigate(`/chat${searchWithDoc(window.location.search, docId)}`, { replace: mode === "replace" });
  }

  // « Neuer Chat » : une nouvelle branche pour le MÊME document. Le tableau se
  // vide ; la conversation d'avant reste dans l'historique du document.
  function newChat() {
    scopeTokenRef.current += 1; // une reprise encore en route ne doit plus rien poser ici
    setScopeLoading(false);
    const current = sessionRef.current;
    startSession({ id: crypto.randomUUID(), doc: current.doc, subjectId: current.subjectId, semesterId: current.semesterId, initial: [] });
    setHistoryOpen(false);
  }

  /** Pose une conversation enregistrée au tableau, avec SA portée. */
  function applyConversation(
    c: { id: string; documentId: string | null; documentTitle: string | null; semesterId: string | null; lang: string | null },
    stored: { id: string; role: string; content: string }[],
    doc: ChatSession["doc"],
    subjectId: string | null,
  ) {
    const restored = stored.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    })) as unknown as UIMessage[];
    // Un semestre supprimé depuis ne se rouvre pas : la conversation s'affiche
    // alors dans « Alle Kurse » (même règle que hooks/use-reconciled-semester).
    const known = !semsQuery.isSuccess || !c.semesterId || sems.some((s) => s.id === c.semesterId);
    const sem = known ? (c.semesterId ?? null) : null;
    const nativeLang = c.lang ?? "de";
    startSession({ id: c.id, doc, subjectId, semesterId: sem, initial: restored }, nativeLang);
    // Seed the translation source + cache with the stored native text.
    for (const m of stored) {
      sourceRef.current[m.id] = m.content;
      transCache.current[`${m.id}::${nativeLang}`] = m.content;
    }
    savedSigRef.current = c.id + "|" + stored.map((m) => m.content).join("¦");
    if (sem !== (semIdRef.current ?? null)) {
      expectedSemRef.current = sem;
      setActiveSemester(sem);
    }
    // If the saved conversation isn't in the current UI language, translate.
    if (nativeLang !== locale) void translateTo(locale, restored);
  }

  // Load a saved conversation: restore its scope and messages.
  async function openConversation(id: string, url: UrlMode = "push") {
    try {
      const res = await client.chats.get({ id });
      if (!res) return;
      scopeTokenRef.current += 1;
      setScopeLoading(false);
      const c = res.conversation;
      // Le sélecteur du haut revient où la conversation a été tenue : son
      // module, ou celui de son document (le panneau liste alors ce module).
      const fach = c.documentId ? (scopeDocsRef.current.find((d) => d.id === c.documentId)?.subjectId ?? null) : (c.subjectId ?? null);
      applyConversation(c, res.messages, c.documentId ? { id: c.documentId, title: c.documentTitle ?? "" } : null, fach);
      syncUrl(c.documentId ?? null, url);
      setHistoryOpen(false);
    } catch {
      // ignore — conversation may have been removed
    }
  }

  /**
   * Changer de portée : un document de « Meine Kurse », un module (Fach), ou
   * « Ganzes Semester » / « Alle Materialien ».
   *
   *   1. tout de suite : un tableau vide lié à CETTE portée (le flux en cours
   *      est coupé avec l'ancienne session) et l'adresse `/chat?doc=…` ;
   *   2. puis la dernière conversation de cette portée, demandée au serveur.
   *      Aucune : le tableau reste prêt. Document inconnu (lien périmé,
   *      document d'un autre compte) : retour à la portée sans document.
   */
  async function selectScope(target: { doc: ChatSession["doc"]; subjectId: string | null }, url: UrlMode = "push") {
    const { doc } = target;
    const token = ++scopeTokenRef.current;
    const semester = semIdRef.current ?? null;
    const fresh: ChatSession = { id: crypto.randomUUID(), doc, subjectId: target.subjectId, semesterId: semester, initial: [] };
    startSession(fresh);
    syncUrl(doc?.id ?? null, url);
    setHistoryOpen(false);
    // L'invitation « Die Tafel ist bereit » ne s'affiche pas pour disparaître
    // aussitôt : on attend la session quand on sait qu'elle existe.
    const scope = { documentId: doc?.id ?? null, semesterId: semester, subjectId: doc ? null : target.subjectId };
    setScopeLoading(conversationsOfScope(convListRef.current, scope).length > 0);
    try {
      const res = await client.chats.forScope(scope);
      if (doc && !res.document) {
        // Ce document n'est pas (ou plus) à ce compte : on ne reste pas dessus.
        if (token === scopeTokenRef.current) void selectScope({ doc: null, subjectId: target.subjectId }, "replace");
        return;
      }
      const state = { requestToken: token, currentToken: scopeTokenRef.current, freshSessionId: fresh.id, currentSessionId: sessionRef.current.id, messageCount: messagesRef.current.length };
      if (!mayApplyResume(state)) return;
      const title = res.document?.title ?? doc?.title ?? "";
      // Un document ouvert alors qu'un AUTRE module est affiché en haut
      // (lien direct, bouton Retour) : le sélecteur passe au module du
      // document, sinon le panneau listerait un module où il n'est pas.
      const fach = doc && target.subjectId && (res.document?.subjectId ?? null) !== target.subjectId ? (res.document?.subjectId ?? null) : target.subjectId;
      if (res.conversation) {
        applyConversation(res.conversation, res.messages, doc ? { id: doc.id, title } : null, fach);
      } else if (doc && (title !== doc.title || fach !== target.subjectId)) {
        // Arrivé par l'adresse : le titre (et le module) viennent du serveur.
        setSession((s) => (s.id === fresh.id ? { ...s, doc: { id: doc.id, title }, subjectId: fach } : s));
      }
    } catch {
      // Hors ligne : le tableau vide reste utilisable.
    } finally {
      if (token === scopeTokenRef.current) setScopeLoading(false);
    }
  }

  /** Un clic de l'étudiant sur un document (ou « tout »), dans le module affiché. Déjà ouvert : rien à refaire. */
  function pickScope(doc: ChatSession["doc"]) {
    if ((doc?.id ?? null) === (sessionRef.current.doc?.id ?? null)) return;
    void selectScope({ doc, subjectId: sessionRef.current.subjectId });
  }

  /** Le sélecteur de module en haut : TZ, ELT… ou « Ganzes Semester » (`null`). */
  function pickSubject(subjectId: string | null) {
    if (subjectId === sessionRef.current.subjectId && !sessionRef.current.doc) return;
    void selectScope({ doc: null, subjectId });
  }

  function deleteConversation(id: string) {
    removeMut.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: chatsListKey() });
          qc.invalidateQueries({ queryKey: chatsTrashListKey() });
          if (id === convId) newChat();
        },
      },
    );
  }

  function restoreConversation(id: string) {
    restoreMut.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: chatsListKey() });
          qc.invalidateQueries({ queryKey: chatsTrashListKey() });
        },
      },
    );
  }

  function purgeConversation(id: string) {
    if (!window.confirm(t("chat.confirmPurge"))) return;
    purgeMut.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: chatsTrashListKey() });
        },
      },
    );
  }

  function emptyTrash() {
    if (!window.confirm(t("chat.confirmEmptyTrash"))) return;
    emptyTrashMut.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: chatsTrashListKey() });
      },
    });
  }

  // Bulk actions on the current selection.
  function bulkDeleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    removeManyMut.mutate(
      { ids },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: chatsListKey() });
          qc.invalidateQueries({ queryKey: chatsTrashListKey() });
          if (ids.includes(convId)) newChat();
          exitSelect();
        },
      },
    );
  }
  function bulkRestoreSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    restoreManyMut.mutate(
      { ids },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: chatsListKey() });
          qc.invalidateQueries({ queryKey: chatsTrashListKey() });
          exitSelect();
        },
      },
    );
  }
  function bulkPurgeSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(t("chat.confirmPurgeSelected"))) return;
    purgeManyMut.mutate(
      { ids },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: chatsTrashListKey() });
          exitSelect();
        },
      },
    );
  }

  // Auto-restore the most recent conversation on first load / page refresh —
  // but ONLY when it belongs to the currently selected scope (semester).
  // Otherwise the user picked a different subject/semester (e.g. on the
  // dashboard) before opening the chat: restoring the last conversation would
  // snap the scope back to that conversation's semester and force uploads into
  // the wrong one. In that case we keep the selected scope and start fresh.
  // ── Ouverture depuis la recherche globale ────────────────────────────────
  // Deux chemins, parce que cette page peut déjà être à l'écran ou pas encore
  // montée quand on clique un résultat :
  //   • déjà là  → l'événement arrive tout de suite, ci-dessous ;
  //   • ailleurs → la demande attend dans sessionStorage et est lue au montage.
  useEffect(() => {
    function forget(key: string) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* navigation privée */
      }
    }
    function onOpenChat(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      forget("tred.openChat");
      if (typeof id === "string" && id) void openConversation(id);
    }
    function onOpenDoc(e: Event) {
      const d = (e as CustomEvent<{ id: string; title: string }>).detail;
      forget("tred.openDoc");
      if (d && d.id) void selectScope({ doc: { id: d.id, title: d.title ?? "" }, subjectId: null });
    }
    window.addEventListener("tred:open-chat", onOpenChat);
    window.addEventListener("tred:open-doc", onOpenDoc);
    return () => {
      window.removeEventListener("tred:open-chat", onOpenChat);
      window.removeEventListener("tred:open-doc", onOpenDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bootRef.current || !convQuery.isSuccess) return;
    bootRef.current = true;

    // Une demande venue de la recherche prime sur la reprise automatique : on
    // vient de cliquer un résultat précis, rouvrir autre chose serait absurde.
    const readOnce = (key: string): unknown => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        sessionStorage.removeItem(key);
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    };

    // « Den Tutor fragen » de l'Explorateur 3D (pages/explorer.tsx) : la
    // question est POSÉE dans le champ de saisie, jamais envoyée d'office —
    // c'est l'étudiant qui décide de dépenser une question.
    const draft = readOnce("tred.askDraft");
    if (typeof draft === "string" && draft.trim()) setInput(draft.slice(0, 600));

    const wantedDoc = readOnce("tred.openDoc") as { id?: string; title?: string } | null;
    if (wantedDoc && wantedDoc.id) {
      void selectScope({ doc: { id: wantedDoc.id, title: wantedDoc.title ?? "" }, subjectId: null }, "replace");
      return;
    }

    const wantedChat = readOnce("tred.openChat");
    if (typeof wantedChat === "string" && wantedChat) {
      void openConversation(wantedChat, "replace");
      return;
    }

    // L'adresse dit quel document : /chat?doc=… rouvre SA session (lien
    // enregistré, rechargement de la page).
    const fromUrl = docFromSearch(window.location.search);
    if (fromUrl) {
      void selectScope({ doc: { id: fromUrl, title: scopeDocs.find((d) => d.id === fromUrl)?.title ?? "" }, subjectId: null }, "none");
      return;
    }

    const latest = convList[0];
    if (latest && (latest.semesterId ?? null) === (semesterId ?? null)) {
      void openConversation(latest.id, "replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convQuery.isSuccess]);

  // Retour / avance du navigateur : l'adresse a changé sans que cette page
  // l'ait écrite. La portée suit l'adresse.
  useEffect(() => {
    if (!bootRef.current || urlDocId === expectedUrlDocRef.current) return;
    expectedUrlDocRef.current = urlDocId;
    // Le module affiché reste : revenir d'un document à « tout » ramène au module où l'on était.
    void selectScope({ doc: urlDocId ? { id: urlDocId, title: scopeDocs.find((d) => d.id === urlDocId)?.title ?? "" } : null, subjectId: sessionRef.current.subjectId }, "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDocId]);

  // Le semestre a changé sans que cette page l'ait demandé (réconciliation au
  // chargement, autre onglet) : la session ouverte n'est plus dans la portée.
  // On repart de « Alle Materialien » du nouveau semestre.
  useEffect(() => {
    const sem = semesterId ?? null;
    if (sem === expectedSemRef.current) return;
    expectedSemRef.current = sem;
    // Une session liée à un document ne dépend pas du semestre affiché ; et
    // avant le premier chargement il n'y a encore rien à reprendre.
    if (!bootRef.current || sessionRef.current.doc) {
      setSession((s) => ({ ...s, semesterId: sem }));
      return;
    }
    // Un module appartient à UN semestre : on repart de « Ganzes Semester ».
    void selectScope({ doc: null, subjectId: null }, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId]);

  // Persist the conversation after each completed exchange.
  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    const snap = snapshotOf(messages);
    if (snap.length === 0) return;
    const sig = convId + "|" + snap.map((m) => m.content).join("¦");
    if (sig === savedSigRef.current) return;
    savedSigRef.current = sig;
    const firstUser = snap.find((m) => m.role === "user");
    const title = (firstUser?.content ?? t("chat.untitledConversation")).slice(0, 80);
    // L'identifiant et le document viennent de la MÊME session : une
    // conversation ne peut pas être rangée sous un autre document que le sien
    // (et le serveur le refuserait : chats.save › SCOPE_MISMATCH).
    saveMut.mutate(
      {
        id: session.id,
        title,
        semesterId: semesterId ?? null,
        // Le module ne fait la portée que sans document ; le serveur ne l'écrit qu'à la création.
        subjectId: session.doc ? null : session.subjectId,
        documentId: session.doc?.id ?? null,
        documentTitle: session.doc?.title || null,
        lang: convLangRef.current,
        messages: snap,
      },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: chatsListKey() }),
        onError: (e) => console.warn("[chat] conversation non enregistrée :", e instanceof Error ? e.message : e),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages, convId]);

  // Freeze each completed message's native text (and seed its cache under the
  // language it was generated in) so later translation has a clean source and
  // switching back to the native language is a cache hit, never a re-translate.
  useEffect(() => {
    if (status !== "ready") return;
    const wasEmpty = Object.keys(sourceRef.current).length === 0;
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      if (sourceRef.current[m.id] !== undefined) continue;
      const text = messageText(m);
      if (!text.trim()) continue;
      sourceRef.current[m.id] = text;
      transCache.current[`${m.id}::${locale}`] = text;
    }
    if (wasEmpty && Object.keys(sourceRef.current).length > 0) {
      convLangRef.current = locale;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages, locale]);

  // When the language toggle changes, retranslate the whole visible exchange.
  useEffect(() => {
    if (!localeInitRef.current) {
      localeInitRef.current = true;
      displayLangRef.current = locale;
      return;
    }
    if (locale === displayLangRef.current) return;
    void translateTo(locale, messagesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function send(text: string) {
    const q = text.trim();
    if (busy) return;
    // Allow sending when there's either text or at least one attachment.
    if (!q && attachments.length === 0) return;
    // Images and PDFs go to the model as file parts (it can see/read them).
    const files = attachments
      .filter((a) => a.mediaType.startsWith("image/") || a.mediaType === "application/pdf")
      .filter((a) => isUsableDataUrl(a.url))
      .map((a) => ({
        type: "file" as const,
        mediaType: a.mediaType || "image/png",
        url: a.url,
        filename: a.name,
      }));
    // Text files are inlined into the prompt so the tutor reads their content.
    const textBlocks = attachments
      .filter((a) => a.text != null)
      .map((a) => `--- ${a.name} ---\n${a.text}`)
      .join("\n\n");
    const finalText = textBlocks ? (q ? `${q}\n\n${textBlocks}` : textBlocks) : q;
    void sendMessage(
      files.length > 0 ? { text: finalText, files } : { text: finalText },
    );
    setInput("");
    setAttachments([]);
    setAttachError(null);
  }

  /**
   * Pourquoi la réponse a échoué — d'après le serveur, pas d'après une
   * supposition. Voir `lib/chat-error.ts` : le corps JSON du refus arrive
   * dans `error.message`, déguisé par le transport.
   */
  const echec = useMemo(() => readChatFailure(error), [error]);
  // Le ou les PDF de la question refusée, pour les nommer dans le message.
  const refusedPdfName = useMemo(() => {
    if (echec.kind !== "attachment") return "";
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const names = (lastUser?.parts ?? []).flatMap((p) => {
      const f = p as { type: string; mediaType?: string; filename?: string };
      return f.type === "file" && f.mediaType === "application/pdf" ? [f.filename || "PDF"] : [];
    });
    return names.join(", ") || "PDF";
  }, [echec, messages]);

  /**
   * Paywall intelligent : un quota épuisé ouvre la modale (Premium / vidéo
   * contre 1 crédit / crédits), une fois par refus. Fermée, elle se rouvre
   * depuis le message sous la conversation. Dérivé, sans effet : la modale
   * est ouverte tant que CE refus-là n'a pas été écarté.
   */
  const [paywallDismissed, setPaywallDismissed] = useState<Error | null>(null);
  const adText = useAdCopy();
  const paywallOpen = echec.kind === "quota" && !!error && paywallDismissed !== error;

  /**
   * Le solde, relu après chaque réponse terminée.
   *
   * Sans cela, le bandeau annoncerait « il te reste 4 questions » pendant que
   * l'étudiant en pose une cinquième : un compteur faux est pire qu'aucun
   * compteur, parce qu'on lui fait confiance. `status` repasse à "ready" à la
   * fin du flux, y compris quand la réponse a été payée sur les crédits.
   */
  useEffect(() => {
    if (status !== "ready") return;
    void qc.invalidateQueries({ queryKey: creditsMeKey() });
  }, [status, qc]);

  /**
   * Longue conversation : les réponses terminées PENDANT cette visite. Aucune
   * pub ici — c'est en QUITTANT le chat après 12 réponses que l'écran de fin
   * de session est demandé ; il s'affiche sur la page suivante
   * (components/InterstitialAdScreen.tsx), jamais sur /chat.
   */
  const answersThisVisit = useRef(0);
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === "streaming" && status === "ready") answersThisVisit.current += 1;
    prevStatus.current = status;
  }, [status]);
  const requestInterstitial = useAdStore((st) => st.request);
  useEffect(
    () => () => {
      if (answersThisVisit.current >= INTERSTITIAL_RULES.longChatAnswers) requestInterstitial("long_chat");
    },
    [requestInterstitial],
  );

  // Streaming answers occasionally fail for transient reasons — a proxy idle
  // timeout, a dropped mobile connection, or a brief gateway hiccup — which
  // surfaced as a hard "Etwas ist schiefgelaufen" even though a simple retry
  // succeeds. Auto-retry once per failed turn before bothering the user, and
  // remember which turn we already retried so we never loop.
  //
  // MAIS : on ne relance JAMAIS un refus définitif. Le 5 septembre, un quota
  // atteint relançait toutes les 900 ms — chaque tentative repartait pour un
  // 402, et la seule chose que l'étudiant voyait était « la connexion a été
  // interrompue ». Une limite de débit, elle, se relance : à la seconde que le
  // serveur indique, jamais avant, sinon la relance recompte dans le limiteur
  // et prolonge le blocage.
  const autoRetried = useRef<string | null>(null);
  useEffect(() => {
    if (!error || busy) return;
    // Pièce jointe refusée : relancer renverrait le même fichier pour le même refus.
    if (echec.kind === "quota" || echec.kind === "attachment") return;
    const lastUser = [...messagesRef.current].reverse().find((m) => m.role === "user");
    const turnKey = lastUser?.id ?? "none";
    if (autoRetried.current === turnKey) return;
    autoRetried.current = turnKey;
    const delai = echec.kind === "rate" ? (echec.retryAfter + 1) * 1000 : 900;
    const timer = setTimeout(() => {
      clearError();
      void regenerate();
    }, delai);
    return () => clearTimeout(timer);
  }, [error, busy, echec, clearError, regenerate]);

  function retryNow() {
    clearError();
    void regenerate();
  }

  // Tracks how many times "explain differently" was clicked per AI message,
  // so the agent is told which attempt this is and never repeats a method.
  const explainAttempts = useRef<Record<string, number>>({});
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoScript, setVideoScript] = useState<VideoScript | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const lastTopic = useRef<string>("");
  // « Als Video erklären » : la vidéo sur mesure (script validé + voix). null = fenêtre fermée.
  const [explainer, setExplainer] = useState<ExplainerState | null>(null);
  const explainerAbort = useRef<AbortController | null>(null);
  const lastExplainerMessage = useRef<string>("");

  // Videosuche (YouTube) — unabhängig vom generierten Erklärvideo.
  // « Prüfe mein Verständnis » : la réponse dont on vérifie la compréhension.
  const [quizFor, setQuizFor] = useState<string | null>(null);
  const genCards = useGenerateFlashcards();
  const [ytOpen, setYtOpen] = useState(false);
  const [ytHits, setYtHits] = useState<YoutubeHit[]>([]);
  const [ytQuery, setYtQuery] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<VideoSearchError>(null);
  const lastYtTopic = useRef<string>("");
  const lastYtQuestion = useRef<string>("");

  // Kursliste einklappbar: beim Schreiben zählt Fläche. Die Wahl überlebt den
  // Seitenwechsel, damit sie nicht bei jedem Aufruf neu getroffen werden muss.
  // Le Hörsaal prend tout l'écran : la liste reste repliée tant qu'on ne
  // l'ouvre pas (clé v2 : l'ancien « ouvert » enregistré par défaut ne compte plus).
  const [railOpen, setRailOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("tred.chatRail.v2") === "open";
  });
  useEffect(() => {
    window.localStorage.setItem("tred.chatRail.v2", railOpen ? "open" : "closed");
  }, [railOpen]);


  // Studyflix-style explainer: the scene script is generated from the course
  // documents, then animated and narrated on the device.
  async function runVideo(topic: string) {
    lastTopic.current = topic;
    setVideoOpen(true);
    setVideoScript(null);
    setVideoError(false);
    setVideoLoading(true);
    try {
      const res = await fetch("/api/agent/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          docId: activeDoc?.id ?? null,
          semesterId,
          locale,
        }),
      });
      if (!res.ok || !res.body) throw new Error("failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let final: VideoScript | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: { type?: string } & Partial<VideoScript>;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === "heartbeat" || msg.type === "ping") continue;
          if (msg.type === "error") throw new Error("failed");
          if (msg.type === "result") {
            final = {
              title: String(msg.title ?? ""),
              scenes: Array.isArray(msg.scenes) ? msg.scenes : [],
            };
          }
        }
      }
      if (!final || final.scenes.length === 0) throw new Error("failed");
      setVideoScript(final);
    } catch {
      setVideoError(true);
    } finally {
      setVideoLoading(false);
    }
  }

  // Passende Erklärvideos auf YouTube suchen. Das Thema wird serverseitig aus
  // der Antwort destilliert, der API-Key bleibt dort ebenfalls.
  // Die Frage des Studenten liefert die besten Suchbegriffe — die Antwort des
  // Tutors beginnt oft mit einer Anrede, nicht mit dem Thema.
  function questionBefore(messageId: string): string {
    const index = messages.findIndex((m) => m.id === messageId);
    for (let i = index - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "user") return displayText(m);
    }
    return "";
  }

  async function runYoutube(topic: string, question = "") {
    lastYtTopic.current = topic;
    lastYtQuestion.current = question;
    setYtOpen(true);
    setYtHits([]);
    setYtQuery("");
    setYtError(null);
    setYtLoading(true);
    try {
      const res = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, question, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        hits?: YoutubeHit[];
        query?: string;
        error?: string;
      };
      if (!res.ok) {
        const code = data.error;
        setYtError(
          code === "not_configured" || code === "quota" ? code : "failed",
        );
        return;
      }
      setYtHits(Array.isArray(data.hits) ? data.hits : []);
      setYtQuery(String(data.query ?? ""));
    } catch {
      setYtError("failed");
    } finally {
      setYtLoading(false);
    }
  }

  /**
   * La vidéo explicative de CETTE réponse : fondée sur le cours de l'étudiant
   * et sur les calculs des solveurs de la conversation. Si la fonction n'est
   * pas configurée sur le serveur, l'ancien diaporama prend le relais.
   */
  function runExplainer(messageId: string) {
    const msg = messages.find((m) => m.id === messageId);
    const answer = displayText(msg ?? ({} as UIMessage));
    lastExplainerMessage.current = messageId;
    explainerAbort.current?.abort();
    const control = new AbortController();
    explainerAbort.current = control;
    void runExplainerVideo(
      {
        question: questionBefore(messageId),
        answer,
        language: locale,
        chatId: convId,
        messageId,
        docId: activeDoc?.id ?? null,
        semesterId,
      },
      (state) => {
        if (state.phase === "unavailable") {
          setExplainer(null);
          void runVideo(answer);
        } else {
          setExplainer(state);
        }
      },
      control.signal,
    );
  }

  function closeExplainer() {
    explainerAbort.current?.abort();
    setExplainer(null);
  }

  function handleAction(
    messageId: string,
    action: PageAction,
  ) {
    if (action === "quiz") {
      setQuizFor(messageId);
      return;
    }
    if (action === "flashcards") {
      // Les cartes portent sur la réponse choisie et ce qui la précède.
      const end = messages.findIndex((m) => m.id === messageId);
      const context = messages
        .slice(0, end + 1)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-4)
        .map((m) => ({ role: m.role as "user" | "assistant", text: displayText(m) }));
      if (!genCards.isPending) genCards.mutate({ source: "chat", messages: context });
      return;
    }
    if (action === "video") {
      runExplainer(messageId);
      return;
    }
    if (action === "ytsearch") {
      const msg = messages.find((m) => m.id === messageId);
      void runYoutube(
        displayText(msg ?? ({} as UIMessage)),
        questionBefore(messageId),
      );
      return;
    }
    if (busy) return;
    if (action === "why") {
      send(t("chat.whyPrompt"));
    } else if (action === "engineer") {
      send(t("chat.engineerPrompt"));
    } else if (action === "mission") {
      // Une petite tâche de la filière, à faire avec ses propres chiffres (api/lib/real-world.ts).
      send(t("chat.missionPrompt"));
    } else {
      const n = (explainAttempts.current[messageId] ?? 1) + 1;
      explainAttempts.current[messageId] = n;
      send(t("chat.explainPrompt", { n }));
    }
  }

  // Le titre du document ouvert : celui de la session, sinon celui de la liste
  // (session ouverte par l'adresse, avant la réponse du serveur).
  const activeDocTitle = activeDoc ? activeDoc.title || scopeDocs.find((d) => d.id === activeDoc.id)?.title || "" : "";
  // Le nom du module affiché en haut (même avec un document ouvert : le panneau liste toujours ce module).
  const scopeLabelOfSubject = chatSubject ? (chatSubjects.find((f) => f.id === chatSubject)?.name ?? t("subjects.one")) : "";
  const scopeLabel = activeDoc
    ? activeDocTitle
    : chatSubject
      ? (chatSubjects.find((f) => f.id === chatSubject)?.name ?? t("subjects.one"))
      : activeSem
        ? activeSem.name
        : t("dashboard.allCourses");

  // Sur le tableau, à tout moment : le document de la session (« Kurs: … »),
  // ou « Alle Materialien » pour la session globale.
  const scopeBadge = activeDoc ? (
    <BoardScope icon={<FileText className="size-3.5" />} label={t("chat.boardScopeLabel")} title={activeDocTitle || "…"} />
  ) : (
    <BoardScope icon={<Sparkles className="size-3.5" />} label={chatSubject ? t("chat.boardSubjectLabel") : undefined} title={chatSubject ? scopeLabel : t("library.allScope")} />
  );
  // Le tiroir d'historique montre d'abord les conversations de CETTE portée.
  const scopeConvs = conversationsOfScope(convList, { documentId: activeDoc?.id ?? null, semesterId: semesterId ?? null, subjectId: chatSubject });
  const shownConvs = historyAll ? convList : scopeConvs;

  const suggestions = [t("chat.q1"), t("chat.q2"), t("chat.q3")];

  // La saisie vit DANS le rebord du tableau, à droite de « Farben »
  // (décision fondateur 2026-11-09) : une seule ligne, jamais de
  // chevauchement. Verre dépoli clair, encre fixe : le rebord est toujours
  // en métal clair, quel que soit le thème de l'app.
  //
  // `min-w-0` sur la pastille : sans lui elle garde la largeur de son contenu
  // (trois boutons + champ + envoi = 350 px) et déborde d'un téléphone — le
  // bouton d'envoi sortait de l'écran depuis l'ajout du bouton socratique.
  // Sur téléphone les écarts se resserrent ; c'est le champ qui rétrécit.
  const composerRow = (
    <div data-slot="chat-composer" className="flex items-end gap-2">
      <div className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl border border-white/50 bg-white/45 px-2 py-1.5 sm:gap-2 sm:px-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_6px_16px_-10px_rgb(0_0_0/0.5)] backdrop-blur-xl backdrop-saturate-150 transition-[box-shadow,background] focus-within:bg-white/70 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#EAB308]/60">
        {/* Hidden inputs targeted by the three menu options */}
        <input
          ref={filesInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files, true);
            e.target.value = "";
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground hover:text-primary hover:bg-accent grid size-8 shrink-0 place-items-center rounded-lg transition-colors"
              title={t("chat.attachHint")}
              aria-label={t("chat.attach")}
            >
              <Paperclip className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-60">
            <DropdownMenuItem
              className="gap-3 py-2.5"
              onSelect={() => filesInputRef.current?.click()}
            >
              <FolderOpen className="size-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t("chat.attachFiles")}</span>
                <span className="text-muted-foreground text-xs">
                  {t("chat.attachFilesHint")}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-3 py-2.5"
              onSelect={() => galleryInputRef.current?.click()}
            >
              <ImageIcon className="size-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t("chat.attachGallery")}</span>
                <span className="text-muted-foreground text-xs">
                  {t("chat.attachGalleryHint")}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-3 py-2.5"
              onSelect={() => {
                setAttachError(null);
                setCameraOpen(true);
              }}
            >
              <Camera className="size-4 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t("chat.attachCamera")}</span>
                <span className="text-muted-foreground text-xs">
                  {t("chat.attachCameraHint")}
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => setCalcMode((v) => !v)}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
            // Encre du rebord, pas les couleurs du thème : la saisie est un verre
            // clair dans les deux thèmes (en sombre, le jaune et le gris clair s'y perdaient).
            calcMode
              ? "bg-[#0F172A]/15 text-[#0F172A]"
              : "text-[#0F172A]/60 hover:bg-[#0F172A]/10 hover:text-[#0F172A]",
          )}
          title={
            calcMode
              ? codeLang === "matlab"
                ? t("chat.calcModeOnMatlab")
                : t("chat.calcModeOnPython")
              : t("chat.calcModeHint")
          }
          aria-label={t("chat.calcMode")}
          aria-pressed={calcMode}
        >
          <Calculator className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setSocratic((v) => !v)}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
            socratic
              ? "bg-[#0F172A]/15 text-[#0F172A]"
              : "text-[#0F172A]/60 hover:bg-[#0F172A]/10 hover:text-[#0F172A]",
          )}
          title={socratic ? t("chat.socraticOn") : t("chat.socraticHint")}
          aria-label={t("chat.socratic")}
          aria-pressed={socratic}
          data-testid="socratic-toggle"
        >
          <MessageCircleQuestion className="size-4" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={t("chat.placeholder")}
          // Texte d'invite : encre du rebord à 70 % (4,9:1 sur le verre clair ; à 50 %, 2,9:1).
          className="placeholder:truncate max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-[#0F172A]/70"
        />
        <Button
          size="icon"
          className="brand-gradient size-8 shrink-0 text-white"
          onClick={() => send(input)}
          disabled={(!input.trim() && attachments.length === 0) || busy}
          // Pendant la réponse : désactivé ET visiblement au travail. L'avion en
          // papier pâli ne disait rien — on a vu des clics répétés sur téléphone.
          aria-busy={busy}
          aria-label={busy ? busyLabel : t("common.send")}
          data-testid="send-button"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
  // Ce qui accompagne la saisie (solde, pièces jointes, mode calcul) : posé
  // juste au-dessus du rebord, dans le flux.
  const composerExtras = (
    <>
      {/* Le solde, juste au-dessus du champ de saisie. C'est le seul
          endroit où l'information arrive avant la décision d'écrire —
          partout ailleurs elle arrive après le refus. */}
      <QuotaBanner />
      {/* Upload error (unsupported type / too large) */}
      {attachError && (
        // Sur une carte claire, aux couleurs FIXES : le rebord du tableau est
        // gris-bleu dans les deux thèmes. En rouge directement dessus, le texte
        // était à 2,9:1 ; sur la carte du thème sombre, sous 4,5:1 (mesuré le
        // 15 nov. 2026). Ici #991B1B sur #FEF2F2 = 7,6:1, quel que soit le
        // thème. mr-12 : la carte s'arrête AVANT le bouton rond « pause du
        // fond » (components/dynamic-background.tsx) — le refus d'un PDF trop
        // long tient sur deux lignes.
        <div role="alert" data-testid="attach-error" className="mr-12 mb-2 flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-3 py-2 text-xs font-medium text-[#991B1B] shadow-sm ring-1 ring-[#FCA5A5]">
          <X className="size-3.5 shrink-0" />
          <span>{attachError}</span>
        </div>
      )}
      {/* Attachment previews — images as thumbnails, docs as chips */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) =>
            a.kind === "image" ? (
              <div
                key={a.id}
                className="border-border relative size-16 overflow-hidden rounded-lg border"
              >
                <img src={a.url} alt={a.name} className="size-full object-cover" />
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                  aria-label={t("chat.removeImage")}
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <div
                key={a.id}
                className="border-border bg-muted/40 relative flex h-16 max-w-[12rem] items-center gap-2 rounded-lg border px-3 pr-8"
              >
                <FileIcon className="text-muted-foreground size-5 shrink-0" />
                <span className="truncate text-xs font-medium">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                  aria-label={t("chat.removeFile")}
                >
                  <X className="size-3" />
                </button>
              </div>
            ),
          )}
        </div>
      )}
      {calcMode && (
        <p className="mt-1.5 px-1 text-xs text-[#0F172A]/75">
          {codeLang === "matlab"
            ? t("chat.calcModeOnMatlab")
            : t("chat.calcModeOnPython")}
        </p>
      )}
      {/* Mode socratique : où en est l'exercice, et la porte de sortie. Encre
          du rebord (fond clair dans les deux thèmes), pas le gris du thème. */}
      {socratic && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-[#0F172A]" data-testid="socratic-bar">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <MessageCircleQuestion className="size-3.5" aria-hidden />
            {t("chat.socratic")}
          </span>
          {socraticState?.status === "open" && (
            <span className="rounded-full bg-[#0F172A]/10 px-2 py-0.5 font-semibold tabular-nums" data-testid="socratic-attempts" aria-live="polite">
              {t("chat.socraticAttempts", { n: socraticState.attempt, max: socraticState.max })}
            </span>
          )}
          {socraticState?.status === "solved" && (
            <span className="rounded-full bg-emerald-600/15 px-2 py-0.5 font-semibold text-emerald-800" data-testid="socratic-solved">
              {t("chat.socraticSolved")}
            </span>
          )}
          {socraticState?.status === "open" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                giveUpRef.current = true;
                send(t("chat.socraticGiveUpMessage"));
              }}
              // À côté du compteur, pas au bord droit : le coin est occupé par le bouton de pause du fond.
              className="rounded-full border border-[#0F172A]/35 bg-white/40 px-2.5 py-0.5 font-semibold transition-colors hover:bg-white/70 disabled:opacity-50"
              data-testid="socratic-give-up"
            >
              {t("chat.socraticGiveUp")}
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)]">
      {/* Kursliste — Schiene auf großen Bildschirmen, einklappbar.
          Sie liegt auf dem dunklen Foto des Hörsaals: Nachtglas und helle
          Schrift in BEIDEN Themes (tone="night", styles.css › .night-panel).
          `h-full`: die Liste füllt die Spalte und scrollt in sich. */}
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r border-white/10 transition-[width] duration-200 lg:block",
          railOpen ? "w-72" : "w-0 border-r-0",
        )}
        aria-hidden={!railOpen}
      >
        <div className="h-full w-72">
          <DocumentLibrary
            tone="night"
            activeId={activeDoc?.id ?? null}
            semesterId={semesterId}
            subjectId={chatSubject}
            subjectName={chatSubject ? scopeLabelOfSubject : ""}
            unassignedCount={subjectData?.unassigned ?? 0}
            wholeLabel={t("subjects.wholeSemester")}
            onSelect={(id, title) => pickScope(id ? { id, title: title ?? "" } : null)}
          />
        </div>
      </aside>

      {/* Library — mobile drawer */}
      <AnimatePresence>
        {libOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLibOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="bg-background fixed inset-y-0 left-0 z-50 w-72 shadow-xl lg:hidden"
            >
              <div className="flex justify-end p-2">
                <Button variant="ghost" size="icon" onClick={() => setLibOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
              <DocumentLibrary
                activeId={activeDoc?.id ?? null}
                semesterId={semesterId}
                subjectId={chatSubject}
                subjectName={chatSubject ? scopeLabelOfSubject : ""}
                unassignedCount={subjectData?.unassigned ?? 0}
                wholeLabel={t("subjects.wholeSemester")}
                onSelect={(id, title) => {
                  pickScope(id ? { id, title: title ?? "" } : null);
                  setLibOpen(false);
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Conversation history — right drawer */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-40 bg-black/40"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="bg-background fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col shadow-xl"
            >
              <div className="border-border flex items-center justify-between border-b px-4 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {showTrash ? <Trash2 className="size-4" /> : <History className="size-4" />}
                  {showTrash ? t("chat.trash") : t("chat.history")}
                </span>
                <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>

              {showTrash ? (
                <>
                  {selectMode ? (
                    <div className="border-border flex items-center justify-between gap-2 border-b p-3">
                      <button
                        onClick={() => toggleSelectAll(trashList.map((c) => c.id))}
                        className="text-muted-foreground hover:text-foreground text-xs font-medium"
                      >
                        {selectedIds.size === trashList.length && trashList.length > 0
                          ? t("chat.deselectAll")
                          : t("chat.selectAll")}
                      </button>
                      <span className="text-muted-foreground text-xs">
                        {t("chat.selectedCount", { n: selectedIds.size })}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={selectedIds.size === 0}
                          onClick={bulkRestoreSelected}
                          title={t("chat.restoreSelected")}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive size-8"
                          disabled={selectedIds.size === 0}
                          onClick={bulkPurgeSelected}
                          title={t("chat.deleteSelected")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={exitSelect}>
                          {t("chat.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 p-3">
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start gap-1.5"
                        onClick={() => {
                          setShowTrash(false);
                          exitSelect();
                        }}
                      >
                        <ArrowLeft className="size-4" />
                        {t("chat.backToHistory")}
                      </Button>
                      {trashList.length > 0 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setSelectMode(true);
                              setSelectedIds(new Set());
                            }}
                            title={t("chat.select")}
                          >
                            <ListChecks className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive size-8"
                            onClick={emptyTrash}
                            title={t("chat.emptyTrash")}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto px-2 pb-4">
                    {trashList.length === 0 ? (
                      <p className="text-muted-foreground px-2 py-8 text-center text-xs">
                        {t("chat.trashEmpty")}
                      </p>
                    ) : (
                      <ul className="space-y-0.5">
                        {trashList.map((c) => (
                          <li key={c.id}>
                            <div
                              className={cn(
                                "group hover:bg-accent flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
                                selectMode && selectedIds.has(c.id) && "bg-accent",
                              )}
                            >
                              {selectMode ? (
                                <button
                                  onClick={() => toggleSelect(c.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  {selectedIds.has(c.id) ? (
                                    <CheckSquare className="text-primary size-4 shrink-0" />
                                  ) : (
                                    <Square className="text-muted-foreground size-4 shrink-0" />
                                  )}
                                  <span className="text-muted-foreground truncate text-sm">
                                    {c.title}
                                  </span>
                                </button>
                              ) : (
                                <>
                                  <span className="flex min-w-0 flex-1 items-center gap-2">
                                    <MessageSquare className="text-muted-foreground size-3.5 shrink-0" />
                                    <span className="text-muted-foreground truncate text-sm">
                                      {c.title}
                                    </span>
                                  </span>
                                  <button
                                    onClick={() => restoreConversation(c.id)}
                                    className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-label={t("chat.restoreConv")}
                                    title={t("chat.restoreConv")}
                                  >
                                    <RotateCcw className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => purgeConversation(c.id)}
                                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-label={t("chat.deletePermanent")}
                                    title={t("chat.deletePermanent")}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {selectMode ? (
                    <div className="border-border flex items-center justify-between gap-2 border-b p-3">
                      <button
                        onClick={() => toggleSelectAll(shownConvs.map((c) => c.id))}
                        className="text-muted-foreground hover:text-foreground text-xs font-medium"
                      >
                        {selectedIds.size === shownConvs.length && shownConvs.length > 0
                          ? t("chat.deselectAll")
                          : t("chat.selectAll")}
                      </button>
                      <span className="text-muted-foreground text-xs">
                        {t("chat.selectedCount", { n: selectedIds.size })}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive size-8"
                          disabled={selectedIds.size === 0}
                          onClick={bulkDeleteSelected}
                          title={t("chat.deleteSelected")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={exitSelect}>
                          {t("chat.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 p-3">
                      <Button
                        variant="outline"
                        className="flex-1 gap-1.5"
                        onClick={newChat}
                      >
                        <Plus className="size-4" />
                        {t("chat.newChat")}
                      </Button>
                      {shownConvs.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          onClick={() => {
                            setSelectMode(true);
                            setSelectedIds(new Set());
                          }}
                          title={t("chat.select")}
                        >
                          <ListChecks className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  {/* L'historique de CE document d'abord ; « Alle » montre tout,
                      avec le document de chaque conversation. */}
                  <div className="flex gap-1 px-3 pb-2">
                    {[false, true].map((all) => (
                      <button
                        key={all ? "all" : "scope"}
                        type="button"
                        aria-pressed={historyAll === all}
                        data-testid={all ? "history-all" : "history-scope"}
                        onClick={() => {
                          setHistoryAll(all);
                          exitSelect();
                        }}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          historyAll === all
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {all ? t("chat.historyAll") : activeDoc ? activeDocTitle || "…" : t("library.allScope")}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 pb-4">
                    {shownConvs.length === 0 ? (
                      <p className="text-muted-foreground px-2 py-8 text-center text-xs">
                        {historyAll || convList.length === 0 ? t("chat.noHistory") : t("chat.noHistoryScope")}
                      </p>
                    ) : (
                      <ul className="space-y-0.5" data-testid="history-list">
                        {shownConvs.map((c) => (
                          <li key={c.id}>
                            <div
                              className={cn(
                                "group hover:bg-accent flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
                                !selectMode && c.id === convId && "bg-accent",
                                selectMode && selectedIds.has(c.id) && "bg-accent",
                              )}
                            >
                              {selectMode ? (
                                <button
                                  onClick={() => toggleSelect(c.id)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  {selectedIds.has(c.id) ? (
                                    <CheckSquare className="text-primary size-4 shrink-0" />
                                  ) : (
                                    <Square className="text-muted-foreground size-4 shrink-0" />
                                  )}
                                  <span className="truncate text-sm">{c.title}</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => void openConversation(c.id)}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                  >
                                    <MessageSquare className="text-muted-foreground size-3.5 shrink-0" />
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm">{c.title}</span>
                                      {historyAll && (
                                        <span className="text-muted-foreground block truncate text-[11px]">
                                          {c.documentTitle || t("library.allScope")}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                  <button
                                    onClick={() => deleteConversation(c.id)}
                                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-label={t("chat.deleteConv")}
                                    title={t("chat.deleteConv")}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {!selectMode && (
                    <div className="border-border border-t p-3">
                      <Button
                        variant="ghost"
                        className="text-muted-foreground w-full justify-start gap-1.5"
                        onClick={() => setShowTrash(true)}
                      >
                        <Trash2 className="size-4" />
                        {t("chat.trash")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Scope bar — 95 % de crème : la page est une salle sombre (voile
            « vivid »), à 80 % la barre virait au gris et ses libellés gris
            perdaient leur contraste. */}
        <div className="border-border bg-background/95 flex h-12 items-center gap-2 border-b px-4 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            aria-label={t("chat.selectDoc")}
            onClick={() => setLibOpen(true)}
          >
            <Library className="size-4" />
          </Button>
          {/* Auf großen Bildschirmen klappt derselbe Platz die Kursliste weg. */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden shrink-0 lg:inline-flex"
            aria-label={railOpen ? t("chat.hideCourses") : t("chat.showCourses")}
            title={railOpen ? t("chat.hideCourses") : t("chat.showCourses")}
            aria-pressed={railOpen}
            onClick={() => setRailOpen((v) => !v)}
          >
            {railOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
          <span className="text-muted-foreground text-xs font-medium">{t("chat.scope")}:</span>
          <span className="bg-primary/10 text-primary flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
            <FileText className="size-3 shrink-0" />
            <span className="truncate">{scopeLabel}</span>
          </span>
          {/* Le Fach ne se choisit que si aucun document précis n'est ouvert :
              deux portées affichées en même temps ne se comprennent pas. */}
          {!activeDoc && chatSubjects.length > 0 && (
            <select
              value={chatSubject ?? ""}
              onChange={(e) => pickSubject(e.target.value || null)}
              data-testid="subject-select"
              aria-label={t("subjects.one")}
              className="border-border bg-background h-7 max-w-[11rem] rounded-full border px-2 text-xs"
            >
              <option value="">{t("subjects.wholeSemester")}</option>
              {chatSubjects.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          {activeDoc && (
            <button
              onClick={() => pickScope(null)}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              {t("chat.wholeScope")}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant={scratchOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={() => setScratchOpen((v) => !v)}
              aria-label={scratchOpen ? t("chat.closeScratchpad") : t("chat.openScratchpad")}
              aria-pressed={scratchOpen}
            >
              <NotebookPen className="size-4" />
              <span className="hidden sm:inline">{t("scratchpad.title")}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={newChat}
              aria-label={t("chat.newChat")}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t("chat.newChat")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setHistoryOpen(true)}
              aria-label={t("chat.history")}
            >
              <History className="size-4" />
            </Button>
          </div>
        </div>

        {/* Le Hörsaal : UNE scène plein cadre (components/hoersaal-stage.tsx).
            La Tafel prend toute la largeur et toute la hauteur ; le professeur
            flotte dessus (on le déplace au doigt) ; messages et saisie forment
            la barre flottante du bas, centrée, en verre dépoli. */}
        {/* data-ph-mask + ph-no-capture : la Tafel, les messages et la saisie
            ne partent JAMAIS dans l'analyse (texte masqué dans les
            enregistrements, aucun clic capturé avec son texte). */}
        <div data-ph-mask className="ph-no-capture flex min-h-0 flex-1 flex-col">
          <HoersaalStage
            bottomNav
            board={
              <ErrorBoundary area="tafel" variant="inline" label="Die Tafel konnte nicht angezeigt werden." resetKey={activePage?.id}>
                <SourceViewContext.Provider value={showSource}>
                <CitationContext.Provider value={citationContext}>
                <CodeExplainContext.Provider value={explainCode}>
                <CodeSendContext.Provider value={sendFromCode}>
                <TafelBoard
                  composer={composerRow}
                  composerExtras={composerExtras}
                  scopeBadge={scopeBadge}
                  loading={scopeLoading}
                  page={activePage}
                  writing={busy && onLastPage}
                  patience={t(patienceKey({ attachment: questionHasFiles, documents: scopeHasDocs }))}
                  status={
                    translating
                      ? t("chat.translating")
                      : busy && onLastPage
                        ? waitingForText
                          ? t(PHASE_KEY[phase])
                          : t("tafel.writing")
                        : undefined
                  }
                  pager={{
                    index: pageIndex,
                    count: pages.length,
                    onPrev: () => setBoardId(pages[Math.max(0, pageIndex - 1)]?.id ?? null),
                    onNext: () => setBoardId(pages[Math.min(pages.length - 1, pageIndex + 1)]?.id ?? null),
                  }}
                  // Les options A/B/C ne répondent que sur la dernière page.
                  onChoice={onLastPage && !busy ? (answer) => send(answer) : undefined}
                  chosen={chosenOnPage}
                  emptyExtra={
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestions.map((q) => (
                        <BoardChip key={q} icon={<Sparkles className="size-3.5" />} label={q} onClick={() => send(q)} />
                      ))}
                    </div>
                  }
                  notice={
                    onLastPage && (emptyAnswer || error) ? (
                      <div className="bg-card text-card-foreground ring-border space-y-2 rounded-xl p-4 shadow-sm ring-1">
                    {emptyAnswer && (
                      <div className="border-destructive/30 bg-destructive/5 flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                        <p className="text-destructive">{t("chat.emptyAnswer")}</p>
                        <button
                          type="button"
                          onClick={retryNow}
                          className="text-primary hover:bg-primary/10 rounded-md border border-current px-2 py-0.5 text-xs font-medium transition-colors"
                        >
                          {t("chat.retryNow")}
                        </button>
                      </div>
                    )}
                    {error && (
                      /* Trois refus distincts, trois messages distincts. Afficher
                         « la connexion a été interrompue » à quelqu'un dont le
                         forfait est épuisé lui fait croire à une panne — et il
                         s'en va au lieu de s'abonner. */
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {echec.kind === "quota" ? (
                          <>
                            <p className="text-foreground">
                              {echec.message || t("chat.quotaReached")}
                            </p>
                            {/* Vers /credits et non /pricing : quelqu'un bloqué en
                                pleine révision veut continuer ce soir, pas
                                s'engager au mois. La page des tarifs reste à un
                                clic de là. */}
                            <Link
                              href="/credits"
                              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                            >
                              {t("chat.topUpNow")}
                            </Link>
                            {paywallDismissed === error && (
                              <button
                                type="button"
                                onClick={() => setPaywallDismissed(null)}
                                className="text-primary hover:bg-primary/10 rounded-md border border-current px-2 py-0.5 text-xs font-medium transition-colors"
                              >
                                {adText.paywallReopen}
                              </button>
                            )}
                            <SmartPaywallModal
                              open={paywallOpen}
                              onClose={() => setPaywallDismissed(error ?? null)}
                              offer={echec.rewardedAd ?? null}
                              metric="chat"
                              used={echec.tokenCap ? undefined : echec.used}
                              limit={echec.tokenCap ? undefined : echec.limit}
                              onUnlocked={() => {
                                // +1 crédit en base : la question bloquée repart.
                                void qc.invalidateQueries({ queryKey: creditsMeKey() });
                                clearError();
                                void regenerate();
                              }}
                            />
                          </>
                        ) : echec.kind === "attachment" ? (
                          /* Pas de bouton « relancer » : le même fichier donnerait le même refus. */
                          <p className="text-destructive" data-testid="attachment-refused">
                            {t("chat.pdfTooLong", { name: refusedPdfName, pages: echec.pages ?? `> ${echec.max}`, max: echec.max })}
                          </p>
                        ) : (
                          <>
                            <p className="text-destructive">
                              {echec.kind === "rate"
                                ? echec.message || t("chat.tooFast")
                                : t("chat.error")}
                            </p>
                            {!busy && (
                              <button
                                type="button"
                                onClick={retryNow}
                                className="text-primary hover:bg-primary/10 rounded-md border border-current px-2 py-0.5 text-xs font-medium transition-colors"
                              >
                                {t("chat.retryNow")}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                      </div>
                    ) : undefined
                  }
                  footer={
                    activePage?.messageId && !(busy && onLastPage) ? (
                      <PageActions
                        // La QUESTION annonce-t-elle un modèle de l'Explorateur 3D (cœur, cellule, moteur…) ?
                        explorerModel={explorerModelFor(activePage.question ?? "")}
                        view3dLabel={t("chat.view3d")}
                        messageId={activePage.messageId}
                        fullText={displayText(messages.find((m) => m.id === activePage.messageId) ?? ({ parts: [] } as unknown as UIMessage))}
                        conversationId={convId}
                        locale={locale}
                        onAction={(a) => handleAction(activePage.messageId!, a)}
                        labels={{
                          why: t("chat.why"),
                          explain: t("chat.explainDifferently"),
                          engineer: t("chat.engineerMode"),
                          mission: t("chat.mission"),
                          // Masqués quand le serveur n'a pas la clé.
                          video: features.explainerVideo ? t("video.chip") : undefined,
                          ytsearch: features.videoSearch ? t("videoSearch.chip") : undefined,
                          quiz: features.quiz ? t("quiz.chip") : undefined,
                          flashcards: features.flashcards ? t("flashcards.chip") : undefined,
                        }}
                      />
                    ) : undefined
                  }
                />
                </CodeSendContext.Provider>
                </CodeExplainContext.Provider>
                </CitationContext.Provider>
                </SourceViewContext.Provider>
              </ErrorBoundary>
            }
          >
            {/* Le professeur flottant, posé sur le tableau : de dos pendant
                qu'il écrit, il se retourne à la fin du flux et lit sa réponse. */}
            <ErrorBoundary area="professor" variant="inline" label="Der Professor kann gerade nicht angezeigt werden.">
            <FloatingProfessor
              professor={professor}
              pose={choreo.pose}
              beat={choreo.beat}
              status={professorStatus}
              subtitle={professorText(professor.title, locale)}
              dragLabel={t("tafel.dragProfessor")}
              actions={
                <>
                  {choreo.pose === "erklaeren" ? (
                    <button
                      type="button"
                      onClick={choreo.stop}
                      title={t("tafel.stopVoice")}
                      aria-label={t("tafel.stopVoice")}
                      className="grid size-7 place-items-center rounded-full text-[#FACC15] transition-colors hover:bg-white/10"
                    >
                      <Square className="size-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => choreo.setAutoSpeak(!choreo.autoSpeak)}
                      aria-pressed={choreo.autoSpeak}
                      title={choreo.autoSpeak ? t("tafel.autoSpeakOn") : t("tafel.autoSpeakOff")}
                      aria-label={choreo.autoSpeak ? t("tafel.autoSpeakOn") : t("tafel.autoSpeakOff")}
                      className="grid size-7 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {choreo.autoSpeak ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                    </button>
                  )}
                  <Link
                    href="/professors"
                    draggable={false}
                    title={professorUi(locale).change}
                    aria-label={professorUi(locale).change}
                    className="grid size-7 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Repeat2 className="size-3.5" />
                  </Link>
                </>
              }
            />
            </ErrorBoundary>
          </HoersaalStage>
        </div>
      </div>

      {/* Scratchpad — desktop side panel (~40% → chat keeps ~60%) */}
      {scratchOpen && (
        <aside className="border-border bg-card hidden shrink-0 border-l lg:flex lg:w-[40%] xl:w-[38%]">
          <Scratchpad onSendToAi={sendScratchToAi} busy={busy} />
        </aside>
      )}

      {/* Scratchpad — mobile full-screen tab */}
      <AnimatePresence>
        {scratchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-background fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col lg:hidden"
          >
            <div className="border-border flex items-center justify-end border-b px-2 py-1.5">
              <button
                onClick={() => setScratchOpen(false)}
                className="text-muted-foreground hover:text-foreground grid size-8 place-items-center rounded-lg"
                aria-label={t("chat.closeScratchpad")}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Scratchpad
                onSendToAi={(txt) => {
                  sendScratchToAi(txt);
                  setScratchOpen(false);
                }}
                busy={busy}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera capture (getUserMedia) — capture, retake, then confirm */}
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={addCameraPhoto}
      />

      <DocumentViewer
        docId={sourceView?.docId ?? null}
        highlight={sourceView?.highlight ?? null}
        page={sourceView?.page ?? null}
        onClose={() => setSourceView(null)}
      />
      <ExplainerVideoDialog state={explainer} onClose={closeExplainer} onRetry={() => runExplainer(lastExplainerMessage.current)} />
      <AnimatePresence>
        {videoOpen && (
          <ErrorBoundary area="video" variant="inline" label="Das Erklärvideo konnte nicht angezeigt werden.">
          <VideoExplainer
            script={videoScript}
            loading={videoLoading}
            error={videoError}
            onClose={() => setVideoOpen(false)}
            onRetry={() => void runVideo(lastTopic.current)}
          />
          </ErrorBoundary>
        )}
        {ytOpen && (
          <VideoSearch
            hits={ytHits}
            query={ytQuery}
            loading={ytLoading}
            error={ytError}
            onClose={() => setYtOpen(false)}
            onRetry={() =>
              void runYoutube(lastYtTopic.current, lastYtQuestion.current)
            }
          />
        )}
      </AnimatePresence>
      <UnderstandingQuiz
        open={quizFor !== null}
        context={(() => {
          const end = messages.findIndex((m) => m.id === quizFor);
          return messages
            .slice(0, end + 1)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", text: displayText(m) }));
        })()}
        onClose={() => setQuizFor(null)}
        onReexplain={(prompt) => {
          if (!busy) send(prompt);
        }}
      />
    </div>
  );
}

type PageAction = "why" | "explain" | "engineer" | "mission" | "video" | "ytsearch" | "quiz" | "flashcards";

/**
 * Les gestes sous une page de la Tafel : écouter, « Pourquoi ? », autre
 * explication, quiz, cartes, vidéo — puis le drapeau de signalement, en
 * dernier et en gris (on le trouve quand on le cherche, pas du pouce).
 */
function PageActions({
  explorerModel,
  view3dLabel,
  messageId,
  fullText,
  conversationId,
  locale,
  onAction,
  labels,
}: {
  /** Le modèle 3D que la question annonce : un lien « In 3D ansehen » l'ouvre directement. */
  explorerModel: ExplorerModelId | null;
  view3dLabel: string;
  messageId: string;
  /** La réponse complète : lecture à voix haute et signalement. */
  fullText: string;
  conversationId?: string;
  locale: string;
  onAction: (a: PageAction) => void;
  labels: {
    why: string;
    explain: string;
    engineer: string;
    mission: string;
    video?: string;
    ytsearch?: string;
    quiz?: string;
    flashcards?: string;
  };
}) {
  if (!fullText.trim()) return null;
  return (
    <>
      <ListenButton text={fullText} locale={locale} />
      {explorerModel && (
        <Link
          to={`/explorer?model=${explorerModel}`}
          data-testid="view-3d"
          className="flex min-h-9 items-center gap-1.5 rounded-full bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#0F172A] ring-1 ring-[#EAB308] transition-transform hover:bg-[#FACC15] motion-safe:active:scale-[0.97]"
        >
          <Box className="size-3.5" />
          {view3dLabel}
        </Link>
      )}
      <BoardChip icon={<HelpCircle className="size-3.5" />} label={labels.why} onClick={() => onAction("why")} />
      <BoardChip icon={<RefreshCw className="size-3.5" />} label={labels.explain} onClick={() => onAction("explain")} />
      <BoardChip icon={<Cog className="size-3.5" />} label={labels.engineer} onClick={() => onAction("engineer")} />
      <BoardChip icon={<Target className="size-3.5" />} label={labels.mission} onClick={() => onAction("mission")} />
      {labels.quiz && <BoardChip icon={<ListChecks className="size-3.5" />} label={labels.quiz} onClick={() => onAction("quiz")} />}
      {labels.flashcards && (
        <BoardChip icon={<GalleryVerticalEnd className="size-3.5" />} label={labels.flashcards} onClick={() => onAction("flashcards")} />
      )}
      {labels.video && <BoardChip icon={<Clapperboard className="size-3.5" />} label={labels.video} onClick={() => onAction("video")} />}
      {labels.ytsearch && <BoardChip icon={<Youtube className="size-3.5" />} label={labels.ytsearch} onClick={() => onAction("ytsearch")} />}
      {conversationId && (
        <ReportAnswer conversationId={conversationId} messageId={messageId} text={fullText} locale={locale} />
      )}
    </>
  );
}
