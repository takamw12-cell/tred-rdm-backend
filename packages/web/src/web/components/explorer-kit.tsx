import { createContext, useCallback, useContext, type ReactNode } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { tissueShader } from "@/components/explorer-effects";
import { draggedSinceDown } from "@/lib/tap-guard";

/**
 * Les briques communes aux scènes de l'Explorateur 3D (Explorer3D.tsx,
 * explorer-scenes.tsx) : quelle pièce est choisie, comment on en choisit une,
 * et la matière qui s'allume quand c'est elle.
 */
export const HIGHLIGHT = "#EAB308";

/** Le repère choisi (surbrillance) et le geste « choisir cette pièce ». */
export const ActiveContext = createContext<string | null>(null);
export const SelectContext = createContext<(id: string) => void>(() => {});
/** Mode coupe : les plans qui tranchent les pièces (aucun = modèle entier). */
export const SectionContext = createContext<THREE.Plane[] | null>(null);

/**
 * Matière d'une pièce, en rendu physique (PBR) : elle reflète l'éclairage de
 * studio, et s'allume quand SON repère est choisi. `clearcoat` : le film
 * brillant d'un tissu vivant ou d'une pièce vernie.
 */
export function Skin({ part, color, metalness = 0.6, roughness = 0.36, glow, opacity, clearcoat = 0, sheen = 0, tissue = false }: { part: string; color: string; metalness?: number; roughness?: number; glow?: { color: string; intensity: number }; opacity?: number; clearcoat?: number; sheen?: number; tissue?: boolean }) {
  const on = useContext(ActiveContext) === part;
  const planes = useContext(SectionContext);
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      clearcoat={clearcoat}
      clearcoatRoughness={0.28}
      sheen={sheen}
      sheenRoughness={0.6}
      sheenColor="#ffd9d0"
      emissive={on ? HIGHLIGHT : (glow?.color ?? "#000000")}
      emissiveIntensity={on ? 0.45 : (glow?.intensity ?? 0)}
      side={THREE.DoubleSide}
      clippingPlanes={planes}
      onBeforeCompile={tissue ? tissueShader : undefined}
      customProgramCacheKey={() => (tissue ? "tred-tissue" : "tred-plain")}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
    />
  );
}

/** Un groupe cliquable : toucher la pièce choisit son repère (un glissé fait tourner la vue, il ne choisit rien). */
export function Part({ id, children }: { id: string; children: ReactNode }) {
  const select = useContext(SelectContext);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 6 || draggedSinceDown()) return;
      e.stopPropagation();
      select(id);
    },
    [id, select],
  );
  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      {children}
    </group>
  );
}

