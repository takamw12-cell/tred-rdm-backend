import { Component, Suspense, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ActiveContext, HIGHLIGHT, Part, SelectContext, Skin } from "@/components/explorer-kit";
import { EXPLORER_MODELS, TURBOFAN_FILE } from "@/lib/explorer-models";
import { ATOM_SHELLS, descend, HEART_GLB, HEART_PART_OF, NORM_LEVELS, SURFACE, surfaceGradient, surfaceHeight, surfacePoint } from "@/lib/explorer-more";
import { ORBITALS, sampleOrbital } from "@/lib/orbitals";
import { APP_Z, NETWORK_NODES } from "@/lib/explorer-network";
import { draggedSinceDown } from "@/lib/tap-guard";
import { machinedMetalShader } from "@/components/explorer-effects";

/**
 * Les scènes des autres filières (2026-11-15) : cellule, cœur, surface
 * mathématique, atome, pyramide des normes — et le chargeur de fichiers .glb.
 * Comme le turboréacteur, tout est construit sur place à partir de formes
 * simples : rien n'est téléchargé chez un tiers.
 */

/* ── Médecine : la cellule animale, ouverte par le haut ──────────────────── */
export function Cell({ playing }: { playing: boolean }) {
  const mito = useRef<THREE.Group>(null);
  const ribosomes = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 160; i++) {
      const a = i * 2.39996;
      const r = 0.55 + 1.25 * ((i * 0.618) % 1);
      const y = -0.25 - 1.1 * ((i * 0.377) % 1);
      if (r * r + y * y < 1.75 * 1.75) pts.push(r * Math.cos(a), y, r * Math.sin(a));
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useFrame(({ clock }) => {
    if (!playing || !mito.current) return;
    mito.current.children.forEach((c, i) => {
      c.position.y = c.userData.y + 0.05 * Math.sin(clock.elapsedTime * 1.4 + i * 2);
    });
  });
  const MITO: [number, number, number, number][] = [[1.1, -0.5, 0.6, 0.6], [-0.2, -0.9, -1.2, 2.1], [0.9, -0.8, -0.8, 1.2]];
  return (
    <group>
      <Part id="membrane">
        <mesh>
          <sphereGeometry args={[2, 56, 28, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <Skin part="membrane" color="#F4A9A0" metalness={0.05} roughness={0.55} />
        </mesh>
        {/* L'épaisseur de la membrane, sur la tranche. */}
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.86, 2, 64]} />
          <Skin part="membrane" color="#E2725B" metalness={0} roughness={0.7} />
        </mesh>
      </Part>
      {/* Le cytoplasme : translucide, non cliquable. */}
      <mesh raycast={() => null} rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <circleGeometry args={[1.86, 64]} />
        <meshStandardMaterial color="#FCE7D6" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <points geometry={ribosomes} raycast={() => null}>
        <pointsMaterial size={0.035} color="#7C2D12" sizeAttenuation />
      </points>
      <Part id="nucleus">
        <mesh position={[0, -0.3, 0]}>
          <sphereGeometry args={[0.7, 40, 28]} />
          <Skin part="nucleus" color="#7E57C2" metalness={0.1} roughness={0.5} />
        </mesh>
        <mesh position={[0.2, 0.22, 0.28]}>
          <sphereGeometry args={[0.2, 24, 18]} />
          <Skin part="nucleus" color="#4527A0" metalness={0.1} roughness={0.5} />
        </mesh>
      </Part>
      <Part id="er">
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, -0.42 + i * 0.07, 0]} rotation-x={-Math.PI / 2} rotation-z={Math.PI * 0.62}>
            <torusGeometry args={[0.92 + i * 0.13, 0.045, 8, 40, Math.PI * 0.75]} />
            <Skin part="er" color="#4FA3E0" metalness={0.1} roughness={0.5} />
          </mesh>
        ))}
      </Part>
      <Part id="golgi">
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[-0.3, -0.55 + i * 0.09, 1.08]} rotation-x={-Math.PI / 2} rotation-z={Math.PI * 1.12} scale={[1, 1, 0.5]}>
            <torusGeometry args={[0.4 - i * 0.03, 0.045, 8, 28, Math.PI * 0.75]} />
            <Skin part="golgi" color="#9BCB5A" metalness={0.1} roughness={0.5} />
          </mesh>
        ))}
      </Part>
      <group ref={mito}>
        {MITO.map(([x, y, z, turn], i) => (
          <group key={i} position={[x, y, z]} rotation={[0.2, turn, Math.PI / 2]} userData={{ y }}>
            <Part id="mitochondrion">
              <mesh>
                <capsuleGeometry args={[0.17, 0.42, 8, 18]} />
                <Skin part="mitochondrion" color="#F28C28" metalness={0.1} roughness={0.5} />
              </mesh>
            </Part>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ── Médecine : le cœur, schématique ─────────────────────────────────────── */
const BLUE = "#3B82C4";
const RED = "#D64545";

function tube(points: [number, number, number][], radius: number): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 40, radius, 18, false);
}

function HeartSchematic({ playing }: { playing: boolean }) {
  const ventricles = useRef<THREE.Group>(null);
  const atria = useRef<THREE.Group>(null);
  const g = useMemo(
    () => ({
      aorta: tube([[0.35, 0.1, 0.05], [0.2, 1.1, 0.12], [0.5, 1.68, 0.05], [1.1, 1.5, -0.2], [1.25, 0.7, -0.35]], 0.21),
      pulmonary: tube([[-0.3, 0.05, 0.35], [-0.1, 0.95, 0.38], [-0.6, 1.3, 0.22], [-1.3, 1.2, 0.1]], 0.17),
      cavaTop: tube([[-0.95, 0.75, -0.05], [-1.0, 1.9, -0.1]], 0.17),
      cavaBottom: tube([[-0.95, 0.2, -0.1], [-1.05, -1.6, -0.25]], 0.17),
      veins: tube([[1.9, 0.9, -0.3], [0.9, 0.7, -0.25]], 0.11),
    }),
    [],
  );
  useFrame(({ clock }) => {
    if (!playing) return;
    // Les oreillettes se contractent juste avant les ventricules (≈ 66 battements par minute).
    const t = (clock.elapsedTime * 1.1) % 1;
    const beat = (at: number) => 1 - 0.07 * Math.exp(-Math.pow((t - at) / 0.07, 2));
    atria.current?.scale.setScalar(beat(0.18));
    ventricles.current?.scale.setScalar(beat(0.38));
  });
  return (
    <group>
      <group ref={atria}>
        <Part id="right-atrium">
          <mesh position={[-0.72, 0.5, 0]} scale={[0.6, 0.55, 0.55]}>
            <sphereGeometry args={[1, 36, 24]} />
            <Skin part="right-atrium" color={BLUE} metalness={0.05} roughness={0.45} />
          </mesh>
          <mesh geometry={g.cavaTop}>
            <Skin part="right-atrium" color="#2F6DA8" metalness={0.05} roughness={0.5} />
          </mesh>
          <mesh geometry={g.cavaBottom}>
            <Skin part="right-atrium" color="#2F6DA8" metalness={0.05} roughness={0.5} />
          </mesh>
        </Part>
        <Part id="left-atrium">
          <mesh position={[0.72, 0.6, -0.1]} scale={[0.56, 0.5, 0.5]}>
            <sphereGeometry args={[1, 36, 24]} />
            <Skin part="left-atrium" color={RED} metalness={0.05} roughness={0.45} />
          </mesh>
          <mesh geometry={g.veins}>
            <Skin part="left-atrium" color="#B83A3A" metalness={0.05} roughness={0.5} />
          </mesh>
        </Part>
      </group>
      <group ref={ventricles}>
        <Part id="right-ventricle">
          <mesh position={[-0.48, -0.6, 0.15]} scale={[0.72, 0.95, 0.68]}>
            <sphereGeometry args={[1, 36, 24]} />
            <Skin part="right-ventricle" color="#356FB0" metalness={0.05} roughness={0.45} />
          </mesh>
        </Part>
        <Part id="left-ventricle">
          <mesh position={[0.5, -0.78, 0]} scale={[0.82, 1.12, 0.76]}>
            <sphereGeometry args={[1, 36, 24]} />
            <Skin part="left-ventricle" color="#C23B3B" metalness={0.05} roughness={0.45} />
          </mesh>
        </Part>
      </group>
      <Part id="right-ventricle">
        <mesh geometry={g.pulmonary}>
          <Skin part="right-ventricle" color={BLUE} metalness={0.05} roughness={0.5} />
        </mesh>
      </Part>
      <Part id="aorta">
        <mesh geometry={g.aorta}>
          <Skin part="aorta" color={RED} metalness={0.05} roughness={0.45} />
        </mesh>
      </Part>
    </group>
  );
}

/* ── Médecine : le cœur anatomique (BodyParts3D, CC BY 4.0) ──────────────── */
/**
 * Le fichier public/models/medicine/heart.glb : une pièce nommée par repère
 * (models-pipeline/build-heart.mjs). Chaque pièce garde la teinte écrite dans
 * le fichier et reçoit la matière commune — elle s'allume donc comme les
 * pièces des autres modèles. Compression meshopt : le décodeur est dans le
 * paquet de l'app, rien n'est demandé à un tiers.
 */
function HeartAnatomy({ playing }: { playing: boolean }) {
  const { scene } = useGLTF(HEART_GLB, false);
  const beat = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const found: { name: string; geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; color: string }[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      found.push({ name: mesh.name, geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), color: `#${material.color.getHexString()}` });
    });
    return found;
  }, [scene]);
  useFrame(({ clock }) => {
    if (!playing || !beat.current) return;
    // ≈ 66 battements par minute, comme le schéma.
    const t = (clock.elapsedTime * 1.1) % 1;
    beat.current.scale.setScalar(1 - 0.035 * Math.exp(-Math.pow((t - 0.38) / 0.07, 2)));
  });
  return (
    <group ref={beat}>
      {parts.map((p) => {
        const target = HEART_PART_OF[p.name] ?? null;
        const mesh = (
          <mesh key={p.name} geometry={p.geometry} matrix={p.matrix} matrixAutoUpdate={false}>
            {/* Un tissu vivant : jamais métallique, un film humide en surface. */}
            <Skin part={target ?? ""} color={p.color} metalness={0} roughness={0.52} clearcoat={0.4} sheen={0.25} tissue />
          </mesh>
        );
        return target ? (
          <Part key={p.name} id={target}>
            {mesh}
          </Part>
        ) : (
          mesh
        );
      })}
    </group>
  );
}

