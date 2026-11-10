import { Composition } from "remotion";
import { HoersaalPromo, PROMO_FRAMES } from "./HoersaalPromo";
import "./style.css";

/**
 * Composition en taille « téléphone » (540 × 960 px CSS) : l'app s'affiche
 * avec sa mise en page mobile, comme sur l'écran d'un étudiant. Le rendu se
 * fait en `--scale=2` → MP4 1080 × 1920 (9:16), net.
 */
export function Root() {
  return (
    <Composition
      id="HoersaalPromo"
      component={HoersaalPromo}
      durationInFrames={PROMO_FRAMES}
      fps={30}
      width={540}
      height={960}
    />
  );
}
