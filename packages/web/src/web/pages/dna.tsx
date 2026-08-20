import { useCallback, useMemo, useState } from "react";
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

const stateStyles: Record<KnowState, string> = {
  mastered: "border-mastered/60 bg-mastered/10 text-foreground",
  learning: "border-learning/60 bg-learning/10 text-foreground",
  new: "border-border bg-card text-muted-foreground",
};
const stateDot: Record<KnowState, string> = {
  mastered: "bg-mastered",
  learning: "bg-learning",
  new: "bg-new",
};

type FlowNode = Node<DnaNodeData & { locale: Locale }>;

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
      <p className="text-muted-foreground mt-1 text-[10px]">{data.category[data.locale]}</p>
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
  const [selected, setSelected] = useState<DnaNodeData | null>(null);

  const nodeTypes = useMemo(() => ({ concept: ConceptNode }), []);

  const nodes: FlowNode[] = useMemo(
    () =>
      dnaNodes.map((n) => ({
        id: n.id,
        type: "concept",
        position: n.position,
        data: { ...n.data, locale },
      })),
    [locale],
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

  const legend: { state: KnowState; key: string }[] = [
    { state: "mastered", key: "states.mastered" },
    { state: "learning", key: "states.learning" },
    { state: "new", key: "states.new" },
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
                {t(l.key)}
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
                  <p className="text-muted-foreground text-xs">{selected.category[locale]}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 rounded-lg p-1"
                  aria-label={t("common.close")}
                >
                  <X className="size-4" />
                </button>
              </div>
              <ConceptBadge state={selected.state} />
              <p className="mt-3 text-sm leading-relaxed">{selected.description[locale]}</p>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">{t("dna.mastery")}</span>
                  <span className="tabular-nums font-semibold">{selected.mastery}%</span>
                </div>
                <Progress value={selected.mastery} />
              </div>
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