/* ── Ingénierie : le turboréacteur en coupe (Grab3D, CC0) ─────────────────── */
/**
 * Le fichier public/models/engineering/turbofan.glb : carter et rotor, avec
 * leurs textures (couleur, rugosité, métal, relief). Les matières du fichier
 * passent en rendu physique complet (vernis léger) ; le rotor tourne. Les
 * pièces ne sont pas des maillages séparés : toucher le modèle choisit le
 * repère le plus proche du point touché.
 */
function TurbofanFile({ playing }: { playing: boolean }) {
  const { scene } = useGLTF(TURBOFAN_FILE.url, false);
  const select = useContext(SelectContext);
  const root = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const physical = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(physical, mesh.material as THREE.MeshStandardMaterial);
      physical.anisotropy = 0.35;
      physical.envMapIntensity = 1.25;
      physical.onBeforeCompile = machinedMetalShader;
      physical.customProgramCacheKey = () => "tred-machined-metal";
      mesh.material = physical;
    });
    return copy;
  }, [scene]);
  // Le rotor (soufflante, compresseurs, turbines sur leur arbre) : la pièce qui tourne.
  const rotor = useRef<THREE.Object3D | null>(null);
  useEffect(() => {
    rotor.current = root.getObjectByName(TURBOFAN_FILE.rotor) ?? null;
  }, [root]);
  useFrame((_, dt) => {
    if (playing && rotor.current) rotor.current.rotation.x += Math.min(dt, 0.05) * 1.6;
  });
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || draggedSinceDown()) return;
    e.stopPropagation();
    let best: { id: string; d: number } | null = null;
    for (const h of EXPLORER_MODELS.turbofan.hotspots) {
      const d = e.point.distanceToSquared(new THREE.Vector3(...h.position));
      if (!best || d < best.d) best = { id: h.id, d };
    }
    if (best) select(best.id);
  };
  return (
    <group scale={TURBOFAN_FILE.scale} position={[0, TURBOFAN_FILE.lift * TURBOFAN_FILE.scale, 0]} onClick={onClick}>
      <primitive object={root} />
    </group>
  );
}

