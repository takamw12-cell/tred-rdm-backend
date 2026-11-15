import { Component, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cameraStart, GEAR, gearCentres, gearPitchPoint, type ExplorerModel, type ExplorerModelId, type Vec3 } from "@/lib/explorer-models";
import { cn } from "@/lib/utils";
import { ActiveContext, HIGHLIGHT, Part, SelectContext, Skin } from "@/components/explorer-kit";
import { Atom, Cell, GltfModel, Heart, Norms, Surface } from "@/components/explorer-scenes";

/**
 * La scène de l'Explorateur 3D — chargée À LA DEMANDE (React.lazy dans
 * pages/explorer.tsx) : Three.js pèse plusieurs centaines de Ko et ne doit
 * jamais partir avec le reste de l'app.
 *
 * Tout est construit ici, dans le navigateur, à partir de formes simples
 * (révolutions, boîtes, extrusions) : aucun fichier de modèle, aucune image,
 * aucune police téléchargés chez un tiers. L'éclairage est une boîte à
 * lumière générée sur place, comme pour les maquettes du tuteur
 * (Model3DViewer.tsx). Les textes ne sont pas dans la scène : les repères
 * sont de vrais boutons HTML posés sur le modèle (clavier, lecteur d'écran).
 */

const FOV = 35;


/* ── Briques ─────────────────────────────────────────────────────────────── */

/** Le quart de volume retiré pour voir l'intérieur : y > 0 et z > 0, côté caméra. */
const CUT = Math.PI * 1.5;

/**
 * Surface de révolution autour de l'axe du moteur (X), à partir d'un profil
 * [x, rayon]. `cut` : en coupe, le quart supérieur avant est ouvert.
 */
function revolveX(profile: [number, number][], cut = true): THREE.BufferGeometry {
  const points = profile.map(([x, r]) => new THREE.Vector2(r, x));
  const g = new THREE.LatheGeometry(points, cut ? 42 : 56, 0, cut ? CUT : Math.PI * 2);
  // Three.js révolutionne autour de Y : on couche l'axe sur X.
  g.rotateZ(-Math.PI / 2);
  return g;
}

/**
 * Les deux faces de coupe d'une paroi (profil FERMÉ) : sans elles, une paroi
 * coupée montre deux peaux et du vide entre les deux. La coupe retire le quart
 * y > 0, z > 0 : une face est dans le plan XY, l'autre dans le plan XZ.
 */
function sectionCaps(profile: [number, number][]): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([x, r]) => new THREE.Vector2(x, r)));
  const inXY = new THREE.ShapeGeometry(shape);
  const inXZ = inXY.clone().rotateX(Math.PI / 2);
  const merged = mergeGeometries([inXY, inXZ]) ?? inXY;
  inXZ.dispose();
  return merged;
}

/** Une couronne d'aubes : `count` lames du moyeu au sommet, calées d'un angle (et vrillées pour la soufflante). */
function bladeRow(o: { x: number; hub: number; tip: number; count: number; chord: number; thick: number; stagger: number; twist?: number }): THREE.BufferGeometry {
  const span = o.tip - o.hub;
  const blades: THREE.BufferGeometry[] = [];
  for (let k = 0; k < o.count; k++) {
    const g = new THREE.BoxGeometry(o.chord, span, o.thick, 1, o.twist ? 6 : 1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
      // Rotation autour de l'axe radial : le calage, plus fort en bout d'aube si elle est vrillée.
      const a = o.stagger + (o.twist ?? 0) * (y / span);
      p.setXYZ(i, x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a));
    }
    g.translate(0, o.hub + span / 2, 0);
    g.rotateX((k / o.count) * Math.PI * 2);
    g.translate(o.x, 0, 0);
    blades.push(g);
  }
  const merged = mergeGeometries(blades) ?? new THREE.BufferGeometry();
  for (const b of blades) b.dispose();
  merged.computeVertexNormals();
  return merged;
}

/** Valeur interpolée le long de l'axe, entre des jalons [x, valeur]. */
function along(keys: [number, number][], x: number): number {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i][0]) {
      const [x0, v0] = keys[i - 1];
      const [x1, v1] = keys[i];
      return v0 + ((v1 - v0) * (x - x0)) / (x1 - x0);
    }
  }
  return keys[keys.length - 1][1];
}

