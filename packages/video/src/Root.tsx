import { Composition, Folder } from "remotion";
import { HoersaalPromo, PROMO_FRAMES } from "./HoersaalPromo";
import { DE_FRAMES, DeElektroInformatik } from "./videos/DeElektroInformatik";
import { EN_FRAMES, EnMechanikAerospace } from "./videos/EnMechanikAerospace";
import { FR_FRAMES, FrMedizinRecht } from "./videos/FrMedizinRecht";
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
    </>
  );
}
