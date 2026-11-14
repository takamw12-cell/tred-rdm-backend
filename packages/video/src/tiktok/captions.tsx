import { useMemo } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { VoicePlan } from "../promo/voice";
import { FPS, INK, ORANGE, W, pop } from "./kit";

/**
 * Sous-titres « TikTok » : deux ou trois mots à la fois, très gros, au centre.
 * Le mot que la voix prononce est posé sur un aplat orange ; les mots déjà
 * dits restent blancs, ceux à venir sont atténués.
 *
 * `y` : centre vertical du bloc (px CSS). Les scènes qui montrent l'écran de
 * TRED le descendent sous la carte ; il reste au-dessus de la zone que les
 * applications recouvrent en bas (légende, musique).
 */
export function BigCaptions({ plan, y, hideFrom }: { plan: VoicePlan; y: (frame: number) => number; hideFrom?: number }) {
  const frame = useCurrentFrame();
  const { pages } = useMemo(() => {
    // « — » et autres signes seuls ne sont pas des mots : on ne les affiche pas.
    const spoken = plan.captions.filter((c) => /[\p{L}\p{N}]/u.test(c.text));
    return createTikTokStyleCaptions({ captions: spoken, combineTokensWithinMilliseconds: 620 });
  }, [plan]);

  if (hideFrom !== undefined && frame >= hideFrom) return null;
  const now = (frame / FPS) * 1000;
  // Une page disparaît un quart de seconde après son dernier mot : pendant un
  // silence de la voix, l'écran reste libre pour l'image.
  const page = pages.find((p, i) => {
    const lastWord = p.tokens[p.tokens.length - 1]?.toMs ?? p.startMs + p.durationMs;
    const end = Math.min(lastWord + 260, pages[i + 1]?.startMs ?? Infinity);
    return now >= p.startMs && now < end;
  });
  if (!page) return null;

  // Le plus long mot de la page doit tenir sur une ligne (« FLUGZEUGTRIEBWERK »).
  const longest = Math.max(...page.tokens.map((t) => t.text.trim().length));
  const fontSize = Math.max(30, Math.min(47, (W - 70) / (longest * 0.74 + 0.7)));
  const center = y(frame);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 10 }}>
      <div style={{ position: "absolute", left: 22, right: 22, top: center - 110, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p
          style={{
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: `${fontSize * 0.14}px ${fontSize * 0.26}px`,
            fontFamily: "Inter, sans-serif",
            fontWeight: 900,
            fontSize,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {page.tokens.map((tk, i) => {
            const from = Math.round((tk.fromMs / 1000) * FPS);
            const active = now >= tk.fromMs && now < tk.toMs;
            const spoken = now >= tk.fromMs;
            const k = pop(frame, from, 7);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  padding: `${fontSize * 0.04}px ${fontSize * 0.2}px ${fontSize * 0.1}px`,
                  borderRadius: fontSize * 0.24,
                  color: spoken ? "#FFFFFF" : "rgb(255 255 255 / 0.5)",
                  background: active ? ORANGE : "transparent",
                  boxShadow: active ? "0 12px 30px -10px rgb(255 87 34 / 0.85)" : "none",
                  textShadow: active ? "none" : `0 3px 0 ${INK}, 3px 0 0 ${INK}, -3px 0 0 ${INK}, 0 -3px 0 ${INK}, 2px 2px 0 ${INK}, -2px 2px 0 ${INK}, 0 8px 22px rgb(0 0 0 / 0.8)`,
                  transform: `scale(${active ? 0.92 + 0.14 * k : 1}) rotate(${active ? -1.5 : 0}deg)`,
                }}
              >
                {tk.text.trim()}
              </span>
            );
          })}
        </p>
      </div>
    </AbsoluteFill>
  );
}