/* ── Turboréacteur double flux, deux arbres, en coupe ────────────────────── */

const STEEL = "#B9C2CC";
const TITANIUM = "#9FB0C2";
const HOT_METAL = "#B08D7A";

function buildTurbofan() {
  const rows = (xs: number[], f: (x: number, i: number) => Parameters<typeof bladeRow>[0]) => xs.map((x, i) => bladeRow(f(x, i)));
  const hpcX = [-1.05, -0.87, -0.69, -0.51, -0.33, -0.15, 0.03];
  const lptX = [1.5, 1.72, 1.94, 2.16];
  // Carters fixes, en coupe. Profils fermés : une paroi a une épaisseur.
  const NACELLE: [number, number][] = [[-3.0, 1.4], [-2.92, 1.5], [-2.4, 1.56], [-1.0, 1.55], [0.6, 1.46], [1.25, 1.36], [1.25, 1.32], [0.6, 1.38], [-1.0, 1.42], [-2.4, 1.4], [-2.9, 1.36], [-3.0, 1.4]];
  const COWL: [number, number][] = [[-2.1, 0.84], [-1.6, 0.93], [0.4, 0.96], [1.6, 0.95], [2.3, 0.82], [2.55, 0.7], [2.55, 0.66], [2.25, 0.78], [1.5, 0.67], [1.2, 0.67], [0.95, 0.72], [0.25, 0.72], [0.1, 0.64], [-1.1, 0.71], [-2.0, 0.77], [-2.1, 0.84]];
  const LINER: [number, number][] = [[0.22, 0.4], [0.3, 0.62], [0.86, 0.62], [0.96, 0.5], [0.86, 0.4], [0.22, 0.4]];
  return {
    nacelle: revolveX(NACELLE),
    nacelleCut: sectionCaps(NACELLE),
    cowl: revolveX(COWL),
    cowlCut: sectionCaps(COWL),
    liner: revolveX(LINER),
    flame: revolveX([[0.34, 0.45], [0.4, 0.57], [0.82, 0.57], [0.9, 0.5], [0.82, 0.45], [0.34, 0.45]]),
    plug: revolveX([[2.25, 0.3], [2.5, 0.26], [3.05, 0.0]], false),
    // Arbre basse pression : soufflante + compresseur BP + turbine BP.
    spinner: revolveX([[-2.98, 0.0], [-2.84, 0.13], [-2.62, 0.25], [-2.45, 0.3], [-2.28, 0.3], [-2.28, 0.0]], false),
    lpShaft: revolveX([[-2.3, 0.07], [2.3, 0.07]], false),
    boosterDrum: revolveX([[-2.06, 0.3], [-2.0, 0.42], [-1.36, 0.42], [-1.3, 0.3]], false),
    lptDrum: revolveX([[1.42, 0.3], [1.46, 0.4], [2.22, 0.4], [2.28, 0.26]], false),
    fan: bladeRow({ x: -2.45, hub: 0.3, tip: 1.35, count: 20, chord: 0.36, thick: 0.03, stagger: 0.5, twist: 0.7 }),
    booster: rows([-1.95, -1.7, -1.45], (x) => ({ x, hub: 0.42, tip: 0.7, count: 30, chord: 0.11, thick: 0.02, stagger: 0.6 })),
    lpt: rows(lptX, (x, i) => ({ x, hub: 0.4, tip: 0.6 + i * 0.045, count: 34, chord: 0.11, thick: 0.02, stagger: -0.6 })),
    // Arbre haute pression : compresseur HP + turbine HP.
    hpDrum: revolveX([[-1.15, 0.3], [-1.1, 0.36], [0.08, 0.46], [0.16, 0.3]], false),
    hptDrum: revolveX([[1.0, 0.3], [1.04, 0.44], [1.32, 0.44], [1.36, 0.3]], false),
    hpShaft: revolveX([[-1.15, 0.13], [1.36, 0.13]], false),
    hpc: rows(hpcX, (x, i) => ({ x, hub: 0.36 + i * 0.016, tip: 0.67 - i * 0.012, count: 32, chord: 0.085, thick: 0.016, stagger: 0.65 })),
    hpt: rows([1.08, 1.26], (x) => ({ x, hub: 0.44, tip: 0.63, count: 36, chord: 0.1, thick: 0.02, stagger: -0.65 })),
    // Aubages fixes (stators) : calés dans l'autre sens, ils ne tournent pas.
    stators: [
      ...rows(hpcX.slice(0, -1), (x, i) => ({ x: x + 0.09, hub: 0.38 + i * 0.016, tip: 0.68 - i * 0.012, count: 36, chord: 0.07, thick: 0.014, stagger: -0.5 })),
      ...rows([-1.825, -1.575], (x) => ({ x, hub: 0.44, tip: 0.72, count: 34, chord: 0.09, thick: 0.016, stagger: -0.5 })),
    ],
    vanes: rows([1.17, 1.39, 1.61, 1.83, 2.05], (x, i) => ({ x, hub: 0.44, tip: 0.63 + Math.max(0, i - 1) * 0.04, count: 34, chord: 0.085, thick: 0.016, stagger: 0.55 })),
    // Aubes de sortie de soufflante : elles redressent le flux secondaire.
    ogv: bladeRow({ x: -1.85, hub: 0.9, tip: 1.4, count: 26, chord: 0.2, thick: 0.02, stagger: -0.25 }),
  };
}

