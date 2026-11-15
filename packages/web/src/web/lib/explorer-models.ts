/**
 * L'Explorateur 3D : ce que l'étudiant peut toucher, et ce que TRED en dit.
 *
 * Module PUR (aucune dépendance, aucun rendu) : les modèles, leurs points
 * cliquables et leurs textes. La scène Three.js est ailleurs
 * (components/Explorer3D.tsx, chargée à la demande) ; le mini-jeu
 * (lib/minigame.ts) et les cartes du Dashboard relisent les mêmes textes.
 *
 * ── Deux choix (15 nov. 2026) ──────────────────────────────────────────────
 *
 * 1. Les modèles sont CONSTRUITS dans le navigateur, à partir de formes
 *    simples. Aucun fichier .glb : rien à télécharger, aucune licence de
 *    tiers à suivre, aucun compte à créer chez un hébergeur de modèles.
 *
 * 2. Les explications sont ÉCRITES ici, relues, et s'affichent tout de suite.
 *    Un clic sur un point ne lance pas d'appel au modèle d'IA : ni attente,
 *    ni coût, ni phrase inventée sur une pièce de moteur. Pour aller plus
 *    loin, « Im Hörsaal fragen » pose la question au tuteur (`askPrompt`).
 *
 * Textes complets en allemand, anglais, français et espagnol ; les autres
 * langues de l'interface retombent sur l'allemand, comme le reste de l'app.
 */

import { ATOM, CELL, HEART, MATH_SURFACE, NORMS } from "./explorer-more";

export const CONTENT_LOCALES = ["de", "en", "fr", "es"] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export type LocalText = Record<ContentLocale, string>;
export type Vec3 = [number, number, number];

/** « fr-CH » → français ; une langue sans texte → allemand. */
export function pick(text: LocalText, locale: string): string {
  const base = (locale ?? "").toLowerCase().split("-")[0] as ContentLocale;
  return text[CONTENT_LOCALES.includes(base) ? base : "de"];
}

export interface FormulaStep {
  /** LaTeX (KaTeX), sans les délimiteurs. */
  tex: string;
  note: LocalText;
}

export interface ExplorerHotspot {
  id: string;
  /** Où le repère est posé, dans le repère du modèle. */
  position: Vec3;
  title: LocalText;
  /** L'explication : deux ou trois phrases. */
  text: LocalText;
  /** Un ordre de grandeur ou une règle à retenir. */
  fact: LocalText;
  /** La question du mini-jeu et des cartes : on cherche la pièce par sa FONCTION. */
  quiz: LocalText;
  /** Une formule qui se construit pas à pas (components/formula-steps.tsx). */
  steps?: FormulaStep[];
}

export type ExplorerModelId = "turbofan" | "gearbox" | "cell" | "heart" | "surface" | "atom" | "norms";

/** Les filières de l'Explorateur : TRED n'est pas réservé aux ingénieurs. */
export type Discipline = "engineering" | "medicine" | "mathematics" | "physics" | "law";

export interface ExplorerModel {
  /** « custom » : un fichier .glb déposé dans public/models/, sans repères. */
  id: ExplorerModelId | "custom";
  discipline: Discipline;
  /**
   * Mots (expressions régulières, en minuscules) qui, dans une question posée
   * au tuteur, annoncent ce modèle : le Hörsaal propose alors « In 3D ansehen ».
   */
  keywords: string[];
  name: LocalText;
  intro: LocalText;
  /** Mention de l'auteur d'un modèle sous licence (CC BY) : affichée sous le texte d'introduction. */
  credit?: LocalText;
  /** Boîte englobante du modèle : cadrage de la caméra, et garde-fou des repères. */
  bounds: { min: Vec3; max: Vec3 };
  /** D'où la caméra regarde au départ. */
  camera: Vec3;
  hotspots: ExplorerHotspot[];
}

/* ── Turboréacteur double flux, deux arbres, en coupe ──────────────────────
 * Axe du moteur = axe X ; l'air entre à x = −3 et sort à x = +3.
 * Ordres de grandeur : moteurs civils récents (taux de dilution ≈ 10,
 * taux de compression global 40 à 50, entrée de turbine jusqu'à ≈ 1 700 °C). */
