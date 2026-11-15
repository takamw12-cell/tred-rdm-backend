import { useEffect, useRef } from "react";
import type PhaserNS from "phaser";
import { BOARD, zoneAt, zoneCentre, ZONES } from "@/lib/minigame";

/**
 * La planche du mini-jeu, dessinée par Phaser — chargé À LA DEMANDE (1,4 Mo) :
 * il n'est téléchargé qu'à l'ouverture de /minigame.
 *
 * Phaser n'est que le pinceau : il dessine la coupe du moteur, dit quelle zone
 * est touchée, et joue le retour (vert, rouge, secousse). Les règles, la
 * question, les points et les textes sont dans React (pages/minigame.tsx) et
 * dans lib/minigame.ts — traduits, lisibles par un lecteur d'écran, testés.
 */
export interface Feedback {
  /** La zone touchée. */
  picked: string;
  /** La bonne zone. */
  correct: string;
}

export default function MiniGame({ onPick, feedback, onReady, label }: { onPick: (id: string) => void; feedback: Feedback | null; onReady: () => void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const ready = useRef(onReady);
  ready.current = onReady;
  const shown = useRef<Feedback | null>(feedback);
  shown.current = feedback;
  const redraw = useRef<(shake: boolean) => void>(() => {});

  useEffect(() => {
    let game: PhaserNS.Game | null = null;
    let cancelled = false;
    void import("phaser").then((mod) => {
      if (cancelled || !host.current) return;
      const Phaser = ((mod as unknown as { default?: typeof PhaserNS }).default ?? mod) as typeof PhaserNS;

      class Board extends Phaser.Scene {
        private ink!: PhaserNS.GameObjects.Graphics;
        private hover: string | null = null;

        create() {
          this.ink = this.add.graphics();
          for (const z of ZONES) {
            const [x, y] = zoneCentre(z);
            this.add.circle(x, y, 20, 0x0f172a, 0.92).setStrokeStyle(2, 0xeab308).setDepth(2);
            this.add.text(x, y, String(z.n), { fontFamily: "system-ui, sans-serif", fontSize: "20px", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5).setDepth(3);
          }
          this.input.on("pointermove", (p: PhaserNS.Input.Pointer) => {
            const id = shown.current ? null : (zoneAt(p.worldX, p.worldY)?.id ?? null);
            if (id === this.hover) return;
            this.hover = id;
            this.input.setDefaultCursor(id ? "pointer" : "default");
            this.paint();
          });
          this.input.on("pointerdown", (p: PhaserNS.Input.Pointer) => {
            if (shown.current) return;
            const zone = zoneAt(p.worldX, p.worldY);
            if (zone) pick.current(zone.id);
          });
          redraw.current = (shake) => {
            this.hover = null;
            this.paint();
            if (shake) this.cameras.main.shake(220, 0.007);
          };
          this.paint();
          ready.current();
        }

        private paint() {
          const g = this.ink;
          const fb = shown.current;
          g.clear();
          // La nacelle et l'axe : le décor, non cliquable.
          g.lineStyle(6, 0xe2e8f0, 0.9);
          g.strokeRoundedRect(84, 104, 502, 392, 26);
          g.lineStyle(2, 0x94a3b8, 0.5);
          g.lineBetween(60, 300, 760, 300);
          for (const z of ZONES) {
            const right = fb?.correct === z.id;
            const wrong = fb && fb.picked === z.id && !right;
            const colour = right ? 0x22c55e : wrong ? 0xef4444 : z.color;
            const alpha = fb ? (right || wrong ? 1 : 0.35) : this.hover === z.id ? 1 : 0.82;
            for (const s of z.shapes) {
              const pts = [];
              for (let i = 0; i < s.length; i += 2) pts.push(new Phaser.Math.Vector2(s[i], s[i + 1]));
              g.fillStyle(colour, alpha);
              g.fillPoints(pts, true);
              g.lineStyle(this.hover === z.id || right || wrong ? 4 : 2, right || wrong || this.hover === z.id ? 0xffffff : 0x0f172a, 1);
              g.strokePoints(pts, true);
            }
          }
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
        width: BOARD.width,
        height: BOARD.height,
        transparent: true,
        banner: false,
        audio: { noAudio: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: Board,
      });
    });
    return () => {
      cancelled = true;
      redraw.current = () => {};
      game?.destroy(true);
    };
  }, []);

  // Le retour d'une réponse : la bonne zone en vert, la mauvaise en rouge (et une secousse).
  useEffect(() => {
    redraw.current(Boolean(feedback && feedback.picked !== feedback.correct));
  }, [feedback]);

  // Le canvas ne se lit pas : sa description ; les mêmes choix existent en boutons sous la planche.
  return <div ref={host} role="img" aria-label={label} data-testid="minigame-board" className="size-full [&>canvas]:rounded-2xl" style={{ touchAction: "manipulation" }} />;
}