function Turbofan({ playing }: { playing: boolean }) {
  const g = useMemo(() => buildTurbofan(), []);
  const lp = useRef<THREE.Group>(null);
  const hp = useRef<THREE.Group>(null);
  const flame = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }, dt) => {
    if (!playing) return;
    const d = Math.min(dt, 0.05);
    // Deux arbres, deux régimes : N2 (haute pression) tourne plus vite que N1 (soufflante).
    if (lp.current) lp.current.rotation.x += d * 1.7;
    if (hp.current) hp.current.rotation.x += d * 3.8;
    if (flame.current) flame.current.opacity = 0.78 + 0.14 * Math.sin(clock.elapsedTime * 9) * Math.sin(clock.elapsedTime * 2.3);
  });
  return (
    <group>
      <Part id="bypass">
        <mesh geometry={g.nacelle}>
          <Skin part="bypass" color="#E9EEF4" metalness={0.25} roughness={0.42} />
        </mesh>
        {/* Faces de coupe : la couleur crème de TRED, comme une hachure. */}
        <mesh geometry={g.nacelleCut}>
          <Skin part="bypass" color="#F1E7CF" metalness={0} roughness={0.9} />
        </mesh>
        <mesh geometry={g.ogv}>
          <Skin part="bypass" color={TITANIUM} />
        </mesh>
      </Part>
      <Part id="nozzle">
        <mesh geometry={g.cowl}>
          <Skin part="nozzle" color="#5D6978" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh geometry={g.cowlCut}>
          <Skin part="nozzle" color="#D9CDB0" metalness={0} roughness={0.9} />
        </mesh>
        <mesh geometry={g.plug}>
          <Skin part="nozzle" color={HOT_METAL} metalness={0.7} roughness={0.4} />
        </mesh>
      </Part>
      <Part id="combustor">
        <mesh geometry={g.liner}>
          <Skin part="combustor" color="#7C4A2D" metalness={0.5} roughness={0.5} glow={{ color: "#FF6A00", intensity: 0.9 }} />
        </mesh>
        <mesh geometry={g.flame}>
          <meshBasicMaterial ref={flame} color="#FFB347" transparent opacity={0.85} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <pointLight position={[0.6, 0.45, 0.45]} color="#FF8A3D" intensity={2.2} distance={2.4} decay={2} />
      </Part>
      <Part id="compressor">
        {g.stators.map((s, i) => (
          <mesh key={i} geometry={s}>
            <Skin part="compressor" color="#7F8B99" />
          </mesh>
        ))}
      </Part>
      <Part id="turbine">
        {g.vanes.map((s, i) => (
          <mesh key={i} geometry={s}>
            <Skin part="turbine" color="#8C7466" />
          </mesh>
        ))}
      </Part>

      {/* Arbre basse pression (N1). */}
      <group ref={lp}>
        <Part id="fan">
          <mesh geometry={g.fan}>
            <Skin part="fan" color={TITANIUM} metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh geometry={g.spinner}>
            <Skin part="fan" color="#DDE3EA" metalness={0.4} roughness={0.35} />
          </mesh>
        </Part>
        <Part id="compressor">
          <mesh geometry={g.boosterDrum}>
            <Skin part="compressor" color="#6E7A88" />
          </mesh>
          {g.booster.map((s, i) => (
            <mesh key={i} geometry={s}>
              <Skin part="compressor" color={STEEL} />
            </mesh>
          ))}
        </Part>
        <Part id="turbine">
          <mesh geometry={g.lptDrum}>
            <Skin part="turbine" color="#7A6558" />
          </mesh>
          {g.lpt.map((s, i) => (
            <mesh key={i} geometry={s}>
              <Skin part="turbine" color={HOT_METAL} />
            </mesh>
          ))}
          <mesh geometry={g.lpShaft}>
            <Skin part="turbine" color="#4B5563" />
          </mesh>
        </Part>
      </group>

      {/* Arbre haute pression (N2). */}
      <group ref={hp}>
        <Part id="compressor">
          <mesh geometry={g.hpDrum}>
            <Skin part="compressor" color="#6E7A88" />
          </mesh>
          {g.hpc.map((s, i) => (
            <mesh key={i} geometry={s}>
              <Skin part="compressor" color={STEEL} />
            </mesh>
          ))}
        </Part>
        <Part id="turbine">
          <mesh geometry={g.hptDrum}>
            <Skin part="turbine" color="#7A6558" />
          </mesh>
          {g.hpt.map((s, i) => (
            <mesh key={i} geometry={s}>
              <Skin part="turbine" color="#C59A7E" />
            </mesh>
          ))}
          <mesh geometry={g.hpShaft}>
            <Skin part="turbine" color="#59616C" />
          </mesh>
        </Part>
      </group>

      <Airflow playing={playing} />
    </group>
  );
}