const TURBOFAN: ExplorerModel = {
  id: "turbofan",
  discipline: "engineering",
  keywords: ["turbofan", "triebwerk", "strahltriebwerk", "turbor[ée]acteur", "jet engine", "turbofán", "brennkammer", "nebenstrom"],
  name: { de: "Turbofan-Triebwerk", en: "Turbofan engine", fr: "Turboréacteur double flux", es: "Motor turbofán" },
  intro: {
    de: "Ein Zweiwellen-Turbofan im Schnitt. Tippe auf einen Punkt, um zu sehen, was dort passiert.",
    en: "A two-spool turbofan, cut open. Tap a point to see what happens there.",
    fr: "Un turboréacteur double flux à deux arbres, en coupe. Touche un point pour voir ce qui s'y passe.",
    es: "Un turbofán de dos ejes, en corte. Toca un punto para ver qué ocurre allí.",
  },
  credit: {
    de: "3D-Modell: „Turbofan Jet Engine Cutaway“, Grab3D, CC0 1.0 (gemeinfrei) – ein generisches Lehrmodell, kein bestimmtes Triebwerk.",
    en: "3D model: “Turbofan Jet Engine Cutaway”, Grab3D, CC0 1.0 (public domain) – a generic teaching model, not a specific engine.",
    fr: "Modèle 3D : « Turbofan Jet Engine Cutaway », Grab3D, CC0 1.0 (domaine public) – un modèle pédagogique générique, pas un moteur précis.",
    es: "Modelo 3D: «Turbofan Jet Engine Cutaway», Grab3D, CC0 1.0 (dominio público): un modelo didáctico genérico, no un motor concreto.",
  },
  // Le fichier public/models/engineering/turbofan.glb, agrandi 1,5 fois (TURBOFAN_FILE) :
  // la soufflante est à droite (x > 0), l'air sort à gauche ; l'axe du moteur est à y = 0,15.
  bounds: { min: [-2.9, -1.8, -1.6], max: [2.9, 1.8, 1.6] },
  camera: [2.95, 2.85, 7.05],
  hotspots: [
    {
      id: "fan",
      position: [1.65, 0.79, 0.64],
      title: { de: "Fan (Bläser)", en: "Fan", fr: "Soufflante (fan)", es: "Fan (soplante)" },
      text: {
        de: "Der Fan saugt die gesamte Luft an und beschleunigt sie. Nur ein kleiner Teil strömt ins Kerntriebwerk – der große Rest fließt außen vorbei und liefert den Großteil des Schubs.",
        en: "The fan draws in all the air and accelerates it. Only a small share enters the core – the large remainder flows around it and produces most of the thrust.",
        fr: "La soufflante aspire tout l'air et l'accélère. Une petite part seulement entre dans le cœur du moteur ; le reste le contourne et fournit l'essentiel de la poussée.",
        es: "El fan aspira todo el aire y lo acelera. Solo una pequeña parte entra en el núcleo; el resto lo rodea y produce la mayor parte del empuje.",
      },
      fact: {
        de: "Moderne Triebwerke: rund 80 % des Schubs kommen vom Fan.",
        en: "Modern engines: about 80 % of the thrust comes from the fan.",
        fr: "Moteurs modernes : environ 80 % de la poussée vient de la soufflante.",
        es: "Motores modernos: alrededor del 80 % del empuje procede del fan.",
      },
      quiz: {
        de: "Welches Bauteil saugt die gesamte Luft an?",
        en: "Which part draws in all the air?",
        fr: "Quelle pièce aspire tout l'air ?",
        es: "¿Qué pieza aspira todo el aire?",
      },
    },
    {
      id: "compressor",
      position: [0.15, 0.5, 0.35],
      title: { de: "Verdichter", en: "Compressor", fr: "Compresseur", es: "Compresor" },
      text: {
        de: "Schaufelreihe für Schaufelreihe wird die Kernluft zusammengedrückt: Ein Laufrad beschleunigt sie, das feststehende Leitrad dahinter wandelt die Geschwindigkeit in Druck um. Dabei wird die Luft heiß.",
        en: "Row after row of blades squeezes the core air: a rotor accelerates it, the fixed stator behind it turns that speed into pressure. The air heats up as it is compressed.",
        fr: "Rangée après rangée, les aubes compriment l'air du cœur : un rotor l'accélère, le stator fixe placé derrière transforme cette vitesse en pression. L'air s'échauffe en se comprimant.",
        es: "Fila tras fila, los álabes comprimen el aire del núcleo: un rotor lo acelera y el estátor fijo que le sigue convierte esa velocidad en presión. El aire se calienta al comprimirse.",
      },
      fact: {
        de: "Gesamtdruckverhältnis moderner Triebwerke: etwa 40 : 1 bis 50 : 1.",
        en: "Overall pressure ratio of modern engines: about 40:1 to 50:1.",
        fr: "Taux de compression global des moteurs modernes : environ 40:1 à 50:1.",
        es: "Relación de compresión global de los motores modernos: de 40:1 a 50:1 aproximadamente.",
      },
      quiz: {
        de: "Wo wird die Luft Stufe für Stufe zusammengedrückt?",
        en: "Where is the air squeezed stage by stage?",
        fr: "Où l'air est-il comprimé étage après étage ?",
        es: "¿Dónde se comprime el aire etapa a etapa?",
      },
    },
    {
      id: "combustor",
      position: [-0.6, 0.65, 0.5],
      title: { de: "Brennkammer", en: "Combustion chamber", fr: "Chambre de combustion", es: "Cámara de combustión" },
      text: {
        de: "Hier wird Kerosin in die verdichtete Luft eingespritzt und verbrannt – bei nahezu konstantem Druck. Die Wärme lässt das Gas sich stark ausdehnen: Das ist die Energie, von der Turbine und Düse leben.",
        en: "Kerosene is injected into the compressed air and burned here – at nearly constant pressure. The heat makes the gas expand strongly: this is the energy the turbine and nozzle live on.",
        fr: "Le kérosène est injecté dans l'air comprimé et brûlé ici, à pression presque constante. La chaleur dilate fortement le gaz : c'est l'énergie dont vivent la turbine et la tuyère.",
        es: "Aquí se inyecta queroseno en el aire comprimido y se quema, a presión casi constante. El calor hace que el gas se expanda mucho: de esa energía viven la turbina y la tobera.",
      },
      fact: {
        de: "Turbineneintritt: bis etwa 1 700 °C – heißer als der Schmelzpunkt der Schaufelwerkstoffe, deshalb Kühlluft und Wärmedämmschichten.",
        en: "Turbine inlet: up to about 1,700 °C – hotter than the melting point of the blade alloys, hence cooling air and thermal barrier coatings.",
        fr: "Entrée de turbine : jusqu'à environ 1 700 °C, plus que le point de fusion des alliages des aubes, d'où l'air de refroidissement et les barrières thermiques.",
        es: "Entrada de turbina: hasta unos 1 700 °C, por encima del punto de fusión de las aleaciones de los álabes; por eso hay aire de refrigeración y recubrimientos térmicos.",
      },
      quiz: {
        de: "Wo wird das Kerosin verbrannt?",
        en: "Where is the kerosene burned?",
        fr: "Où le kérosène est-il brûlé ?",
        es: "¿Dónde se quema el queroseno?",
      },
    },
    {
      id: "turbine",
      position: [-1.5, 0.55, 0.4],
      title: { de: "Turbine", en: "Turbine", fr: "Turbine", es: "Turbina" },
      text: {
        de: "Das heiße Gas entspannt sich in der Turbine und gibt dabei Arbeit ab. Die Hochdruckturbine treibt über die äußere Welle den Hochdruckverdichter an, die Niederdruckturbine über die innere Welle den Fan.",
        en: "The hot gas expands through the turbine and delivers work. The high-pressure turbine drives the high-pressure compressor through the outer shaft, the low-pressure turbine drives the fan through the inner shaft.",
        fr: "Le gaz chaud se détend dans la turbine et lui cède du travail. La turbine haute pression entraîne le compresseur haute pression par l'arbre extérieur, la turbine basse pression entraîne la soufflante par l'arbre intérieur.",
        es: "El gas caliente se expande en la turbina y le cede trabajo. La turbina de alta presión mueve el compresor de alta presión mediante el eje exterior; la de baja presión mueve el fan mediante el eje interior.",
      },
      fact: {
        de: "Zwei Wellen, zwei Drehzahlen: N1 (Fan) und N2 (Hochdruckteil).",
        en: "Two shafts, two speeds: N1 (fan) and N2 (high-pressure spool).",
        fr: "Deux arbres, deux régimes : N1 (soufflante) et N2 (corps haute pression).",
        es: "Dos ejes, dos regímenes: N1 (fan) y N2 (cuerpo de alta presión).",
      },
      quiz: {
        de: "Welches Bauteil treibt Verdichter und Fan an?",
        en: "Which part drives the compressor and the fan?",
        fr: "Quelle pièce entraîne le compresseur et la soufflante ?",
        es: "¿Qué pieza mueve el compresor y el fan?",
      },
    },
    {
      id: "nozzle",
      position: [-2.4, 0.36, 0.21],
      title: { de: "Schubdüse", en: "Exhaust nozzle", fr: "Tuyère", es: "Tobera" },
      text: {
        de: "In der Düse wird das Abgas beschleunigt: Druck wird zu Geschwindigkeit. Schub entsteht, weil das Triebwerk Luft nach hinten schneller ausstößt, als sie vorne ankommt (Impulssatz).",
        en: "In the nozzle the exhaust gas is accelerated: pressure becomes velocity. Thrust arises because the engine expels air rearwards faster than it arrives at the front (momentum theorem).",
        fr: "Dans la tuyère, les gaz d'échappement sont accélérés : la pression devient vitesse. La poussée naît de ce que le moteur rejette l'air vers l'arrière plus vite qu'il n'arrive à l'avant (théorème de la quantité de mouvement).",
        es: "En la tobera se aceleran los gases de escape: la presión se convierte en velocidad. El empuje surge porque el motor expulsa el aire hacia atrás más rápido de lo que llega por delante (teorema de la cantidad de movimiento).",
      },
      fact: {
        de: "Faustregel: Schub = Massenstrom × Geschwindigkeitszuwachs.",
        en: "Rule of thumb: thrust = mass flow × gain in velocity.",
        fr: "Règle simple : poussée = débit massique × gain de vitesse.",
        es: "Regla simple: empuje = gasto másico × aumento de velocidad.",
      },
      quiz: {
        de: "Wo wird das Abgas auf Austrittsgeschwindigkeit beschleunigt?",
        en: "Where is the gas accelerated to its exit velocity?",
        fr: "Où les gaz sont-ils accélérés jusqu'à la vitesse de sortie ?",
        es: "¿Dónde se aceleran los gases hasta la velocidad de salida?",
      },
      steps: [
        {
          tex: "F = \\dot m \\,(c_e - c_0)",
          note: {
            de: "Impulssatz: Massenstrom mal Geschwindigkeitszuwachs.",
            en: "Momentum theorem: mass flow times gain in velocity.",
            fr: "Quantité de mouvement : débit massique fois gain de vitesse.",
            es: "Cantidad de movimiento: gasto másico por aumento de velocidad.",
          },
        },
        {
          tex: "F = \\dot m_{k}\\,(c_{k} - c_0) + \\dot m_{h}\\,(c_{h} - c_0)",
          note: {
            de: "Zwei Ströme: kalter Nebenstrom (k) und heißer Kernstrom (h).",
            en: "Two streams: cold bypass flow (k) and hot core flow (h).",
            fr: "Deux flux : le secondaire, froid (k), et le primaire, chaud (h).",
            es: "Dos flujos: el secundario, frío (k), y el primario, caliente (h).",
          },
        },
        {
          tex: "\\mu = \\dfrac{\\dot m_{k}}{\\dot m_{h}}",
          note: {
            de: "Nebenstromverhältnis – heute rund 10.",
            en: "Bypass ratio – around 10 today.",
            fr: "Taux de dilution : environ 10 aujourd'hui.",
            es: "Relación de derivación: hoy en torno a 10.",
          },
        },
        {
          tex: "\\eta_V = \\dfrac{2}{1 + c_e / c_0}",
          note: {
            de: "Vortriebswirkungsgrad: je näher die Austritts- an der Fluggeschwindigkeit, desto besser.",
            en: "Propulsive efficiency: the closer the exit velocity is to the flight speed, the better.",
            fr: "Rendement propulsif : plus la vitesse de sortie est proche de la vitesse de vol, mieux c'est.",
            es: "Rendimiento propulsivo: cuanto más se acerca la velocidad de salida a la de vuelo, mejor.",
          },
        },
      ],
    },
    {
      id: "bypass",
      position: [1.05, 1.05, 0.9],
      title: { de: "Nebenstromkanal", en: "Bypass duct", fr: "Flux secondaire", es: "Flujo secundario" },
      text: {
        de: "Der kalte Nebenstrom umströmt das Kerntriebwerk. Viel Luft nur wenig zu beschleunigen ist effizienter, als wenig Luft stark zu beschleunigen – und deutlich leiser.",
        en: "The cold bypass flow passes around the core. Accelerating a lot of air a little is more efficient than accelerating a little air a lot – and much quieter.",
        fr: "Le flux secondaire, froid, contourne le cœur du moteur. Accélérer peu beaucoup d'air est plus efficace qu'accélérer beaucoup peu d'air, et bien plus silencieux.",
        es: "El flujo secundario, frío, rodea el núcleo. Acelerar poco mucho aire es más eficiente que acelerar mucho poco aire, y bastante más silencioso.",
      },
      fact: {
        de: "Nebenstromverhältnis moderner Triebwerke: rund 10 : 1.",
        en: "Bypass ratio of modern engines: around 10:1.",
        fr: "Taux de dilution des moteurs modernes : environ 10:1.",
        es: "Relación de derivación de los motores modernos: en torno a 10:1.",
      },
      quiz: {
        de: "Wo strömt die kalte Luft am Kerntriebwerk vorbei?",
        en: "Where does the cold air flow around the core?",
        fr: "Où l'air froid contourne-t-il le cœur du moteur ?",
        es: "¿Por dónde rodea el aire frío el núcleo?",
      },
    },
  ],
};

