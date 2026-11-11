import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { solveMechanicsSafe } from "../../api/lib/mechanics-solver";
import { payloadToProblem } from "../../api/lib/beam-tool";
import { parseBeamPayload, renderBeamSvg } from "@/lib/beam-svg";
import { SvgDiagramFrame } from "./diagram-frame";

export { BEAM_LANG, beamBlockFromPart, dropDuplicateBeamCharts } from "@/lib/beam-svg";

/**
 * Skizze + Q(x) + M(x) d'une poutre, dessinés PAR LE CODE.
 *
 * Chaîne complète :
 *   outil `balkenstatik` (serveur) → partie « tool-balkenstatik » du message
 *   → `beamBlockFromPart()` l'écrit en bloc ```balkendiagramm dans le texte
 *   → <MarkdownContent> → <BeamDiagram> → solveMechanicsSafe() ICI, même module que
 *   le serveur → SVG.
 *
 * Le modèle n'écrit pas un seul chiffre de ce dessin. Et comme le bloc vit
 * dans le texte, il survit à la sauvegarde, au rechargement et à la
 * traduction sans rien changer à la base.
 */

/* -------------------------------------------------------------------------- */
/* Composant                                                                  */
/* -------------------------------------------------------------------------- */

export function BeamDiagram({ code }: { code: string }) {
  const svg = useMemo(() => {
    const payload = parseBeamPayload(code);
    if (!payload) return null;
    const r = solveMechanicsSafe(payloadToProblem(payload.problem));
    return r.ok ? renderBeamSvg(payload, r) : null;
  }, [code]);

  if (!svg) {
    return (
      <div className="border-border bg-secondary/40 my-3 rounded-xl border p-3">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" /> Skizze konnte nicht gezeichnet werden
        </div>
      </div>
    );
  }
  return <SvgDiagramFrame svg={svg} name="balken" background="white" />;
}