/** Le turboréacteur : le fichier ; `fallback` (la coupe construite) s'il ne se charge pas. */
export function TurbofanModel({ playing, fallback }: { playing: boolean; fallback: ReactNode }) {
  return (
    <ModelFileBoundary fallback={fallback}>
      <Suspense fallback={null}>
        <TurbofanFile playing={playing} />
      </Suspense>
    </ModelFileBoundary>
  );
}

/** Si le fichier d'un modèle ne se charge pas, la scène construite le remplace : la page ne reste jamais vide. */
class ModelFileBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Le cœur : le modèle anatomique ; le schéma pendant le téléchargement, ou si le fichier manque. */
export function Heart({ playing }: { playing: boolean }) {
  const schematic = <HeartSchematic playing={playing} />;
  return (
    <ModelFileBoundary fallback={schematic}>
      <Suspense fallback={null}>
        <HeartAnatomy playing={playing} />
      </Suspense>
    </ModelFileBoundary>
  );
}

/* ── Mathématiques : z = sin x + cos y ───────────────────────────────────── */
const LOW = new THREE.Color("#2563EB");
const MID = new THREE.Color("#FDE68A");
const HIGH = new THREE.Color("#DC2626");

function Dot({ id, at }: { id: string; at: [number, number, number] }) {
  const on = useContext(ActiveContext) === id;
  return (
    <Part id={id}>
      <mesh position={at}>
        <sphereGeometry args={[on ? 0.13 : 0.09, 20, 16]} />
        <meshBasicMaterial color={on ? HIGHLIGHT : "#0F172A"} toneMapped={false} />
      </mesh>
    </Part>
  );
}

