import { Component, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Environment, Lightformer, OrbitControls, useBounds } from "@react-three/drei";
import {
  boundsOf,
  planModel,
  type Axis,
  type ExtrudePlan,
  type HoleMarkerPlan,
  type MaterialName,
  type Model3D,
  type Outline,
  type PrimitivePlan,
} from "@/lib/model3d";

/**
 * Le rendu Three.js d'une maquette ```3d-json — chargé À LA DEMANDE
 * (React.lazy dans model3d-block.tsx) : Three.js pèse plusieurs centaines de
 * Ko, et l'immense majorité des réponses n'a pas de maquette.
 *
 * Rien de ce que le modèle écrit n'est exécuté : il ne fournit que des
 * nombres, validés par lib/model3d.ts. Les géométries sont construites ici.
 *
 * Éclairage « atelier » : un environnement de Lightformers généré dans le
 * navigateur — aucun fichier HDR téléchargé (les préréglages de drei
 * chargent leurs images depuis un CDN tiers).
 */

const MATERIAL: Record<MaterialName, { color: string; metalness: number; roughness: number; emissive?: string }> = {
  steel: { color: "#B4BCC5", metalness: 0.55, roughness: 0.38 },
  aluminium: { color: "#D3D8DE", metalness: 0.6, roughness: 0.28 },
  brass: { color: "#C9A548", metalness: 0.8, roughness: 0.3 },
  plastic: { color: "#2F3640", metalness: 0.05, roughness: 0.65 },
  accent: { color: "#EAB308", metalness: 0.35, roughness: 0.35, emissive: "#3a2a00" },
};

const SEGMENTS = 64;

function outlineShape(o: Outline): THREE.Shape {
  const shape = new THREE.Shape();
  if (o.kind === "rect") {
    const [hw, hh] = [o.width / 2, o.height / 2];
    shape.moveTo(o.u - hw, o.v - hh);
    shape.lineTo(o.u + hw, o.v - hh);
    shape.lineTo(o.u + hw, o.v + hh);
    shape.lineTo(o.u - hw, o.v + hh);
    shape.closePath();
  } else if (o.kind === "circle") {
    shape.absarc(o.u, o.v, o.r, 0, Math.PI * 2, false);
  } else {
    const r = o.across / Math.sqrt(3); // rayon du cercle circonscrit
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      const [x, y] = [o.u + r * Math.cos(a), o.v + r * Math.sin(a)];
      if (k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
  }
  return shape;
}

/** Extrusion en +Z puis rotation vers l'axe — l'inverse exact de `toPlane`. */
function orientExtrusion(g: THREE.BufferGeometry, axis: Axis) {
  if (axis === "y") g.rotateX(-Math.PI / 2);
  else if (axis === "x") g.rotateY(Math.PI / 2);
}

/** Les primitives Three.js naissent sur l'axe Y (cône) ou Z (tore). */
function orientFromY(g: THREE.BufferGeometry, axis: Axis) {
  if (axis === "x") g.rotateZ(-Math.PI / 2);
  else if (axis === "z") g.rotateX(Math.PI / 2);
}

function extrudeGeometry(p: ExtrudePlan): THREE.BufferGeometry {
  const shape = outlineShape(p.outline);
  for (const h of p.holes) {
    const path = new THREE.Path();
    path.absarc(h.u, h.v, h.r, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.to - p.from, bevelEnabled: false, curveSegments: SEGMENTS });
  g.translate(0, 0, p.from);
  orientExtrusion(g, p.axis);
  return g;
}

function primitiveGeometry(p: PrimitivePlan): THREE.BufferGeometry {
  const s = p.solid;
  let g: THREE.BufferGeometry;
  if (s.type === "cone") {
    g = new THREE.CylinderGeometry(s.radiusTop, s.radiusBottom, s.height, SEGMENTS);
    orientFromY(g, s.axis);
  } else if (s.type === "sphere") {
    g = new THREE.SphereGeometry(s.radius, SEGMENTS, SEGMENTS / 2);
  } else {
    g = new THREE.TorusGeometry(s.radius, s.tube, 24, SEGMENTS);
    // Tore : axe Z par défaut.
    if (s.axis === "y") g.rotateX(Math.PI / 2);
    else if (s.axis === "x") g.rotateY(Math.PI / 2);
  }
  g.translate(...s.position);
  return g;
}

function markerGeometry(p: HoleMarkerPlan, fallbackLength: number): THREE.BufferGeometry {
  const h = p.hole;
  const g = new THREE.CylinderGeometry(h.radius, h.radius, h.depth ?? fallbackLength, SEGMENTS, 1, true);
  orientFromY(g, h.axis);
  g.translate(...h.position);
  return g;
}

function Part({ geometry, material }: { geometry: THREE.BufferGeometry; material: MaterialName }) {
  const m = MATERIAL[material];
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={m.color} metalness={m.metalness} roughness={m.roughness} emissive={m.emissive ?? "#000000"} />
      <Edges threshold={25} color="#1A1A1A" />
    </mesh>
  );
}

