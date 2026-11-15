import { createContext, useCallback, useContext, type ReactNode } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

/**
 * Les briques communes aux scènes de l'Explorateur 3D (Explorer3D.tsx,
 * explorer-scenes.tsx) : quelle pièce est choisie, comment on en choisit une,
 * et la matière qui s'allume quand c'est elle.
 */
export const HIGHLIGHT = "#EAB308";

/** Le repère choisi (surbrillance) et le geste « choisir cette pièce ». */
export const ActiveContext = createContext<string | null>(null);
export const SelectContext = createContext<(id: string) => void>(() => {});

/** Matière d'une pièce : elle s'allume quand SON repère est choisi. */
export function Skin({ part, color, metalness = 0.6, roughness = 0.36, glow, opacity }: { part: string; color: string; metalness?: number; roughness?: number; glow?: { color: string; intensity: number }; opacity?: number }) {
  const on = useContext(ActiveContext) === part;
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      emissive={on ? HIGHLIGHT : (glow?.color ?? "#000000")}
      emissiveIntensity={on ? 0.6 : (glow?.intensity ?? 0)}
      side={THREE.DoubleSide}
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
      if (e.delta > 6) return;
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