/* ── Engrenage droit, un étage ─────────────────────────────────────────────
 * Module m = 0,1 ; pignon z₁ = 16, roue z₂ = 40 → i = 2,5 ; entraxe
 * a = m·(z₁ + z₂)/2 = 2,8. Les deux roues tournent dans le plan XY. */
export const GEAR = { module: 0.1, z1: 16, z2: 40, width: 0.5 } as const;
export const gearRatio = GEAR.z2 / GEAR.z1;
export const gearCentreDistance = (GEAR.module * (GEAR.z1 + GEAR.z2)) / 2;
/** Rayons primitifs : r = m·z / 2. */
const R1 = (GEAR.module * GEAR.z1) / 2; // 0,8
const R2 = (GEAR.module * GEAR.z2) / 2; // 2,0
/**
 * L'ensemble est centré sur l'origine, le pignon à gauche et la roue à
 * droite : les deux cercles primitifs se touchent au point primitif, sur
 * l'axe X, à x = r₁ − r₂.
 */
export const gearPitchPoint: Vec3 = [R1 - R2, 0, 0];
export const gearCentres = {
  pinion: [gearPitchPoint[0] - R1, 0, 0] as Vec3,
  wheel: [gearPitchPoint[0] + R2, 0, 0] as Vec3,
};