function Scene({ model, onReady }: { model: Model3D; onReady: (reset: () => void) => void }) {
  const { size } = useMemo(() => boundsOf(model), [model]);
  const items = useMemo(() => {
    const plan = planModel(model);
    return plan.map((p, i) => {
      if (p.kind === "extrude") return { key: `e${i}`, geometry: extrudeGeometry(p), material: p.material, marker: false };
      if (p.kind === "primitive") return { key: `p${i}`, geometry: primitiveGeometry(p), material: p.solid.material, marker: false };
      return { key: `h${i}`, geometry: markerGeometry(p, size * 0.6), material: "plastic" as MaterialName, marker: true };
    });
  }, [model, size]);

  return (
    <>
      {items.map((it) =>
        it.marker ? (
          <mesh key={it.key} geometry={it.geometry}>
            <meshBasicMaterial color="#1A1A1A" transparent opacity={0.35} side={THREE.DoubleSide} />
          </mesh>
        ) : (
          <Part key={it.key} geometry={it.geometry} material={it.material} />
        ),
      )}
      <ResetBridge onReady={onReady} />
    </>
  );
}

/** Donne au bouton « Ansicht zurücksetzen » (hors du canvas) l'accès au cadrage. */
function ResetBridge({ onReady }: { onReady: (reset: () => void) => void }) {
  const bounds = useBounds();
  useEffect(() => onReady(() => bounds.refresh().clip().fit()), [bounds, onReady]);
  return null;
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
      {/* Boîte à lumière d'atelier, construite dans le navigateur. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 5, -6]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" color="#EAB308" intensity={0.6} position={[0, 4, 6]} scale={3} />
      </Environment>
    </>
  );
}

class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Model3DViewer({
  model,
  label,
  noWebGL,
  onResetReady,
}: {
  model: Model3D;
  /** Description accessible du canvas. */
  label: string;
  /** Message si le navigateur n'a pas WebGL. */
  noWebGL: string;
  onResetReady: (reset: () => void) => void;
}) {
  const { min, max, size } = useMemo(() => boundsOf(model), [model]);
  const s = Math.max(size, 1);
  const centre: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const resetRef = useRef(onResetReady);
  resetRef.current = onResetReady;
  const onReady = useCallback((fn: () => void) => resetRef.current(fn), []);
  const fallback = <div className="text-muted-foreground grid h-full place-items-center p-4 text-center text-sm">{noWebGL}</div>;

  return (
    <WebGLBoundary fallback={fallback}>
      {/* Le canvas ne se lit pas : sa description, pour les lecteurs d'écran. */}
      <p className="sr-only">{label}</p>
      <Canvas
        // Le rendu ne tourne que quand la vue change : batterie et ventilateur.
        frameloop="demand"
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [centre[0] + s * 1.3, centre[1] + s * 0.9, centre[2] + s * 1.5], fov: 35, near: s / 200, far: s * 200 }}
        fallback={fallback}
      >
        <StudioLights />
        <Bounds fit clip observe margin={1.25}>
          <Scene model={model} onReady={onReady} />
        </Bounds>
        <ContactShadows position={[centre[0], min[1] - s * 0.002, centre[2]]} scale={s * 2.5} far={s} blur={2.4} opacity={0.35} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={s * 0.2} maxDistance={s * 12} />
      </Canvas>
    </WebGLBoundary>
  );
}