/* ── Le flux d'air : froid autour du cœur, de plus en plus chaud dedans ──── */

const COLD = new THREE.Color("#7DD3FC");
const HEAT: [number, THREE.Color][] = [
  [-1.1, new THREE.Color("#7DD3FC")],
  [0.1, new THREE.Color("#FDE68A")],
  [0.55, new THREE.Color("#FFD9A0")],
  [1.2, new THREE.Color("#FB923C")],
  [3.6, new THREE.Color("#F87171")],
];
function heatAt(x: number, out: THREE.Color): THREE.Color {
  if (x <= HEAT[0][0]) return out.copy(HEAT[0][1]);
  for (let i = 1; i < HEAT.length; i++) {
    if (x <= HEAT[i][0]) return out.copy(HEAT[i - 1][1]).lerp(HEAT[i][1], (x - HEAT[i - 1][0]) / (HEAT[i][0] - HEAT[i - 1][0]));
  }
  return out.copy(HEAT[HEAT.length - 1][1]);
}
/** Rayon intérieur et extérieur de chaque veine, le long de l'axe. */
const BYPASS_IN: [number, number][] = [[-3.4, 0.75], [-2.2, 0.95], [1.3, 1.0], [3.6, 0.95]];
const BYPASS_OUT: [number, number][] = [[-3.4, 1.3], [-2.2, 1.34], [1.3, 1.28], [3.6, 1.25]];
const CORE_IN: [number, number][] = [[-3.4, 0.2], [-2.2, 0.36], [-1.1, 0.4], [0.1, 0.5], [0.9, 0.46], [2.3, 0.42], [3.6, 0.1]];
const CORE_OUT: [number, number][] = [[-3.4, 0.7], [-2.2, 0.72], [-1.1, 0.66], [0.1, 0.6], [0.9, 0.6], [2.3, 0.74], [3.6, 0.5]];
const CORE_SPEED: [number, number][] = [[-3.4, 1.3], [-2.2, 1.5], [0.1, 0.9], [0.9, 1.1], [2.3, 2.3], [3.6, 3.2]];
const BYPASS_SPEED: [number, number][] = [[-3.4, 1.3], [-2.2, 1.9], [3.6, 2.1]];

