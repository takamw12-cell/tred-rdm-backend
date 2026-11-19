import { Composition, Folder } from "remotion";
import { calculateProMetadata, PRO_FPS, PRO_H, PRO_W, ProMarketingVideo, type Storyboard } from "./ProMarketingVideo";
import en1 from "./storyboards/en1-panic-hack.json";
import en2 from "./storyboards/en2-3d-arcade.json";
import en3 from "./storyboards/en3-personal-professor.json";
import de1 from "./storyboards/de1-klausur-rettung.json";
import de2 from "./storyboards/de2-technischer-deep-dive.json";
import de3 from "./storyboards/de3-lernprofil.json";

/** Les 6 vidéos « Pro Marketing » (3 EN, 3 DE), une composition par storyboard. */
export const PRO_BOARDS = [en1, en2, en3, de1, de2, de3] as unknown as Storyboard[];

export function ProCompositions() {
  return (
    <Folder name="Pro-Marketing">
      {PRO_BOARDS.map((board) => (
        <Composition key={board.id} id={`Pro-${board.id}`} component={ProMarketingVideo} fps={PRO_FPS} width={PRO_W} height={PRO_H} durationInFrames={900} defaultProps={{ board }} calculateMetadata={calculateProMetadata} />
      ))}
    </Folder>
  );
}