const GEARBOX: ExplorerModel = {
  id: "gearbox",
  discipline: "engineering",
  keywords: ["zahnrad", "stirnrad", "getriebe", "\\bgears?\\b", "gearbox", "engrenage", "engranaje", "übersetzungsverhältnis"],
  name: { de: "Stirnradgetriebe", en: "Spur gear stage", fr: "Engrenage droit", es: "Engranaje recto" },
  intro: {
    de: "Ein einstufiges Stirnradgetriebe: Das kleine Ritzel treibt das große Rad. Tippe auf einen Punkt.",
    en: "A single-stage spur gear set: the small pinion drives the large wheel. Tap a point.",
    fr: "Un engrenage droit à un étage : le petit pignon entraîne la grande roue. Touche un point.",
    es: "Un engranaje recto de una etapa: el piñón pequeño mueve la rueda grande. Toca un punto.",
  },
  bounds: { min: [-3.0, -2.2, -1.2], max: [3.0, 2.2, 1.2] },
  camera: [-2.6, 2.4, 6.4],
  hotspots: [
    {
      id: "pinion",
      position: [gearCentres.pinion[0], 0.45, 0.3],
      title: { de: "Ritzel (Antrieb)", en: "Pinion (input)", fr: "Pignon (entrée)", es: "Piñón (entrada)" },
      text: {
        de: "Das kleine Rad sitzt auf der Antriebswelle. Es dreht schnell und überträgt ein kleines Drehmoment.",
        en: "The small gear sits on the input shaft. It turns fast and carries a small torque.",
        fr: "La petite roue est sur l'arbre d'entrée. Elle tourne vite et transmet un petit couple.",
        es: "La rueda pequeña va en el eje de entrada. Gira rápido y transmite un par pequeño.",
      },
      fact: { de: "Hier: z₁ = 16 Zähne.", en: "Here: z₁ = 16 teeth.", fr: "Ici : z₁ = 16 dents.", es: "Aquí: z₁ = 16 dientes." },
      quiz: {
        de: "Welches Rad dreht schneller?",
        en: "Which gear turns faster?",
        fr: "Quelle roue tourne le plus vite ?",
        es: "¿Qué rueda gira más rápido?",
      },
    },
    {
      id: "wheel",
      position: [gearCentres.wheel[0] + 0.7, 1.1, 0.3],
      title: { de: "Großrad (Abtrieb)", en: "Wheel (output)", fr: "Roue (sortie)", es: "Rueda (salida)" },
      text: {
        de: "Das große Rad dreht langsamer – und in die Gegenrichtung. Dafür steigt das Drehmoment im gleichen Verhältnis.",
        en: "The large gear turns more slowly – and in the opposite direction. In return the torque rises by the same ratio.",
        fr: "La grande roue tourne plus lentement, et dans l'autre sens. En échange, le couple augmente dans le même rapport.",
        es: "La rueda grande gira más despacio y en sentido contrario. A cambio, el par aumenta en la misma proporción.",
      },
      fact: {
        de: "Hier: z₂ = 40 Zähne, also i = 40 / 16 = 2,5.",
        en: "Here: z₂ = 40 teeth, so i = 40 / 16 = 2.5.",
        fr: "Ici : z₂ = 40 dents, donc i = 40 / 16 = 2,5.",
        es: "Aquí: z₂ = 40 dientes, por tanto i = 40 / 16 = 2,5.",
      },
      quiz: {
        de: "An welchem Rad ist das Drehmoment größer?",
        en: "On which gear is the torque larger?",
        fr: "Sur quelle roue le couple est-il le plus grand ?",
        es: "¿En qué rueda es mayor el par?",
      },
      steps: [
        {
          tex: "i = \\dfrac{n_1}{n_2} = \\dfrac{z_2}{z_1}",
          note: {
            de: "Übersetzung: Die Drehzahlen verhalten sich umgekehrt wie die Zähnezahlen.",
            en: "Ratio: the speeds are inversely proportional to the tooth counts.",
            fr: "Rapport : les vitesses sont inversement proportionnelles aux nombres de dents.",
            es: "Relación: las velocidades son inversamente proporcionales a los números de dientes.",
          },
        },
        {
          tex: "i = \\dfrac{40}{16} = \\dfrac{5}{2}",
          note: { de: "Unser Getriebe.", en: "Our gear set.", fr: "Notre engrenage.", es: "Nuestro engranaje." },
        },
        {
          tex: "M_2 = M_1 \\cdot i \\cdot \\eta",
          note: {
            de: "Das Drehmoment steigt mit i (η ≈ 0,98 je Stufe).",
            en: "Torque rises with i (η ≈ 0.98 per stage).",
            fr: "Le couple augmente avec i (η ≈ 0,98 par étage).",
            es: "El par aumenta con i (η ≈ 0,98 por etapa).",
          },
        },
        {
          tex: "d = m \\cdot z \\qquad a = \\dfrac{m\\,(z_1 + z_2)}{2}",
          note: {
            de: "Teilkreisdurchmesser und Achsabstand über den Modul m.",
            en: "Pitch diameter and centre distance via the module m.",
            fr: "Diamètre primitif et entraxe, par le module m.",
            es: "Diámetro primitivo y distancia entre ejes, mediante el módulo m.",
          },
        },
      ],
    },
    {
      id: "mesh",
      position: [gearPitchPoint[0], 0, 0.36],
      title: { de: "Zahneingriff", en: "Tooth mesh", fr: "Engrènement", es: "Engrane" },
      text: {
        de: "Im Wälzpunkt rollen die beiden Teilkreise aufeinander ab – ohne zu gleiten. Die Evolventenform der Zähne hält die Übersetzung in jeder Stellung konstant.",
        en: "At the pitch point the two pitch circles roll on each other without slipping. The involute tooth shape keeps the ratio constant in every position.",
        fr: "Au point primitif, les deux cercles primitifs roulent l'un sur l'autre sans glisser. Le profil en développante des dents garde le rapport constant dans toutes les positions.",
        es: "En el punto primitivo las dos circunferencias primitivas ruedan una sobre otra sin deslizar. El perfil de evolvente de los dientes mantiene constante la relación en cualquier posición.",
      },
      fact: {
        de: "Normeingriffswinkel: α = 20° (DIN 867).",
        en: "Standard pressure angle: α = 20° (DIN 867).",
        fr: "Angle de pression normalisé : α = 20° (DIN 867).",
        es: "Ángulo de presión normalizado: α = 20° (DIN 867).",
      },
      quiz: {
        de: "Wo rollen die Teilkreise aufeinander ab?",
        en: "Where do the pitch circles roll on each other?",
        fr: "Où les cercles primitifs roulent-ils l'un sur l'autre ?",
        es: "¿Dónde ruedan una sobre otra las circunferencias primitivas?",
      },
    },
    {
      id: "shaft",
      position: [gearCentres.wheel[0], 0, 0.95],
      title: { de: "Welle und Lager", en: "Shaft and bearings", fr: "Arbre et paliers", es: "Eje y rodamientos" },
      text: {
        de: "Die Welle überträgt das Drehmoment, die Lager stützen sie ab. Die Zahnkraft biegt und verdreht die Welle – danach wird ihr Durchmesser ausgelegt.",
        en: "The shaft transmits the torque, the bearings support it. The tooth force bends and twists the shaft – its diameter is sized for that.",
        fr: "L'arbre transmet le couple, les paliers le soutiennent. L'effort sur les dents fléchit et tord l'arbre : son diamètre est dimensionné pour cela.",
        es: "El eje transmite el par y los rodamientos lo soportan. La fuerza en los dientes flexa y torsiona el eje: su diámetro se dimensiona para ello.",
      },
      fact: {
        de: "Achsabstand: a = m · (z₁ + z₂) / 2.",
        en: "Centre distance: a = m · (z₁ + z₂) / 2.",
        fr: "Entraxe : a = m · (z₁ + z₂) / 2.",
        es: "Distancia entre ejes: a = m · (z₁ + z₂) / 2.",
      },
      quiz: {
        de: "Welches Bauteil überträgt das Drehmoment nach außen?",
        en: "Which part carries the torque to the outside?",
        fr: "Quelle pièce transmet le couple vers l'extérieur ?",
        es: "¿Qué pieza transmite el par hacia el exterior?",
      },
    },
  ],
};