/** Départs des billes : répartis sur le domaine, loin du minimum. */
const ROLLER_STARTS: [number, number][] = [[1.2, 0.4], [2.6, -0.6], [0.3, -1.4], [2.1, 1.5], [-0.2, 0.5], [1.7, -2.2], [0.9, 2.3], [2.9, 0.9]];

/**
 * Des billes qui suivent la plus grande pente : à chaque image, (x, y) avance
 * de −η·∇f. Elles finissent toutes au minimum, puis repartent. Rien n'est
 * mis en scène à la main : le chemin EST la descente de gradient.
 */
function Rollers({ playing }: { playing: boolean }) {
  const balls = useRef<(THREE.Mesh | null)[]>([]);
  const at = useRef(ROLLER_STARTS.map(([x, y]) => ({ x, y, rest: 0 })));
  useFrame((_, dt) => {
    if (!playing) return;
    const d = Math.min(dt, 0.05);
    at.current.forEach((p, i) => {
      const [gx, gy] = surfaceGradient(p.x, p.y);
      if (Math.hypot(gx, gy) < 0.04) {
        // Arrivée : une courte pause au fond, puis retour au départ.
        p.rest += d;
        if (p.rest > 1.2) Object.assign(p, { x: ROLLER_STARTS[i]![0], y: ROLLER_STARTS[i]![1], rest: 0 });
      } else {
        [p.x, p.y] = descend(p.x, p.y, d * 0.9);
        p.y = Math.max(-SURFACE.range, Math.min(SURFACE.range, p.y));
      }
      const [sx, sy, sz] = surfacePoint(p.x, p.y);
      balls.current[i]?.position.set(sx, sy + 0.07, sz);
    });
  });
  return (
    <group>
      {ROLLER_STARTS.map(([x, y], i) => {
        const [sx, sy, sz] = surfacePoint(x, y);
        return (
          <mesh key={i} ref={(m) => void (balls.current[i] = m)} position={[sx, sy + 0.07, sz]} raycast={() => null}>
            <sphereGeometry args={[0.07, 20, 16]} />
            <meshPhysicalMaterial color="#F8FAFC" metalness={0.9} roughness={0.15} clearcoat={1} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Surface({ playing }: { playing: boolean }) {
  const { surface, grid } = useMemo(() => {
    const side = 2 * SURFACE.range * SURFACE.scale;
    const surface = new THREE.PlaneGeometry(side, side, 72, 72);
    const p = surface.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      // Le plan naît dans XY : son Y devient la profondeur, la hauteur est la valeur de la fonction.
      const [x, y] = [p.getX(i) / SURFACE.scale, p.getY(i) / SURFACE.scale];
      const z = surfaceHeight(x, y);
      p.setXYZ(i, x * SURFACE.scale, z * SURFACE.scale, y * SURFACE.scale);
      const t = (z + 2) / 4;
      if (t < 0.5) c.copy(LOW).lerp(MID, t * 2);
      else c.copy(MID).lerp(HIGH, (t - 0.5) * 2);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    surface.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    surface.computeVertexNormals();
    // Le quadrillage : une ligne de la surface tous les π/4.
    const pts: number[] = [];
    const N = 48;
    for (let k = -4; k <= 4; k++) {
      const fixed = (k * Math.PI) / 4;
      for (let i = 0; i < N; i++) {
        const [a, b] = [-Math.PI + (2 * Math.PI * i) / N, -Math.PI + (2 * Math.PI * (i + 1)) / N];
        pts.push(...surfacePoint(a, fixed), ...surfacePoint(b, fixed), ...surfacePoint(fixed, a), ...surfacePoint(fixed, b));
      }
    }
    const grid = new THREE.BufferGeometry();
    grid.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return { surface, grid };
  }, []);
  const slope = surfacePoint(0, Math.PI / 2);
  // Le gradient (1, −1) au point du versant, dessiné dans le plan horizontal.
  const arrow = useMemo(() => new THREE.ArrowHelper(new THREE.Vector3(1, 0, -1).normalize(), new THREE.Vector3(slope[0], slope[1] + 0.06, slope[2]), 0.9, 0x0f172a, 0.24, 0.14), [slope]);
  useEffect(() => () => arrow.dispose(), [arrow]);
  return (
    <group>
      <mesh geometry={surface} raycast={() => null}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} metalness={0.1} roughness={0.55} />
      </mesh>
      <lineSegments geometry={grid} raycast={() => null} position={[0, 0.004, 0]}>
        <lineBasicMaterial color="#0F172A" transparent opacity={0.35} />
      </lineSegments>
      <primitive object={arrow} />
      <Rollers playing={playing} />
      <Dot id="maximum" at={surfacePoint(Math.PI / 2, 0)} />
      <Dot id="minimum" at={surfacePoint(-Math.PI / 2, Math.PI)} />
      <Dot id="saddle" at={surfacePoint(Math.PI / 2, Math.PI)} />
      <Dot id="slope" at={slope} />
    </group>
  );
}

/* ── Physique : l'atome de carbone, modèle des couches ───────────────────── */
function Shell({ id, radius, electrons, speed, playing }: { id: string; radius: number; electrons: number; speed: number; playing: boolean }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (playing && spin.current) spin.current.rotation.y += Math.min(dt, 0.05) * speed;
  });
  return (
    <Part id={id}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[radius, 0.015, 8, 120]} />
        <Skin part={id} color="#93C5FD" metalness={0.2} roughness={0.4} glow={{ color: "#60A5FA", intensity: 0.5 }} />
      </mesh>
      <group ref={spin}>
        {Array.from({ length: electrons }, (_, i) => {
          const a = (i / electrons) * Math.PI * 2;
          return (
            <mesh key={i} position={[radius * Math.cos(a), 0, radius * Math.sin(a)]}>
              <sphereGeometry args={[0.1, 20, 16]} />
              <Skin part={id} color="#38BDF8" metalness={0.3} roughness={0.3} glow={{ color: "#38BDF8", intensity: 0.8 }} />
            </mesh>
          );
        })}
      </group>
    </Part>
  );
}

export function Atom({ playing }: { playing: boolean }) {
  // 6 protons et 6 neutrons, serrés : une répartition régulière sur une petite sphère.
  const nucleons = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const y = 1 - (2 * (i + 0.5)) / 12;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.39996;
        return { at: [0.2 * r * Math.cos(a), 0.2 * y, 0.2 * r * Math.sin(a)] as [number, number, number], proton: i % 2 === 0 };
      }),
    [],
  );
  const active = useContext(ActiveContext);
  const cloud = active === "limits";
  const clouds = useRef<THREE.Group>(null);
  const orbitals = useMemo(
    () =>
      ORBITALS.map((o, i) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(sampleOrbital(o.kind, o.count, o.scale, o.maxR, 17 + i), 3));
        return { ...o, geometry };
      }),
    [],
  );
  useEffect(() => () => orbitals.forEach((o) => o.geometry.dispose()), [orbitals]);
  useFrame((_, dt) => {
    // Les nuages tournent lentement : on en perçoit le volume.
    if (playing && clouds.current) clouds.current.rotation.y += Math.min(dt, 0.05) * 0.12;
  });
  return (
    <group>
      <Part id="nucleus">
        {nucleons.map((n, i) => (
          <mesh key={i} position={n.at}>
            <sphereGeometry args={[0.13, 20, 16]} />
            <Skin part="nucleus" color={n.proton ? "#EF4444" : "#9CA3AF"} metalness={0.2} roughness={0.4} />
          </mesh>
        ))}
      </Part>
      {/* Le modèle en couches (cercles, électrons qui tournent) — retiré quand on en montre les limites. */}
      {!cloud && (
        <>
          <Shell id="k-shell" radius={ATOM_SHELLS.k.radius} electrons={ATOM_SHELLS.k.electrons} speed={1.9} playing={playing} />
          <Shell id="valence" radius={ATOM_SHELLS.l.radius} electrons={ATOM_SHELLS.l.electrons} speed={0.9} playing={playing} />
        </>
      )}
      {/* Les orbitales occupées, tirées de |ψ|² (lib/orbitals.ts). « Limites du modèle » : elles seules restent. */}
      <Part id="limits">
        <group ref={clouds}>
          {orbitals.map((o) => (
            <points key={o.kind} geometry={o.geometry} raycast={() => null}>
              <pointsMaterial color={o.color} size={cloud ? 0.045 : 0.035} sizeAttenuation transparent opacity={cloud || active === o.part ? 0.95 : 0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
            </points>
          ))}
        </group>
      </Part>
    </group>
  );
}

