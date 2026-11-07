import type { PackSet } from "../types";
import { datenverarbeitung } from "./datenverarbeitung";
import { elektrotechnik } from "./elektrotechnik";
import { mathematik } from "./mathematik";
import { mechanik } from "./mechanik";
import { physik } from "./physik";
import { regelungstechnik } from "./regelungstechnik";
import { technischesZeichnen } from "./technisches-zeichnen";
import { thermodynamik } from "./thermodynamik";

/** Fachmodule für das Studium in Deutschland (DIN/VDI/ISO). */
export const GERMANY: PackSet = {
  mechanik,
  physik,
  elektrotechnik,
  thermodynamik,
  mathematik,
  regelungstechnik,
  technisches_zeichnen: technischesZeichnen,
  datenverarbeitung,
};