export const EXPLORER_MODELS: Record<ExplorerModelId, ExplorerModel> = { turbofan: TURBOFAN, gearbox: GEARBOX, cell: CELL, heart: HEART, surface: MATH_SURFACE, atom: ATOM, norms: NORMS };
export const MODEL_IDS: ExplorerModelId[] = ["turbofan", "gearbox", "cell", "heart", "surface", "atom", "norms"];

/**
 * Le turboréacteur livré : coupe pédagogique Grab3D (CC0), deux pièces — le
 * carter sur son bâti et le rotor, qui tourne autour de l'axe X. Dans le
 * fichier, le modèle est en mètres, posé au sol ; `lift` le centre.
 */
export const TURBOFAN_FILE = { url: "/models/engineering/turbofan.glb", scale: 1.5, lift: -1.1, rotor: "jet-engine_rotor" } as const;

/** Les filières, dans l'ordre des onglets, avec leur nom. */
export const DISCIPLINES: { id: Discipline; name: LocalText }[] = [
  { id: "engineering", name: { de: "Ingenieurwesen", en: "Engineering", fr: "Ingénierie", es: "Ingeniería" } },
  { id: "medicine", name: { de: "Medizin", en: "Medicine", fr: "Médecine", es: "Medicina" } },
  { id: "mathematics", name: { de: "Mathematik", en: "Mathematics", fr: "Mathématiques", es: "Matemáticas" } },
  { id: "physics", name: { de: "Physik", en: "Physics", fr: "Physique", es: "Física" } },
  { id: "law", name: { de: "Jura", en: "Law", fr: "Droit", es: "Derecho" } },
];
export const modelsOf = (discipline: Discipline): ExplorerModel[] => MODEL_IDS.map((id) => EXPLORER_MODELS[id]).filter((m) => m.discipline === discipline);

