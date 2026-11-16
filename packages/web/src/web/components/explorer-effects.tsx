import { Component, type ReactNode } from "react";
import { Bloom, EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type * as THREE from "three";

/**
 * Le rendu « studio » de l'Explorateur (2026-11-16) : trois passes après le
 * dessin de la scène.
 *  - N8AO : occlusion ambiante — les recoins entre deux pièces s'assombrissent,
 *    ce qui donne leur relief aux aubes, aux vaisseaux, aux étages.
 *  - Bloom : seuls les reflets les plus vifs débordent un peu (métal, repère choisi).
 *  - ACES : la courbe de tons du cinéma, appliquée en dernier.
 * Pas de flou de profondeur : il rendrait flous les détails qu'on vient lire.
 *
 * `light` (téléphone) : occlusion à demi-résolution et qualité réduite.
 * Si une passe échoue (pilote graphique ancien), la scène s'affiche sans effets.
 */
export function StudioEffects({ light }: { light: boolean }) {
  return (
    <EffectsBoundary>
      <EffectComposer multisampling={light ? 0 : 4} enableNormalPass={false}>
        <N8AO aoRadius={0.55} distanceFalloff={0.8} intensity={2.4} quality={light ? "performance" : "medium"} halfRes={light} color="#05070c" />
        <Bloom mipmapBlur intensity={0.32} luminanceThreshold={0.9} luminanceSmoothing={0.15} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </EffectsBoundary>
  );
}

class EffectsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ── Matières avancées : du GLSL greffé sur la matière physique de Three.js ── */

const NOISE = /* glsl */ `
varying vec3 vTredPos;
float tredHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tredNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tredHash(i), tredHash(i + vec3(1,0,0)), f.x), mix(tredHash(i + vec3(0,1,0)), tredHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(tredHash(i + vec3(0,0,1)), tredHash(i + vec3(1,0,1)), f.x), mix(tredHash(i + vec3(0,1,1)), tredHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float tredFbm(vec3 p) { return 0.55 * tredNoise(p) + 0.3 * tredNoise(p * 2.3) + 0.15 * tredNoise(p * 5.1); }
`;

const withWorldPosition = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTredPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvTredPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${NOISE}`);
};

/**
 * Tissu vivant : le maillage BodyParts3D n'a pas de coordonnées de texture,
 * donc pas d'image à plaquer. À la place, un grain calculé dans l'espace
 * (fibres du myocarde) module la teinte, la rugosité et le relief, et un
 * liseré rouge chaud là où la surface fuit le regard imite la lumière qui
 * traverse la chair (diffusion sous la surface, approchée — pas simulée).
 */
export function tissueShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  withWorldPosition(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <color_fragment>", "#include <color_fragment>\nfloat tredGrain = tredFbm(vTredPos * vec3(7.0, 3.5, 7.0));\ndiffuseColor.rgb *= 0.84 + 0.28 * tredGrain;")
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (tredGrain - 0.5) * 0.14, 0.2, 1.0);")
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      {
        float h = tredFbm(vTredPos * vec3(11.0, 5.5, 11.0)) * 0.018;
        vec3 q0 = dFdx(-vViewPosition); vec3 q1 = dFdy(-vViewPosition);
        vec3 r1 = cross(q1, normal); vec3 r2 = cross(normal, q0);
        float det = dot(q0, r1);
        vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
        normal = normalize(abs(det) * normal - grad);
      }`,
    )
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nfloat tredRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);\ntotalEmissiveRadiance += vec3(0.62, 0.07, 0.05) * tredRim * 0.42;");
}

/**
 * Métal d'atelier pour le turboréacteur : les aplats pastel du fichier (carter
 * bleu clair) deviennent de l'acier brossé — on retire la couleur des teintes
 * froides, on garde celle des teintes chaudes (cuivre de la chambre, laiton
 * des turbines, rouge des faces coupées) — et un grain fin raye la rugosité
 * dans le sens de l'axe, comme une pièce usinée.
 */
export function machinedMetalShader(shader: THREE.WebGLProgramParametersWithUniforms) {
  withWorldPosition(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float tredLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float tredCool = smoothstep(-0.03, 0.06, diffuseColor.b - diffuseColor.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(tredLuma) * vec3(0.78, 0.81, 0.86), tredCool);`,
    )
    .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, max(metalnessFactor, 0.92), tredCool);")
    .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nfloat tredBrush = tredNoise(vTredPos * vec3(2.0, 140.0, 140.0));\nroughnessFactor = clamp(mix(roughnessFactor, 0.3 + 0.1 * tredBrush, max(tredCool, 0.35)), 0.12, 1.0);");
}
