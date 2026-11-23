import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { SceneId } from "@/lib/sim-catalog";

/**
 * Les scènes 3D du Labo — chargées À LA DEMANDE (React.lazy dans labo.tsx).
 *
 * Chaque scène est écrite à la main et ne reçoit que des NOMBRES : les valeurs
 * des curseurs et les grandeurs calculées par la loi vérifiée. Aucune géométrie
 * ne vient du modèle de langage, aucun fichier n'est téléchargé.
 */
const C = { bg: "#0F172A", wire: "#94A3B8", a: "#F59E0B", b: "#38BDF8", flow: "#FDE047", body: "#E2E8F0", dim: "#475569", ok: "#34D399" };

type Values = Record<string, number>;

/* ── Diviseur de tension : une boucle, deux résistances, des charges qui circulent ── */

const LOOP: [number, number][] = [
  [-2, -1.2],
  [-2, 1.2],
  [2, 1.2],
  [2, -1.2],
];
const LOOP_LEN = 2 * (4 + 2.4);

function loopPoint(t: number): [number, number] {
  let d = (((t % 1) + 1) % 1) * LOOP_LEN;
  for (let i = 0; i < 4; i++) {
    const p = LOOP[i]!;
    const q = LOOP[(i + 1) % 4]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= len) return [p[0] + ((q[0] - p[0]) * d) / len, p[1] + ((q[1] - p[1]) * d) / len];
    d -= len;
  }
  return LOOP[0]!;
}