/**
 * Le modèle qu'une question annonce, s'il y en a un — pour le bouton « In 3D
 * ansehen » du Hörsaal. On lit la QUESTION de l'étudiant, pas la réponse : un
 * tuteur qui cite un cœur en passant ne doit pas faire surgir un bouton.
 */
export function explorerModelFor(question: string): ExplorerModelId | null {
  const q = (question ?? "").toLowerCase();
  if (!q.trim()) return null;
  for (const id of MODEL_IDS) {
    if (EXPLORER_MODELS[id].keywords.some((k) => new RegExp(k, "u").test(q))) return id;
  }
  return null;
}

/**
 * Un modèle déposé dans `public/models/` : `/explorer?glb=herz-anatomie`
 * charge `/models/herz-anatomie.glb` ; `?glb=engineering/pumpe` charge le fichier
 * du dossier de la filière. Le nom est restreint à des lettres, chiffres et
 * tirets, précédé au plus d'un dossier de filière : il ne peut désigner ni un
 * autre dossier ni un autre site.
 */
export function glbUrl(name: string | null | undefined): string | null {
  return name && /^((engineering|medicine|mathematics|physics|law)\/)?[a-z0-9][a-z0-9-]{0,60}$/.test(name) ? `/models/${name}.glb` : null;
}

