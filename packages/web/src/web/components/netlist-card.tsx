import { useMemo, useState } from "react";
import katex from "katex";
import { AlertTriangle, Check, CircuitBoard, PencilLine, ShieldCheck } from "lucide-react";
import { useT } from "@/i18n";
import {
  layoutGraph,
  NETLIST_EVENT,
  parseNetlistBlock,
  parseProofBlock,
  terminalsOf,
  valueLabel,
  type NetlistEventDetail,
} from "@/lib/netlist-block";
import { layoutSchematic } from "@/lib/schematic-layout";
import { SchematicSvg } from "@/components/schematic-drawing";
import type { ProofEquation } from "../../api/lib/circuit/proof";

export { NETLIST_LANG, PROOF_LANG, netlistBlockFromPart, proofBlockFromPart } from "@/lib/netlist-block";

/**
 * Chaîne « Schaltplan → Netzliste → Gleichungen → Probe » sur la Tafel.
 *
 *   NetlistCard : ce que TRED a lu dans le schéma (tableau + graphe des
 *     nœuds, dessinés par le code), à confirmer avant tout calcul.
 *   ProofCard   : les équations de Kirchhoff remplies avec les valeurs
 *     exactes et le verdict de la probe en fractions.
 *
 * Les couleurs suivent l'encre de la Tafel (currentColor, --board-*) : la
 * carte se lit sur les trois fonds, comme sur le thème clair hors Tafel.
 */

const tex = (latex: string, display = false) =>
  katex.renderToString(latex, { throwOnError: false, strict: false, trust: false, displayMode: display });

function send(detail: NetlistEventDetail) {
  window.dispatchEvent(new CustomEvent<NetlistEventDetail>(NETLIST_EVENT, { detail }));
}

