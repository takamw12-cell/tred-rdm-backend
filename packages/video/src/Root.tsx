import { Composition, Folder } from "remotion";
import { HoersaalPromo, PROMO_FRAMES } from "./HoersaalPromo";
import { DE_FRAMES, DeElektroInformatik } from "./videos/DeElektroInformatik";
import { EN_FRAMES, EnMechanikAerospace } from "./videos/EnMechanikAerospace";
import { FR_FRAMES, FrMedizinRecht } from "./videos/FrMedizinRecht";
import { EnBeyondEngineering, EnFutureOfLearning, EnUniversalTutor } from "./series/english";
import { DeAlleFaecher, DeJuraMedizin, DeWirtschaftTechnik } from "./series/german";
import { SERIES_FRAMES } from "./series/engine";
import { CAMPAIGN_FRAMES } from "./campaign/engine";
import { CAMPAIGN_IDS } from "./campaign/videos";
import { DEMO_IDS } from "./campaign/demo";
import { V4_IDS } from "./campaign/v4";
import { DynamicExplanationCompositions } from "./dynamic";
import "./style.css";

/**
 * Compositions en taille « téléphone » (540 × 960 px CSS) : l'app s'affiche
 * avec sa mise en page mobile, comme sur l'écran d'un étudiant. Le rendu se
 * fait en `--scale=2` → MP4 1080 × 1920 (9:16), net.
 */
const PHONE = { fps: 30, width: 540, height: 960 } as const;

export function Root() {
  return (
    <>
      <Composition id="HoersaalPromo" component={HoersaalPromo} durationInFrames={PROMO_FRAMES} {...PHONE} />
      <Folder name="Filieres">
        <Composition id="FR-Medizin-Recht" component={FrMedizinRecht} durationInFrames={FR_FRAMES} {...PHONE} />
        <Composition id="DE-Elektro-Informatik" component={DeElektroInformatik} durationInFrames={DE_FRAMES} {...PHONE} />
        <Composition id="EN-Mechanik-Aerospace" component={EnMechanikAerospace} durationInFrames={EN_FRAMES} {...PHONE} />
      </Folder>
      <Folder name="Universelle-Universitaet">
        <Composition id="EN-1-Beyond-Engineering" component={EnBeyondEngineering} durationInFrames={SERIES_FRAMES} {...PHONE} />
        <Composition id="EN-2-Universal-Tutor" component={EnUniversalTutor} durationInFrames={SERIES_FRAMES} {...PHONE} />
        <Composition id="EN-3-Future-of-Learning" component={EnFutureOfLearning} durationInFrames={SERIES_FRAMES} {...PHONE} />
        <Composition id="DE-1-Jura-Medizin" component={DeJuraMedizin} durationInFrames={SERIES_FRAMES} {...PHONE} />
        <Composition id="DE-2-Wirtschaft-Technik" component={DeWirtschaftTechnik} durationInFrames={SERIES_FRAMES} {...PHONE} />
        <Composition id="DE-3-Alle-Faecher" component={DeAlleFaecher} durationInFrames={SERIES_FRAMES} {...PHONE} />
      </Folder>
      {/* Campagne « parle comme un ami » (2026-11-11) : 5 concepts × EN/DE, 30 s. */}
      <Folder name="Campagne-30s">
        {CAMPAIGN_IDS.map(([id, component]) => (
          <Composition key={id} id={id} component={component} durationInFrames={CAMPAIGN_FRAMES} {...PHONE} />
        ))}
      </Folder>
      {/* « Als Video erklären » : la composition de l'app, durée calculée sur l'audio. */}
      <Folder name="Als-Video-erklaeren">
        <DynamicExplanationCompositions />
      </Folder>
      {/* Campagne V3 « démonstration » (2026-11-11) : l'interface, le curseur, 5 concepts × EN/DE, 30 s. */}
      <Folder name="Demo-30s">
        {DEMO_IDS.map(([id, component]) => (
          <Composition key={id} id={id} component={component} durationInFrames={CAMPAIGN_FRAMES} {...PHONE} />
        ))}
      </Folder>
      {/* Campagne V4 « Studyflix » (2026-11-12) : curseur qui guide, interface qui réagit, 3 EN + 3 DE, 30 s. */}
      <Folder name="V4-Studyflix-30s">
        {V4_IDS.map(([id, component]) => (
          <Composition key={id} id={id} component={component} durationInFrames={CAMPAIGN_FRAMES} {...PHONE} />
        ))}
      </Folder>
    </>
  );
}