/* ── Droit : la pyramide des normes ──────────────────────────────────────── */
const NORM_COLOURS = ["#EAB308", "#D9A441", "#5D7A9C", "#33475F"];

export function Norms() {
  return (
    <group>
      {NORM_LEVELS.map((level, i) => (
        <Part key={level.id} id={level.id}>
          <mesh position={[0, level.y, 0]}>
            <boxGeometry args={[level.half * 2, 0.78, level.half * 2]} />
            <Skin part={level.id} color={NORM_COLOURS[i]} metalness={0.3} roughness={0.45} />
          </mesh>
        </Part>
      ))}
    </group>
  );
}

/* ── Informatik : architecture web (lib/explorer-network.ts) ─────────────── */

const NET = { clients: "#38BDF8", firewall: "#F97316", balancer: "#A855F7", app: "#22C55E", database: "#EAB308", link: "#64748B" };

/** Un câble entre deux points du sol (cylindre fin). */
function Link3D({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const { mid, len, rot } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { mid: a.clone().add(b).multiplyScalar(0.5), len: dir.length(), rot: new THREE.Euler().setFromQuaternion(q) };
  }, [from, to]);
  return (
    <mesh position={mid} rotation={rot}>
      <cylinderGeometry args={[0.03, 0.03, len, 8]} />
      <meshStandardMaterial color={NET.link} emissive={NET.link} emissiveIntensity={0.35} />
    </mesh>
  );
}

