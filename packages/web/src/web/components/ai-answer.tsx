import { createContext, useContext, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookMarked,
  Sparkles,
  Cog,
  ChevronLeft,
  ChevronRight,
  Quote,
} from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { MathText } from "@/components/math-text";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

// Lets an [[OFFICIAL]] block's citation open the source document, scrolled to
// and highlighting the exact passage the tutor quoted. Provided by the chat
// page (which owns the DocumentViewer); null when no viewer is available.
export const SourceViewContext = createContext<
  ((opts: { excerpt: string; docTitle?: string | null }) => void) | null
>(null);

// A verbatim course citation the tutor attached to an [[OFFICIAL]] block.
type Citation = { excerpt: string; docTitle: string | null };

// [[QUELLE doc="Titel" seite=12]]exact excerpt[[/QUELLE]]  (attrs optional)
// Tolerant gegenüber Groß-/Kleinschreibung, Leerzeichen und fehlendem
// Schlusstag — ein Modell schreibt Marker nicht immer perfekt, und eine roh
// sichtbare Marker-Zeile im Text ist für die Studierenden schlicht kaputt.
const CITE_RE =
  /\[\[\s*QUELLE([^\]]*)\]\]([\s\S]*?)(?:\[\[\s*\/\s*QUELLE\s*\]\]|$)/gi;

// Letzte Absicherung: entfernt jeden übrig gebliebenen [[...]]-Marker
// (unbekannte Namen, verwaiste Schlusstags) aus dem sichtbaren Text.
const STRAY_MARKER_RE = /\[\[\s*\/?\s*[A-Za-zÄÖÜäöü]+[^\]]*\]\]/g;

export function stripStrayMarkers(text: string): string {
  return text.replace(STRAY_MARKER_RE, "").replace(/\n{3,}/g, "\n\n");
}

// Pull citation markers out of an official block: returns the display text
// (markers removed) and the collected citations.
function extractCitations(text: string): { clean: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const clean = text.replace(CITE_RE, (_full, attrs: string, body: string) => {
    const docMatch = /doc\s*=\s*"([^"]*)"/i.exec(attrs);
    const excerpt = body.trim();
    if (excerpt) citations.push({ excerpt, docTitle: docMatch?.[1]?.trim() || null });
    return "";
  });
  return { clean: stripStrayMarkers(clean).trim(), citations };
}

// ── Parsing ────────────────────────────────────────────────────────────────
// The agent wraps grounded course content, its own completions and its
// step-by-step reasoning in machine-readable markers. We split the raw text
// into typed segments so each can be rendered with a distinct visual identity.
type Segment =
  | { kind: "plain"; text: string }
  | { kind: "official"; text: string }
  | { kind: "aerostudy"; text: string }
  | { kind: "reasoning"; text: string };

const BLOCK_RE =
  /\[\[\s*(OFFICIAL|AEROSTUDY|REASONING)\s*\]\]([\s\S]*?)(?:\[\[\s*\/\s*\1\s*\]\]|$)/gi;

export function parseAnswer(raw: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of raw.matchAll(BLOCK_RE)) {
    const start = m.index ?? 0;
    if (start > last) {
      const before = raw.slice(last, start);
      const cleanBefore = stripStrayMarkers(before);
      if (cleanBefore.trim()) segments.push({ kind: "plain", text: cleanBefore });
    }
    // Der Marker darf klein geschrieben sein — normalisieren statt verwerfen.
    const tag = (m[1] ?? "").toUpperCase();
    const body = m[2] ?? "";
    const kind =
      tag === "OFFICIAL" ? "official" : tag === "AEROSTUDY" ? "aerostudy" : "reasoning";
    if (body.trim()) segments.push({ kind, text: body.trim() });
    last = start + m[0].length;
  }
  if (last < raw.length) {
    const rest = stripStrayMarkers(raw.slice(last));
    if (rest.trim()) segments.push({ kind: "plain", text: rest });
  }
  // No markers at all → render as a single plain segment.
  if (segments.length === 0 && raw.trim())
    segments.push({ kind: "plain", text: stripStrayMarkers(raw) });
  return segments;
}

// ── Renderer ─────────────────────────────────────────────────────────────
export function AiAnswer({ text }: { text: string }) {
  const segments = parseAnswer(text);
  return (
    <div className="space-y-3">
      {segments.map((s, i) => {
        if (s.kind === "plain") return <MarkdownContent key={i} content={s.text} />;
        if (s.kind === "official") return <SourceCard key={i} variant="official" text={s.text} />;
        if (s.kind === "aerostudy")
          return <SourceCard key={i} variant="aerostudy" text={s.text} />;
        return <ReasoningStepper key={i} text={s.text} />;
      })}
    </div>
  );
}

