import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { X, MessagesSquare } from "lucide-react";
import { PageHeader, Reveal } from "@/components/page";
import { ConceptBadge } from "@/components/concept-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n";
import type { Locale } from "@/i18n/types";
import { dnaNodes, dnaEdges, type DnaNodeData } from "@/data/dna";
import type { KnowState } from "@/stores/learning";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/api";
import { masteryFor, type GapLike, type MasteryState } from "@/lib/mastery";
import { pick } from "@/data/localized";

/**
 * Carte de maîtrise : la couleur d'un nœud vient des lacunes RÉELLES que le
 * tuteur a diagnostiquées (lib/mastery.ts), plus d'un état écrit en dur.
 */
const stateStyles: Record<MasteryState, string> = {
  mastered: "border-mastered/70 bg-mastered/10 text-foreground",
  weak: "border-red-500/70 bg-red-500/10 text-foreground",
  untested: "border-border bg-card text-muted-foreground",
};
const stateDot: Record<MasteryState, string> = {
  mastered: "bg-mastered",
  weak: "bg-red-500",
  untested: "bg-new",
};
const BADGE_STATE: Record<MasteryState, KnowState> = {
  mastered: "mastered",
  weak: "learning",
  untested: "new",
};
const LEGEND_TEXT = {
  de: { mastered: "Gemeistert", weak: "Offene Lücke", untested: "Noch nicht geprüft", gaps: "Offene Lücken", fixed: "Geschlossen", none: "Der Tutor hat hier noch nichts geprüft. Stell eine Frage dazu im Chat." },
  en: { mastered: "Mastered", weak: "Open gap", untested: "Not checked yet", gaps: "Open gaps", fixed: "Closed", none: "The tutor hasn't checked this yet. Ask about it in the chat." },
  fr: { mastered: "Maîtrisé", weak: "Lacune ouverte", untested: "Pas encore vérifié", gaps: "Lacunes ouvertes", fixed: "Résolues", none: "Le tuteur n'a encore rien vérifié ici. Pose une question dans le chat." },
};

type ConceptData = Omit<DnaNodeData, "state" | "mastery"> & {
  state: MasteryState;
  mastery: number;
  open: GapLike[];
  resolved: GapLike[];
  locale: Locale;
};
type FlowNode = Node<ConceptData>;

function ConceptNode({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className={cn(
        "min-w-[150px] rounded-xl border-2 px-3 py-2 shadow-sm transition-all",
        stateStyles[data.state],
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary/60 !border-0" />
      <div className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", stateDot[data.state])} />
        <span className="text-xs font-bold leading-tight">{data.label}</span>
      </div>
      <p className="text-muted-foreground mt-1 text-[10px]">{pick(data.category, data.locale)}</p>
      <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
        <div className="brand-gradient h-full rounded-full" style={{ width: `${data.mastery}%` }} />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary/60 !border-0" />
    </div>
  );
}

export default function DnaPage() {
  const { t, locale } = useT();
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<ConceptData | null>(null);
  const lt = LEGEND_TEXT[locale === "de" || locale === "fr" ? locale : "en"];
  // Toutes les lacunes, ouvertes ET résolues : la carte montre le progrès.
  const gapsQuery = useQuery(orpc.memory.list.queryOptions({ input: { includeResolved: true } }));
  const gaps = useMemo(() => gapsQuery.data ?? [], [gapsQuery.data]);

  const nodeTypes = useMemo(() => ({ concept: ConceptNode }), []);

  const nodes: FlowNode[] = useMemo(
    () =>
      dnaNodes.map((n) => ({
        id: n.id,
        type: "concept",
        position: n.position,
        data: { ...n.data, ...masteryFor(n.data.label, gaps), locale },
      })),
    [locale, gaps],
  );

  const edges: Edge[] = useMemo(
    () =>
      dnaEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: "var(--primary)", strokeOpacity: 0.35 },
      })),
    [],
  );

  const onNodeClick = useCallback((_: unknown, node: FlowNode) => {
    setSelected(node.data);
  }, []);

  const legend: { state: MasteryState; label: string }[] = [
    { state: "mastered", label: lt.mastered },
    { state: "weak", label: lt.weak },
    { state: "untested", label: lt.untested },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col px-4 py-5 sm:px-6">
      <PageHeader title={t("dna.title")} subtitle={t("dna.subtitle")} />

      <Reveal className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
        >
          <Background gap={20} className="!bg-secondary/30" />
          <Controls showInteractive={false} className="!shadow-sm" />
        </ReactFlow>

        {/* Legend */}
        <div className="bg-background/85 border-border absolute top-3 left-3 z-10 rounded-xl border p-3 backdrop-blur-md">
          <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wide uppercase">
            {t("dna.legend")}
          </p>
          <div className="space-y-1.5">
            {legend.map((l) => (
              <div key={l.state} className="flex items-center gap-2 text-xs">
                <span className={cn("size-2.5 rounded-full", stateDot[l.state])} />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="bg-background/95 border-border absolute top-3 right-3 bottom-3 z-10 w-72 overflow-y-auto rounded-xl border p-4 shadow-lg backdrop-blur-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-bold leading-tight">{selected.label}</h3>
                  <p className="text-muted-foreground text-xs">{pick(selected.category, locale)}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-lg p-1"
                  aria-label={t("common.close")}
                >
                  <X className="size-4" />
                </button>
              </div>
              <ConceptBadge state={BADGE_STATE[selected.state]} />
              <p className="mt-3 text-sm leading-relaxed">{pick(selected.description, locale)}</p>
              {selected.state === "untested" ? (
                <p className="text-muted-foreground mt-4 text-xs">{lt.none}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">{t("dna.mastery")}</span>
                      <span className="tabular-nums font-semibold">{selected.mastery}%</span>
                    </div>
                    <Progress value={selected.mastery} />
                  </div>
                  {selected.open.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold text-red-600">{lt.gaps}</p>
                      <ul className="space-y-1 text-xs">
                        {selected.open.map((g) => (
                          <li key={g.label} className="rounded-md bg-red-500/10 px-2 py-1">{g.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selected.resolved.length > 0 && (
                    <div>
                      <p className="text-mastered mb-1 text-xs font-semibold">{lt.fixed}</p>
                      <ul className="space-y-1 text-xs">
                        {selected.resolved.map((g) => (
                          <li key={g.label} className="bg-mastered/10 rounded-md px-2 py-1 line-through decoration-1">{g.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <Button
                size="sm"
                className="brand-gradient mt-5 w-full text-white"
                onClick={() => navigate("/chat")}
              >
                <MessagesSquare className="size-4" />
                {t("dna.openInChat")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </div>
  );
}
