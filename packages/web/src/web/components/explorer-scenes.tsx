import { useContext, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { ActiveContext, HIGHLIGHT, Part, Skin } from "@/components/explorer-kit";
import { ATOM_SHELLS, NORM_LEVELS, SURFACE, surfaceHeight, surfacePoint } from "@/lib/explorer-more";

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

export function Heart({ playing }: { playing: boolean }) {
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

export function Surface() {
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
  const cloud = useContext(ActiveContext) === "limits";
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
      <Shell id="k-shell" radius={ATOM_SHELLS.k.radius} electrons={ATOM_SHELLS.k.electrons} speed={1.9} playing={playing} />
      <Shell id="valence" radius={ATOM_SHELLS.l.radius} electrons={ATOM_SHELLS.l.electrons} speed={0.9} playing={playing} />
      {/* « Limites du modèle » : le nuage de probabilité, à la place des orbites. */}
      <Part id="limits">
        <mesh>
          <sphereGeometry args={[2.25, 40, 28]} />
          <meshStandardMaterial color={cloud ? HIGHLIGHT : "#A5B4FC"} transparent opacity={cloud ? 0.2 : 0.06} depthWrite={false} side={THREE.BackSide} />
        </mesh>
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