function SourceCard({ variant, text }: { variant: "official" | "aerostudy"; text: string }) {
  const { t } = useT();
  const official = variant === "official";
  const showSource = useContext(SourceViewContext);
  const { clean, citations } = official
    ? extractCitations(text)
    : { clean: text, citations: [] as Citation[] };

  // Randmarkierung statt Kasten: Inhalt aus dem eigenen Skript bekommt den
  // gelben Markerstrich der Marke, eigene Herleitungen des Tutors nur eine
  // ruhige Linie. Der Unterschied muss auf einen Blick lesbar sein — er ist
  // der Grund, warum TRED kein allgemeiner Chat ist.
  return (
    <div
      className={cn(
        "border-l-2 py-0.5 pl-3.5",
        official ? "border-signature" : "border-border",
      )}
    >
      <div className="label-tech flex items-center gap-1.5">
        {official ? <BookMarked className="size-3" /> : <Sparkles className="size-3" />}
        {official ? t("chat.officialLabel") : t("chat.aerostudyLabel")}
      </div>
      <div className="pt-1.5">
        <MarkdownContent content={clean} />
        {official && citations.length > 0 && showSource && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((cite, i) => (
              <button
                key={i}
                onClick={() =>
                  showSource({ excerpt: cite.excerpt, docTitle: cite.docTitle })
                }
                title={cite.excerpt}
                className="border-border text-muted-foreground hover:border-signature hover:text-foreground inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors"
              >
                <Quote className="size-3 shrink-0" />
                <span className="truncate">{t("viewer.showSource")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Step = { title: string; body: string };

/**
 * Das Modell schreibt die Rechnung oft direkt in die @@STEP-Titelzeile
 * ("@@STEP: $$M_{max} = …$$"). Eine abgesetzte Formel gehört aber nicht in eine
 * Überschrift — sonst steht sie als roher LaTeX-Quelltext da. Sie wandert
 * deshalb in den Rumpf, wo MarkdownContent sie mit KaTeX setzt. Kurze
 * Inline-Formeln ($…$) bleiben im Titel und werden dort gerendert.
 */
function splitTitle(rawTitle: string): { title: string; extra: string } {
  const at = rawTitle.indexOf("$$");
  if (at === -1) return { title: rawTitle, extra: "" };
  const head = rawTitle
    .slice(0, at)
    .replace(/[·:—–\-\s]+$/u, "")
    .trim();
  return { title: head, extra: rawTitle.slice(at).trim() };
}

function parseSteps(text: string): Step[] {
  const parts = text.split(/^\s*@@STEP:\s*/m).filter((p) => p.trim());
  return parts.map((p) => {
    const nl = p.indexOf("\n");
    const rawTitle = (nl === -1 ? p : p.slice(0, nl)).trim();
    const rawBody = nl === -1 ? "" : p.slice(nl + 1).trim();
    const { title, extra } = splitTitle(rawTitle);
    const body = [extra, rawBody].filter(Boolean).join("\n\n");
    return { title, body };
  });
}

function ReasoningStepper({ text }: { text: string }) {
  const { t } = useT();
  const steps = parseSteps(text);
  const [idx, setIdx] = useState(0);
  if (steps.length === 0) return null;
  const clamped = Math.min(idx, steps.length - 1);
  const step = steps[clamped];

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      <div className="bg-secondary/60 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wide uppercase">
        <Cog className="size-3.5" />
        {t("chat.reasoningLabel")}
      </div>

      {/* Step dots */}
      <div className="flex flex-wrap gap-1 px-3 pt-2">
        {steps.map((s, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            title={s.title}
            className={cn(
              "h-1.5 flex-1 min-w-4 rounded-full transition-colors",
              i === clamped ? "bg-primary" : i < clamped ? "bg-primary/40" : "bg-border",
            )}
          />
        ))}
      </div>

      <div className="px-3 py-2">
        <p className="text-primary mb-1 text-xs font-semibold">
          {t("chat.stepOf", { n: clamped + 1, total: steps.length })}
          {step.title && (
            <>
              {" · "}
              <MathText text={step.title} />
            </>
          )}
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={clamped}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            <MarkdownContent content={step.body} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="border-border flex items-center justify-between border-t px-3 py-1.5">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={clamped === 0}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" />
          {t("chat.prev")}
        </button>
        <button
          onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
          disabled={clamped === steps.length - 1}
          className="text-primary flex items-center gap-1 text-xs font-medium disabled:opacity-40"
        >
          {t("chat.next")}
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