export function NetlistCard({ code }: { code: string }) {
  const { t } = useT();
  const view = useMemo(() => parseNetlistBlock(code), [code]);
  const graph = useMemo(() => (view ? layoutGraph(view) : null), [view]);
  // Le schéma comme sur la photo, quand la lecture a donné la place des composants.
  const drawing = useMemo(() => (view ? layoutSchematic(view) : null), [view]);
  const free = new Set(view?.frei ?? []);
  const shown = (el: (typeof view & object)["elemente"][number]) => (free.has(el.name) ? "?" : valueLabel(el));
  const [sent, setSent] = useState(false);
  if (!view || !graph) return null;
  const warnings = [...view.unklar, ...view.hinweise];

  return (
    <section data-slot="netlist-card" aria-label={t("netlist.title")} className="my-4 rounded-xl border border-current/20 p-4">
      <header className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h3 className="flex items-center gap-1.5 text-base font-semibold">
          <CircuitBoard className="size-4" aria-hidden />
          {t("netlist.title")}
        </h3>
        <span className="font-mono text-xs opacity-70">{view.id}</span>
      </header>
      <p className="mb-3 text-sm opacity-80">{t("netlist.intro")}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-3 font-medium">{t("netlist.part")}</th>
              <th className="py-1 pr-3 font-medium">{t("netlist.between")}</th>
              <th className="py-1 font-medium">{t("netlist.value")}</th>
            </tr>
          </thead>
          <tbody>
            {view.elemente.map((el) => (
              <tr key={el.name} className="border-t border-current/15">
                <td className="py-1 pr-3 font-semibold">{el.name}</td>
                <td className="py-1 pr-3 font-mono text-xs">{terminalsOf(el).join(" – ")}</td>
                <td className="py-1">{shown(el)}</td>
              </tr>
            ))}
            {(view.schalter ?? []).map((s) => (
              <tr key={`sw-${s.name}`} className="border-t border-current/15">
                <td className="py-1 pr-3 font-semibold">{s.name}</td>
                <td className="py-1 pr-3 font-mono text-xs" colSpan={2}>
                  {s.stellungen.map((p) => `${p.name}: ${s.gemeinsam} – ${p.kontakt}`).join("   ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drawing ? (
        <SchematicSvg drawing={drawing} label={t("netlist.graph")} valueOf={(name) => { const el = view.elemente.find((e) => e.name === name); return el ? shown(el) : ""; }} />
      ) : (
      <svg
        role="img"
        aria-label={t("netlist.graph")}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        className="mx-auto my-3 block h-auto w-full max-w-[520px]"
      >
        {graph.edges.map((e) => (
          <g key={e.name}>
            <path d={e.path} fill="none" stroke="currentColor" strokeWidth={2} opacity={0.75} />
            <text x={e.lx} y={e.ly - 2} textAnchor="middle" fontSize={13} fontWeight={600} fill="currentColor">
              {e.name}
            </text>
            <text x={e.lx} y={e.ly + 12} textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.8}>
              {e.label}
            </text>
          </g>
        ))}
        {graph.nodes.map((n) => (
          <g key={n.name}>
            <circle cx={n.x} cy={n.y} r={n.ground ? 7 : 6} fill="currentColor" />
            {n.ground && <path d={`M${n.x - 14},${n.y + 14} h28 M${n.x - 9},${n.y + 19} h18 M${n.x - 4},${n.y + 24} h8`} stroke="currentColor" strokeWidth={2} />}
            <text x={n.x + (n.ground ? 22 : 0)} y={n.ground ? n.y + 4 : n.y - 12} textAnchor={n.ground ? "start" : "middle"} fontSize={12} fill="currentColor">
              {n.name}
            </text>
          </g>
        ))}
      </svg>
      )}

      {warnings.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm">
          {view.unklar.map((w) => (
            <li key={`u-${w}`} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--board-accent,#b45309)]" aria-hidden />
              <span>
                <strong>{t("netlist.unclear")}:</strong> {w}
              </span>
            </li>
          ))}
          {view.hinweise.map((w) => (
            <li key={`h-${w}`} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--board-accent,#b45309)]" aria-hidden />
              <span>
                <strong>{t("netlist.check")}:</strong> {w}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Avec un interrupteur, rien à confirmer : le calcul se fait par position. */}
        {!view.schalter?.length && <button
          type="button"
          disabled={sent}
          onClick={() => {
            setSent(true);
            send({ action: "confirm", text: t("netlist.confirmText", { id: view.id }) });
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#EAB308] px-3 text-sm font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none disabled:opacity-60"
        >
          <Check className="size-4" aria-hidden />
          {sent ? t("netlist.confirmed") : t("netlist.confirm")}
        </button>}
        <button
          type="button"
          disabled={sent}
          onClick={() => send({ action: "fix", text: t("netlist.fixText", { id: view.id }) })}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-current/40 px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none disabled:opacity-60"
        >
          <PencilLine className="size-4" aria-hidden />
          {t("netlist.fix")}
        </button>
      </div>
    </section>
  );
}

function EquationList({ title, items }: { title: string; items: ProofEquation[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <h4 className="mb-1 text-sm font-semibold">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((e) => (
          <li key={`${e.gesetz}-${e.ort}`} className="flex items-start gap-2 overflow-x-auto text-sm">
            <span className="w-10 shrink-0 font-mono text-xs opacity-70">{e.ort}</span>
            {/* LaTeX écrit par le code (noms réduits à [A-Za-z0-9]), KaTeX sans trust. */}
            <span className="min-w-0" dangerouslySetInnerHTML={{ __html: tex(e.latex) }} />
            {e.erfuellt ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--board-check,#16a34a)]" aria-label="✓" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-label="✗" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProofCard({ code }: { code: string }) {
  const { t } = useT();
  const payload = useMemo(() => parseProofBlock(code), [code]);
  if (!payload) return null;
  const b = payload.beweis;
  return (
    <section data-slot="proof-card" aria-label={t("netlist.proofTitle")} className="my-4 rounded-xl border border-current/20 p-4">
      <header className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="flex items-center gap-1.5 text-base font-semibold">
          <ShieldCheck className="size-4" aria-hidden />
          {t("netlist.proofTitle")}
        </h3>
        {payload.netzliste_id && <span className="font-mono text-xs opacity-70">{payload.netzliste_id}</span>}
      </header>
      <p className="mt-1 text-sm">
        {b.exakt ? (b.bestanden ? t("netlist.proofExact", { n: b.geprueft }) : t("netlist.proofFailed")) : t("netlist.proofNumeric", { grund: b.grund })}
      </p>
      {b.exakt && (
        <>
          <EquationList title={`${t("netlist.kcl")} (ΣI = 0)`} items={b.knoten} />
          <EquationList title={`${t("netlist.kvl")} (ΣU = 0)`} items={b.maschen} />
          <EquationList title={t("netlist.ohm")} items={b.ohm} />
        </>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">{t("netlist.laws")}</summary>
        <ul className="mt-1 space-y-1">
          {b.gesetze.map((l) => (
            <li key={l.id} className="flex flex-wrap gap-x-2">
              <span>{l.name}:</span>
              <span dangerouslySetInnerHTML={{ __html: tex(l.formel) }} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