function Divider({ v, out }: { v: Values; out: Values }) {
  const charges = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const share1 = out.U1! / v.U!;
  // Vitesse des charges : le courant, sur une échelle logarithmique (0,1 mA … 1 A).
  const speed = 0.03 + 0.22 * Math.min(1, Math.max(0, (Math.log10(out.I!) + 4) / 4));
  useFrame((_, dt) => {
    phase.current += dt * speed;
    charges.current?.children.forEach((m, i) => {
      const [x, y] = loopPoint(phase.current + i / 14);
      m.position.set(x, y, 0);
    });
  });
  const wire = (x: number, y: number, w: number, h: number) => (
    <mesh position={[x, y, 0]}>
      <boxGeometry args={[w, h, 0.06]} />
      <meshStandardMaterial color={C.wire} />
    </mesh>
  );
  return (
    <group>
      {wire(0, 1.2, 4, 0.06)}
      {wire(0, -1.2, 4, 0.06)}
      {wire(-2, 0, 0.06, 2.4)}
      {wire(2, 0, 0.06, 2.4)}
      {/* Source */}
      <mesh position={[-2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.5 + v.U! / 24, 32]} />
        <meshStandardMaterial color={C.body} metalness={0.4} roughness={0.35} />
      </mesh>
      {/* R1 en haut, R2 à droite : leur épaisseur suit leur part de la tension. */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[1.5, 0.25 + 0.6 * share1, 0.25 + 0.6 * share1]} />
        <meshStandardMaterial color={C.a} emissive={C.a} emissiveIntensity={0.15 + 0.6 * share1} />
      </mesh>
      <mesh position={[2, 0, 0]}>
        <boxGeometry args={[0.25 + 0.6 * (1 - share1), 1.3, 0.25 + 0.6 * (1 - share1)]} />
        <meshStandardMaterial color={C.b} emissive={C.b} emissiveIntensity={0.15 + 0.6 * (1 - share1)} />
      </mesh>
      <group ref={charges}>
        {Array.from({ length: 14 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color={C.flow} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ── Levier : deux bras, deux forces, l'équilibre ───────────────────────── */

function Arrow({ x, y, length, color }: { x: number; y: number; length: number; color: string }) {
  return (
    <group position={[x, y, 0]}>
      <mesh position={[0, length / 2 + 0.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, length, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.12, 0.22, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function Lever({ v, out }: { v: Values; out: Values }) {
  const scale = 3.6 / (v.l1! + v.l2!);
  const left = -v.l1! * scale;
  const right = v.l2! * scale;
  const arrow = (force: number) => 0.3 + 1.3 * Math.min(1, Math.log10(1 + force) / 3.4);
  return (
    <group position={[(v.l1! - v.l2!) * scale * 0.5, -0.4, 0]}>
      <mesh position={[(left + right) / 2, 0, 0]}>
        <boxGeometry args={[right - left, 0.1, 0.5]} />
        <meshStandardMaterial color={C.body} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.45, 0]}>
        <coneGeometry args={[0.4, 0.8, 4]} />
        <meshStandardMaterial color={C.dim} />
      </mesh>
      <Arrow x={left} y={0.05} length={arrow(v.F1!)} color={C.a} />
      <Arrow x={right} y={0.05} length={arrow(out.F2!)} color={C.b} />
    </group>
  );
}

/* ── Pendule : il oscille avec la période calculée ──────────────────────── */

function Pendulum({ v, out }: { v: Values; out: Values }) {
  const arm = useRef<THREE.Group>(null);
  const length = 0.8 + 2.2 * Math.min(1, v.l! / 5);
  useFrame(({ clock }) => {
    if (arm.current) arm.current.rotation.z = 0.35 * Math.cos((2 * Math.PI * clock.elapsedTime) / out.T!);
  });
  return (
    <group position={[0, 1.6, 0]}>
      <mesh>
        <boxGeometry args={[1.6, 0.08, 0.5]} />
        <meshStandardMaterial color={C.dim} />
      </mesh>
      <group ref={arm}>
        <mesh position={[0, -length / 2, 0]}>
          <cylinderGeometry args={[0.015, 0.015, length, 8]} />
          <meshStandardMaterial color={C.wire} />
        </mesh>
        <mesh position={[0, -length, 0]}>
          <sphereGeometry args={[0.22, 32, 32]} />
          <meshStandardMaterial color={C.a} metalness={0.5} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

/* ── Circuit RC : le condensateur se charge avec la constante de temps ──── */

function RcCircuit({ out }: { out: Values }) {
  const level = useRef<THREE.Mesh>(null);
  // τ réel entre 10 µs et 100 s : à l'écran, entre 0,4 s et 3 s (échelle logarithmique).
  const shown = 0.4 + 2.6 * Math.min(1, Math.max(0, (Math.log10(out.tau!) + 5) / 7));
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % (6 * shown);
    const u = 1 - Math.exp(-t / shown);
    if (level.current) {
      level.current.scale.y = Math.max(0.001, u);
      level.current.position.y = -0.9 + 0.9 * u;
    }
  });
  return (
    <group>
      <mesh position={[-1.3, 0, 0]}>
        <boxGeometry args={[1.2, 0.4, 0.4]} />
        <meshStandardMaterial color={C.a} emissive={C.a} emissiveIntensity={0.3} />
      </mesh>
      {[0.9, 1.5].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.08, 2, 1.2]} />
          <meshStandardMaterial color={C.body} metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      <mesh ref={level} position={[1.2, 0, 0]}>
        <boxGeometry args={[0.44, 1.8, 1.1]} />
        <meshStandardMaterial color={C.b} emissive={C.b} emissiveIntensity={0.5} transparent opacity={0.75} />
      </mesh>
      <mesh position={[-0.2, 0, 0]}>
        <boxGeometry args={[2.2, 0.05, 0.05]} />
        <meshStandardMaterial color={C.wire} />
      </mesh>
    </group>
  );
}

/* ── Masse-ressort : la masse monte et descend avec la période calculée ── */

const COILS = 9;

function SpringMass({ v, out }: { v: Values; out: Values }) {
  const coils = useRef<THREE.Group>(null);
  const mass = useRef<THREE.Mesh>(null);
  const side = 0.3 + 0.35 * Math.cbrt(v.m! / 5);
  // Ressort raide : fil épais. Ressort mou : fil fin.
  const wire = 0.02 + 0.03 * Math.min(1, Math.log10(v.k!) / Math.log10(200));
  useFrame(({ clock }) => {
    const length = 1.5 + 0.5 * Math.cos((2 * Math.PI * clock.elapsedTime) / out.T!);
    coils.current?.children.forEach((ring, i) => ring.position.set(0, (-length * (i + 0.5)) / COILS, 0));
    mass.current?.position.set(0, -length - side / 2, 0);
  });
  return (
    <group position={[0, 1.7, 0]}>
      <mesh>
        <boxGeometry args={[1.6, 0.08, 0.5]} />
        <meshStandardMaterial color={C.dim} />
      </mesh>
      <group ref={coils}>
        {Array.from({ length: COILS }, (_, i) => (
          <mesh key={i} rotation={[Math.PI / 2 - 0.12, 0, 0]}>
            <torusGeometry args={[0.18, wire, 10, 32]} />
            <meshStandardMaterial color={C.b} metalness={0.5} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <mesh ref={mass}>
        <boxGeometry args={[side, side, side]} />
        <meshStandardMaterial color={C.a} metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ── Chute libre : la bille tombe pendant la durée calculée, puis repart ── */

function FreeFall({ v, out }: { v: Values; out: Values }) {
  const ball = useRef<THREE.Mesh>(null);
  // 0,5 m … 100 m : à l'écran, une tour de 0,8 à 3,2 (échelle logarithmique).
  const height = 0.8 + 2.4 * Math.min(1, Math.log10(v.h! / 0.5) / Math.log10(200));
  const floor = -1.8;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime % (out.t! + 0.8);
    const done = Math.min(1, t / out.t!);
    ball.current?.position.set(0.25, floor + 0.16 + height * (1 - done * done), 0);
  });
  return (
    <group>
      <mesh position={[-0.6, floor + height / 2, 0]}>
        <boxGeometry args={[0.5, height, 0.5]} />
        <meshStandardMaterial color={C.b} transparent opacity={0.35} />
      </mesh>
      <mesh position={[-0.45, floor + height, 0]}>
        <boxGeometry args={[0.9, 0.05, 0.5]} />
        <meshStandardMaterial color={C.b} />
      </mesh>
      <mesh position={[0, floor + 0.02, 0]}>
        <boxGeometry args={[2.4, 0.04, 1.2]} />
        <meshStandardMaterial color={C.dim} />
      </mesh>
      <mesh ref={ball}>
        <sphereGeometry args={[0.16, 32, 32]} />
        <meshStandardMaterial color={C.a} metalness={0.5} roughness={0.25} />
      </mesh>
    </group>
  );
}

/* ── Mouvement circulaire : la bille tourne à v / r, la force pointe vers le centre ── */

function CircularMotion({ v, out }: { v: Values; out: Values }) {
  const spin = useRef<THREE.Group>(null);
  const angle = useRef(0);
  const radius = 0.7 + 1.5 * Math.min(1, v.r! / 5);
  const size = 0.12 + 0.14 * Math.cbrt(v.m! / 10);
  // Force de 0,01 N à 20 kN : la flèche prend de 15 % à 85 % du rayon (échelle logarithmique).
  const pull = radius * (0.15 + 0.7 * Math.min(1, Math.max(0, (Math.log10(out.F!) + 2) / 6.3)));
  useFrame((_, dt) => {
    angle.current += (dt * v.v!) / v.r!;
    if (spin.current) spin.current.rotation.y = angle.current;
  });
  return (
    <group position={[0, -0.6, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.015, 8, 96]} />
        <meshStandardMaterial color={C.wire} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
        <meshStandardMaterial color={C.dim} />
      </mesh>
      <group ref={spin}>
        <mesh position={[radius, 0, 0]}>
          <sphereGeometry args={[size, 32, 32]} />
          <meshStandardMaterial color={C.a} metalness={0.5} roughness={0.25} />
        </mesh>
        {/* La force centripète : de la bille vers le centre. */}
        <mesh position={[radius - size - pull / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, pull, 12]} />
          <meshStandardMaterial color={C.ok} emissive={C.ok} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[radius - size - pull - 0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.1, 0.22, 16]} />
          <meshStandardMaterial color={C.ok} emissive={C.ok} emissiveIntensity={0.5} />
        </mesh>
      </group>
    </group>
  );
}

const SCENES: Record<SceneId, (p: { v: Values; out: Values }) => React.ReactNode> = {
  voltage_divider: Divider,
  lever: Lever,
  pendulum: Pendulum,
  rc_circuit: RcCircuit,
  spring_mass: SpringMass,
  free_fall: FreeFall,
  circular_motion: CircularMotion,
};

export default function SimulationScene({ scene, values, outputs, label }: { scene: SceneId; values: Values; outputs: Values; label: string }) {
  const Scene = SCENES[scene];
  const grid = useMemo(() => new THREE.GridHelper(12, 24, "#334155", "#1E293B"), []);
  return (
    <figure className="m-0 aspect-[4/3] w-full overflow-hidden rounded-xl" style={{ background: C.bg }} aria-label={label} data-testid="simulation-canvas">
      <Canvas camera={{ position: [3.4, 2.4, 5.6], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={[C.bg]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.6} />
        <directionalLight position={[-5, 2, -3]} intensity={0.5} />
        <primitive object={grid} position={[0, -1.9, 0]} />
        <Scene v={values} out={outputs} />
        <OrbitControls enablePan={false} minDistance={4} maxDistance={11} target={[0, 0, 0]} />
      </Canvas>
    </figure>
  );
}