export const isModelId = (v: unknown): v is ExplorerModelId => typeof v === "string" && (MODEL_IDS as string[]).includes(v);

export function hotspotOf(model: ExplorerModel, id: string | null | undefined): ExplorerHotspot | null {
  return model.hotspots.find((h) => h.id === id) ?? null;
}

const ASK: LocalText = {
  de: "Erkläre mir am Beispiel „{model}“ das Bauteil „{part}“: Aufgabe, Funktionsprinzip und die wichtigste Formel.",
  en: "Using the example “{model}”, explain the part “{part}” to me: its job, how it works and the most important formula.",
  fr: "Sur l'exemple « {model} », explique-moi la pièce « {part} » : son rôle, son principe et la formule la plus importante.",
  es: "Con el ejemplo «{model}», explícame la pieza «{part}»: su función, su principio y la fórmula más importante.",
};

/** La question remise au Hörsaal par « Im Hörsaal fragen » — préremplie, jamais envoyée d'office. */
export function askPrompt(model: ExplorerModel, hotspot: ExplorerHotspot, locale: string): string {
  return pick(ASK, locale).replace("{model}", pick(model.name, locale)).replace("{part}", pick(hotspot.title, locale));
}

/**
 * À quelle distance la caméra doit se tenir pour que le modèle entier tienne
 * dans le cadre — y compris sur un téléphone tenu debout, où le cadre est
 * étroit : la longueur du modèle doit tenir dans le champ horizontal, sa
 * hauteur dans le champ vertical, et c'est le plus exigeant des deux qui
 * commande.
 *
 * `fovDeg` est le champ VERTICAL de la caméra ; `aspect` = largeur / hauteur.
 * Jamais plus près que la distance de départ du modèle.
 */