function makeDot(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(c);
}

function Airflow({ playing }: { playing: boolean }) {
  const COUNT = 240;
  const { geometry, seeds } = useMemo(() => {
    const seeds = Array.from({ length: COUNT }, (_, i) => ({
      core: i % 3 === 0,
      x: -3.4 + (7 * ((i * 0.618034) % 1)),
      // Dans le quart ouvert de la coupe : c'est là qu'on regarde.
      theta: 0.14 + ((i * 0.754877) % 1) * (Math.PI / 2 - 0.28),
      lane: (i * 0.569840) % 1,
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    return { geometry, seeds };
  }, []);
  const dot = useMemo(() => makeDot(), []);
  const tint = useMemo(() => new THREE.Color(), []);

  const place = useCallback(() => {
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    seeds.forEach((s, i) => {
      const lo = along(s.core ? CORE_IN : BYPASS_IN, s.x);
      const hi = along(s.core ? CORE_OUT : BYPASS_OUT, s.x);
      const r = lo + (hi - lo) * s.lane;
      pos.setXYZ(i, s.x, r * Math.sin(s.theta), r * Math.cos(s.theta));
      const c = s.core ? heatAt(s.x, tint) : COLD;
      col.setXYZ(i, c.r, c.g, c.b);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }, [geometry, seeds, tint]);
  // Une première pose : même à l'arrêt, le flux est dessiné.
  useEffect(place, [place]);

  useFrame((_, dt) => {
    if (!playing) return;
    const d = Math.min(dt, 0.05);
    for (const s of seeds) {
      s.x += d * along(s.core ? CORE_SPEED : BYPASS_SPEED, s.x);
      if (s.x > 3.6) s.x = -3.4;
    }
    place();
  });

  return (
    <points geometry={geometry} raycast={() => null}>
      <pointsMaterial size={0.075} map={dot} vertexColors transparent depthWrite={false} sizeAttenuation blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
}

/* ── Engrenage droit, un étage ───────────────────────────────────────────── */

/** Profil d'une roue dentée (dents trapézoïdales : assez pour voir l'engrènement). */
function gearShape(z: number, bore: number, lightening: number): THREE.Shape {
  const m = GEAR.module;
  const r = (m * z) / 2;
  const [tip, root, tau] = [r + m, r - 1.25 * m, (2 * Math.PI) / z];
  const shape = new THREE.Shape();
  for (let k = 0; k < z; k++) {
    const c = k * tau;
    const corners: [number, number][] = [[root, c - 0.27 * tau], [tip, c - 0.13 * tau], [tip, c + 0.13 * tau], [root, c + 0.27 * tau]];
    corners.forEach(([rad, a], i) => {
      const [x, y] = [rad * Math.cos(a), rad * Math.sin(a)];
      if (k === 0 && i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const hole = (x: number, y: number, rad: number) => {
    const path = new THREE.Path();
    path.absarc(x, y, rad, 0, Math.PI * 2, true);
    shape.holes.push(path);
  };
  hole(0, 0, bore);
  // Évidements de la grande roue : moins de masse, même rigidité à la jante.
  for (let k = 0; k < lightening; k++) {
    const a = ((k + 0.5) / lightening) * Math.PI * 2;
    hole(r * 0.56 * Math.cos(a), r * 0.56 * Math.sin(a), r * 0.17);
  }
  return shape;
}

function gearGeometry(z: number, bore: number, lightening = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(gearShape(z, bore, lightening), { depth: GEAR.width, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 1, curveSegments: 20 });
  g.translate(0, 0, -GEAR.width / 2);
  return g;
}

/** Un cylindre couché sur l'axe Z (arbres et paliers). */
function alongZ(radius: number, length: number, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 40);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, z);
  return g;
}

function Gearbox({ playing }: { playing: boolean }) {
  const tooth2 = (2 * Math.PI) / GEAR.z2;
  const [r1, r2] = [(GEAR.module * GEAR.z1) / 2, (GEAR.module * GEAR.z2) / 2];
  const g = useMemo(
    () => ({
      pinion: gearGeometry(GEAR.z1, 0.16),
      wheel: gearGeometry(GEAR.z2, 0.26, 6),
      pinionShaft: alongZ(0.16, 2.2),
      wheelShaft: alongZ(0.26, 2.2),
      pinionBearings: [alongZ(0.3, 0.22, 0.85), alongZ(0.3, 0.22, -0.85)],
      wheelBearings: [alongZ(0.42, 0.22, 0.85), alongZ(0.42, 0.22, -0.85)],
      circle1: new THREE.TorusGeometry(r1, 0.012, 8, 96),
      circle2: new THREE.TorusGeometry(r2, 0.012, 8, 128),
    }),
    [r1, r2],
  );
  const pinion = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const meshOn = useContext(ActiveContext) === "mesh";

  const pose = useCallback(() => {
    // Le pignon a une dent face à la roue ; la roue lui présente un creux (demi-pas),
    // et tourne en sens inverse, z₁/z₂ fois moins vite : les dents restent en prise.
    if (pinion.current) pinion.current.rotation.z = angle.current;
    if (wheel.current) wheel.current.rotation.z = tooth2 / 2 - angle.current * (GEAR.z1 / GEAR.z2);
  }, [tooth2]);
  useEffect(pose, [pose]);
  useFrame((_, dt) => {
    if (!playing) return;
    angle.current += Math.min(dt, 0.05) * 1.1;
    pose();
  });

  const ring = (
    <meshBasicMaterial color={HIGHLIGHT} transparent opacity={meshOn ? 1 : 0.4} toneMapped={false} />
  );
  return (
    <group>
      <group position={gearCentres.pinion}>
        <group ref={pinion}>
          <Part id="pinion">
            <mesh geometry={g.pinion}>
              <Skin part="pinion" color="#C9A548" metalness={0.8} roughness={0.3} />
            </mesh>
          </Part>
          <Part id="shaft">
            <mesh geometry={g.pinionShaft}>
              <Skin part="shaft" color="#59616C" metalness={0.7} roughness={0.35} />
            </mesh>
          </Part>
        </group>
        <Part id="shaft">
          {g.pinionBearings.map((b, i) => (
            <mesh key={i} geometry={b}>
              <Skin part="shaft" color="#2F3640" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </Part>
        <mesh geometry={g.circle1} position={[0, 0, GEAR.width / 2 + 0.03]} raycast={() => null}>
          {ring}
        </mesh>
      </group>

      <group position={gearCentres.wheel}>
        <group ref={wheel}>
          <Part id="wheel">
            <mesh geometry={g.wheel}>
              <Skin part="wheel" color="#B4BCC5" metalness={0.65} roughness={0.34} />
            </mesh>
          </Part>
          <Part id="shaft">
            <mesh geometry={g.wheelShaft}>
              <Skin part="shaft" color="#59616C" metalness={0.7} roughness={0.35} />
            </mesh>
          </Part>
        </group>
        <Part id="shaft">
          {g.wheelBearings.map((b, i) => (
            <mesh key={i} geometry={b}>
              <Skin part="shaft" color="#2F3640" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </Part>
        <mesh geometry={g.circle2} position={[0, 0, GEAR.width / 2 + 0.03]} raycast={() => null}>
          {ring}
        </mesh>
      </group>

      {/* Le point primitif : là où les deux cercles primitifs se touchent. */}
      <mesh position={[gearPitchPoint[0], 0, GEAR.width / 2 + 0.03]} raycast={() => null}>
        <sphereGeometry args={[meshOn ? 0.07 : 0.045, 20, 20]} />
        <meshBasicMaterial color={HIGHLIGHT} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── Repères, caméra, lumière ────────────────────────────────────────────── */

/**
 * Les repères sont de vrais boutons HTML, posés PAR-DESSUS le canvas (clavier,
 * lecteur d'écran, cible tactile). Ce composant, dans la scène, ne dessine
 * rien : à chaque image il projette la position de chaque repère à l'écran et
 * déplace son bouton. (Le composant Html de drei faisait la même chose avec sa propre
 * racine React, qui levait « removeChild » au changement de modèle.)
 */
function MarkerTracker({ model, buttons, onCompact }: { model: ExplorerModel; buttons: React.RefObject<(HTMLButtonElement | null)[]>; onCompact: (compact: boolean) => void }) {
  const point = useMemo(() => new THREE.Vector3(), []);
  const width = useThree((s) => s.size.width);
  useEffect(() => onCompact(width < 520), [width, onCompact]);
  useFrame(({ camera, size }) => {
    model.hotspots.forEach((h, i) => {
      const el = buttons.current[i];
      if (!el) return;
      point.set(h.position[0], h.position[1], h.position[2]).project(camera);
      // Derrière la caméra : le repère n'a pas de place à l'écran.
      const visible = point.z < 1;
      el.style.visibility = visible ? "visible" : "hidden";
      if (visible) el.style.transform = `translate(-50%, -50%) translate(${((point.x + 1) / 2) * size.width}px, ${((1 - point.y) / 2) * size.height}px)`;
    });
  });
  return null;
}

function Markers({ model, active, onSelect, labels, buttons, compact }: { model: ExplorerModel; active: string | null; onSelect: (id: string | null) => void; labels: Record<string, string>; buttons: React.RefObject<(HTMLButtonElement | null)[]>; compact: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {model.hotspots.map((h, i) => {
        const on = active === h.id;
        return (
          <button
            key={`${model.id}:${h.id}`}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            data-testid={`hotspot-${h.id}`}
            aria-label={labels[h.id]}
            aria-pressed={on}
            onClick={() => onSelect(on ? null : h.id)}
            style={{ visibility: "hidden" }}
            // Petit écran : repères plus petits pour ne pas se recouvrir (la liste à côté offre des cibles de 44 px).
            className={cn("group pointer-events-auto absolute top-0 left-0 grid place-items-center rounded-full focus-visible:outline-none", compact ? "size-6" : "size-9", on && "z-10")}
          >
            <span aria-hidden className={cn("absolute rounded-full motion-safe:animate-ping", compact ? "size-5" : "size-7", on ? "bg-[#EAB308]/60" : "bg-white/35")} />
            <span
              className={cn(
                "relative grid place-items-center rounded-full font-bold shadow-lg ring-2 transition-transform group-hover:scale-110 group-focus-visible:ring-4",
                compact ? "size-5 text-[10px]" : "size-7 text-xs",
                on ? "bg-[#EAB308] text-[#0F172A] ring-white" : "bg-[#0F172A]/90 text-white ring-[#EAB308]",
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "pointer-events-none absolute top-full mt-0.5 rounded-full bg-[#0F172A]/90 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow",
                // Écran tactile : pas de survol — une étiquette « collée » après un toucher couvrirait le repère voisin.
                on ? "block" : compact ? "hidden" : "hidden group-hover:block group-focus-visible:block",
              )}
            >
              {labels[h.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type Controls = { target: THREE.Vector3; update: () => void };

/** Cadre le modèle (au départ, au changement de modèle, sur « Ansicht zurücksetzen ») et glisse vers le repère choisi. */
function Rig({ model, focus, onResetReady }: { model: ExplorerModel; focus: Vec3 | null; onResetReady: (reset: () => void) => void }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const portrait = useThree((s) => s.size.width < s.size.height);
  const size = useThree((s) => s.size);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const wanted = useMemo(() => new THREE.Vector3(), []);

  const frame = useCallback(() => {
    const { width, height } = sizeRef.current;
    const [x, y, z] = cameraStart(model, width / Math.max(height, 1), FOV);
    camera.position.set(x, y, z);
    controls?.target.set(0, 0, 0);
    controls?.update();
    invalidate();
  }, [camera, controls, invalidate, model]);

  // Tourner le téléphone recadre ; redimensionner une fenêtre ne défait pas la vue choisie.
  useEffect(frame, [frame, portrait]);
  useEffect(() => onResetReady(frame), [frame, onResetReady]);

  useFrame((_, dt) => {
    if (!controls) return;
    // Vers le repère, sans y coller : le modèle reste dans le cadre.
    wanted.set(focus ? focus[0] * 0.45 : 0, focus ? focus[1] * 0.45 : 0, focus ? focus[2] * 0.45 : 0);
    if (controls.target.distanceToSquared(wanted) < 1e-6) return;
    controls.target.lerp(wanted, 1 - Math.exp(-5 * Math.min(dt, 0.05)));
    controls.update();
    invalidate();
  });
  return null;
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[-3, 5, 6]} intensity={1.7} />
      <directionalLight position={[5, 2, -4]} intensity={0.6} color="#9CC8FF" />
      {/* Boîte à lumière d'atelier, construite dans le navigateur : aucun fichier HDR. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 6]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[-7, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[7, 2, 0]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" color="#EAB308" intensity={0.7} position={[0, 4, -6]} scale={3} />
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

/** Une scène par modèle livré. Un modèle venu d'un fichier (`modelUrl`) n'en a pas besoin. */
const SCENES: Record<ExplorerModelId, ComponentType<{ playing: boolean }>> = {
  turbofan: Turbofan,
  gearbox: Gearbox,
  cell: Cell,
  heart: Heart,
  surface: Surface,
  atom: Atom,
  norms: Norms,
};

export default function Explorer3D({
  model,
  modelUrl,
  active,
  onSelect,
  playing,
  labels,
  label,
  noWebGL,
  onResetReady,
}: {
  model: ExplorerModel;
  /** Un fichier .glb à charger À LA PLACE de la scène construite (public/models/). */
  modelUrl?: string | null;
  /** Le repère choisi, ou aucun. */
  active: string | null;
  onSelect: (id: string | null) => void;
  /** Les pièces tournent et l'air s'écoule. À l'arrêt, la scène n'est redessinée que si la vue change. */
  playing: boolean;
  /** Le nom de chaque repère, dans la langue de l'étudiant. */
  labels: Record<string, string>;
  /** Description accessible de la scène. */
  label: string;
  /** Message si le navigateur n'a pas WebGL. */
  noWebGL: string;
  onResetReady: (reset: () => void) => void;
}) {
  const focus = model.hotspots.find((h) => h.id === active)?.position ?? null;
  const Scene = SCENES[model.id === "custom" ? "turbofan" : model.id];
  const select = useCallback((id: string) => onSelect(id), [onSelect]);
  const resetRef = useRef(onResetReady);
  resetRef.current = onResetReady;
  const onReady = useCallback((fn: () => void) => resetRef.current(fn), []);
  const fallback = <div className="grid h-full place-items-center p-6 text-center text-sm text-white/80">{noWebGL}</div>;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [compact, setCompact] = useState(false);
  // Le curseur « main » ne doit pas survivre à la scène.
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  return (
    <WebGLBoundary fallback={fallback}>
      {/* Le canvas ne se lit pas : sa description, pour les lecteurs d'écran. */}
      <p className="sr-only">{label}</p>
      <Canvas
        frameloop={playing ? "always" : "demand"}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: model.camera, fov: FOV, near: 0.1, far: 120 }}
        fallback={fallback}
        // Un doigt fait tourner, deux doigts zooment : la page ne défile pas sous la scène.
        style={{ touchAction: "none" }}
        data-testid="explorer-canvas"
      >
        <ActiveContext.Provider value={active}>
          <SelectContext.Provider value={select}>
            <StudioLights />
            {modelUrl ? (
              <Suspense fallback={null}>
                <GltfModel url={modelUrl} />
              </Suspense>
            ) : (
              <Scene playing={playing} />
            )}
            <MarkerTracker model={model} buttons={buttons} onCompact={setCompact} />
            <Rig model={model} focus={focus} onResetReady={onReady} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} enablePan={false} minDistance={3.2} maxDistance={26} rotateSpeed={0.8} />
          </SelectContext.Provider>
        </ActiveContext.Provider>
      </Canvas>
      <Markers model={model} active={active} onSelect={onSelect} labels={labels} buttons={buttons} compact={compact} />
    </WebGLBoundary>
  );
}