function Block({ id, x, z, w, h, color }: { id: string; x: number; z: number; w: number; h: number; color: string }) {
  return (
    <Part id={id}>
      <mesh position={[x, h / 2, z]}>
        <boxGeometry args={[w, h, w]} />
        <Skin part={id} color={color} metalness={0.25} roughness={0.4} />
      </mesh>
    </Part>
  );
}

export function Network() {
  const n = NETWORK_NODES;
  const y = 0.2;
  return (
    <group>
      {/* Trois clients, un pare-feu, un répartiteur, deux serveurs, UNE base. */}
      {[-0.8, 0, 0.8].map((z) => (
        <Block key={z} id="clients" x={n.clients.x} z={z} w={n.clients.w} h={n.clients.h} color={NET.clients} />
      ))}
      <Block id="firewall" x={n.firewall.x} z={0} w={n.firewall.w} h={n.firewall.h} color={NET.firewall} />
      <Block id="balancer" x={n.balancer.x} z={0} w={n.balancer.w} h={n.balancer.h} color={NET.balancer} />
      {APP_Z.map((z) => (
        <Block key={z} id="app" x={n.app.x} z={z} w={n.app.w} h={n.app.h} color={NET.app} />
      ))}
      <Part id="database">
        <mesh position={[n.database.x, n.database.h / 2, 0]}>
          <cylinderGeometry args={[n.database.w / 2, n.database.w / 2, n.database.h, 32]} />
          <Skin part="database" color={NET.database} metalness={0.35} roughness={0.35} />
        </mesh>
      </Part>
      {[-0.8, 0, 0.8].map((z) => (
        <Link3D key={`c${z}`} from={[n.clients.x, y, z]} to={[n.firewall.x, y, 0]} />
      ))}
      <Link3D from={[n.firewall.x, y, 0]} to={[n.balancer.x, y, 0]} />
      {APP_Z.map((z) => (
        <Link3D key={`b${z}`} from={[n.balancer.x, y, 0]} to={[n.app.x, y, z]} />
      ))}
      {APP_Z.map((z) => (
        <Link3D key={`d${z}`} from={[n.app.x, y, z]} to={[n.database.x, y, 0]} />
      ))}
      {/* Le sol de la salle serveur. */}
      <mesh position={[-0.2, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.6, 3.6]} />
        <meshStandardMaterial color="#1E293B" roughness={0.9} />
      </mesh>
    </group>
  );
}

/* ── Un fichier .glb déposé dans public/models/ ──────────────────────────── */
/**
 * Charge un modèle au format glTF binaire, le centre et le met à l'échelle du
 * cadre. `useGLTF(url, false)` : sans le décodeur Draco, que drei irait
 * chercher sur un serveur de Google — le fichier doit donc être déposé non
 * compressé en Draco.
 */
export function GltfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, false);
  const fitted = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const k = 3.2 / Math.max(size.x, size.y, size.z, 1e-6);
    root.position.set(-centre.x * k, -centre.y * k, -centre.z * k);
    root.scale.setScalar(k);
    return root;
  }, [scene]);
  return <primitive object={fitted} />;
}
