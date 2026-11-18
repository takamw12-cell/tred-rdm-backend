import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2, X } from "lucide-react";
import { useT } from "@/i18n";
import { MATH_PALETTE, formulaToken } from "@/lib/math-input";

/**
 * Le champ de formule du Hörsaal (bouton « fx »).
 *
 * MathLive (paquet officiel `mathlive`, MIT) : l'étudiant tape ou choisit un
 * symbole, la formule se compose sous ses yeux ; sur téléphone, MathLive
 * ouvre son clavier mathématique. « Einfügen » (ou Entrée) pose la formule
 * dans la question sous la forme `$…$` ; l'app l'affiche ensuite avec KaTeX,
 * comme toutes les formules du tuteur.
 *
 * MathLive n'est chargé qu'à la première ouverture (≈ 800 Ko) : le Hörsaal
 * ne pèse rien de plus pour qui ne tape pas de formule. Ses polices sont les
 * fichiers du paquet, servis par notre origine ; ses sons sont coupés. Rien
 * n'est envoyé à un tiers, et rien ne part au serveur avant l'envoi de la
 * question.
 */

interface MathFieldLike extends HTMLElement {
  value: string;
  executeCommand: (command: unknown) => boolean;
}

// <math-field> est un élément personnalisé (défini par MathLive au chargement) : on le déclare à React.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": {
        ref?: (element: MathFieldLike | null) => void;
        style?: CSSProperties;
        "aria-label"?: string;
        "data-testid"?: string;
        /** « auto » : MathLive ouvre son clavier mathématique sur les écrans tactiles. */
        "math-virtual-keyboard-policy"?: "auto" | "manual" | "sandboxed";
      };
    }
  }
}

const FIELD_STYLE: CSSProperties = { display: "block", width: "100%", fontSize: "1.25rem", border: "none", outline: "none", background: "transparent", color: "#0F172A" };

let loading: Promise<void> | null = null;
function loadMathLive(): Promise<void> {
  loading ??= (async () => {
    const [{ MathfieldElement }] = await Promise.all([import("mathlive"), import("mathlive/fonts.css")]);
    // Les polices viennent de la feuille importée ci-dessus (fichiers du bundle) ; aucun son.
    MathfieldElement.fontsDirectory = null;
    MathfieldElement.soundsDirectory = null;
  })();
  return loading;
}

export function MathInput({ onInsert, onClose }: { onInsert: (latex: string) => void; onClose: () => void }) {
  const { t } = useT();
  // Le champ, une fois monté (référence par rappel : il n'existe qu'après le chargement de MathLive).
  const [field, setField] = useState<MathFieldLike | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [latex, setLatex] = useState("");

  useEffect(() => {
    let alive = true;
    loadMathLive().then(
      () => alive && setReady(true),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const insert = () => {
    const value = field?.value ?? latex;
    if (!formulaToken(value)) return;
    onInsert(value);
  };
  // Les gestes du clavier lisent toujours la dernière version, sans réabonner le champ.
  const actions = useRef({ insert, close: onClose });
  useEffect(() => {
    actions.current = { insert, close: onClose };
  });

  useEffect(() => {
    if (!field) return;
    const onInput = () => setLatex(field.value);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        actions.current.insert();
      } else if (e.key === "Escape") {
        e.preventDefault();
        actions.current.close();
      }
    };
    field.addEventListener("input", onInput);
    field.addEventListener("keydown", onKey);
    field.focus();
    return () => {
      field.removeEventListener("input", onInput);
      field.removeEventListener("keydown", onKey);
    };
  }, [field]);

  return (
    <div
      data-slot="math-input"
      data-testid="math-input"
      // Verre clair et encre fixe, comme la saisie : le rebord du tableau est clair dans les deux thèmes.
      className="mb-2 rounded-2xl border border-white/60 bg-white/85 p-2.5 text-[#0F172A] shadow-[0_10px_30px_-12px_rgb(15_23_42/0.35)] backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-xl border border-[#0F172A]/15 bg-white px-2 py-1">
          {failed ? (
            <p className="py-1.5 text-sm text-[#991B1B]">{t("math.failed")}</p>
          ) : ready ? (
            <math-field
              ref={setField}
              data-testid="math-field"
              aria-label={t("math.fieldLabel")}
              math-virtual-keyboard-policy="auto"
              style={FIELD_STYLE}
            />
          ) : (
            <p className="flex items-center gap-2 py-1.5 text-sm text-[#0F172A]/70">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t("math.loading")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={insert}
          disabled={!formulaToken(latex)}
          data-testid="math-insert"
          className="h-9 shrink-0 rounded-xl bg-[#0F172A] px-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {t("math.insert")}
        </button>
        <button type="button" onClick={onClose} aria-label={t("math.close")} title={t("math.close")} className="grid size-9 shrink-0 place-items-center rounded-xl text-[#0F172A]/70 hover:bg-[#0F172A]/10 hover:text-[#0F172A]">
          <X className="size-4" />
        </button>
      </div>
      {ready && !failed ? (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5" role="toolbar" aria-label={t("math.palette")}>
          {MATH_PALETTE.map((key) => (
            <button
              key={key.name}
              type="button"
              title={key.name}
              aria-label={key.name}
              // Le champ garde le curseur : un bouton qui prend le focus fermerait le clavier du téléphone.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!field) return;
                field.executeCommand(["insert", key.insert, { focus: true, selectionMode: "placeholder" }]);
                setLatex(field.value);
              }}
              className="h-8 min-w-9 shrink-0 rounded-lg border border-[#0F172A]/12 bg-white px-2 text-sm font-medium text-[#0F172A] hover:bg-[#0F172A]/8"
            >
              {key.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