export function cameraDistance(model: ExplorerModel, aspect: number, fovDeg: number): number {
  const { min, max } = model.bounds;
  const length = Math.max(max[0] - min[0], max[2] - min[2]);
  const height = max[1] - min[1];
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 0.2);
  // Vue de biais : l'extrémité la plus proche de la caméra paraît plus grande.
  const margin = 1.38;
  const needed = Math.max(((length / 2) * margin) / tanH, ((height / 2) * margin) / tanV);
  return Math.max(Math.hypot(...model.camera), needed);
}

/** La position de départ de la caméra, reculée si le cadre l'exige. */
export function cameraStart(model: ExplorerModel, aspect: number, fovDeg: number): Vec3 {
  const base = Math.hypot(...model.camera);
  const k = cameraDistance(model, aspect, fovDeg) / base;
  return [model.camera[0] * k, model.camera[1] * k, model.camera[2] * k];
}

/** Le modèle « vide » d'un fichier .glb : un cadre, une caméra, aucun repère. */
export function customModel(name: string): ExplorerModel {
  const text = { de: name, en: name, fr: name, es: name };
  return {
    id: "custom",
    discipline: "engineering",
    keywords: [],
    name: text,
    intro: {
      de: "Ein eigenes Modell aus dem Ordner „models“. Ziehe, um es zu drehen.",
      en: "A custom model from the “models” folder. Drag to rotate it.",
      fr: "Un modèle déposé dans le dossier « models ». Glisse pour le faire tourner.",
      es: "Un modelo propio de la carpeta «models». Arrastra para girarlo.",
    },
    bounds: { min: [-2.4, -2.4, -2.4], max: [2.4, 2.4, 2.4] },
    camera: [3.2, 2.6, 6.2],
    hotspots: [],
  };
}
