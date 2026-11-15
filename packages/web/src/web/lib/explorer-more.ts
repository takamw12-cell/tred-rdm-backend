import type { ExplorerModel, LocalText } from "./explorer-models";

/**
 * Les modèles des autres filières (2026-11-15) : médecine, mathématiques,
 * physique, droit. Mêmes règles que le turboréacteur (lib/explorer-models.ts) :
 * construits dans le navigateur, textes écrits et relus à l'avance en
 * allemand, anglais, français et espagnol.
 */
const L = (de: string, en: string, fr: string, es: string): LocalText => ({ de, en, fr, es });

/* ── Médecine : la cellule animale, ouverte ──────────────────────────────── */
export const CELL: ExplorerModel = {
  id: "cell",
  discipline: "medicine",
  name: L("Tierische Zelle", "Animal cell", "Cellule animale", "Célula animal"),
  intro: L(
    "Eine tierische Zelle, aufgeschnitten. Tippe auf ein Organell, um seine Aufgabe zu sehen.",
    "An animal cell, cut open. Tap an organelle to see what it does.",
    "Une cellule animale, ouverte. Touche un organite pour voir son rôle.",
    "Una célula animal, abierta. Toca un orgánulo para ver su función.",
  ),
  bounds: { min: [-2.3, -2.2, -2.3], max: [2.3, 1.0, 2.3] },
  camera: [0, 4.4, 5.8],
  hotspots: [
    {
      id: "membrane",
      position: [1.75, -0.02, 0.95],
      title: L("Zellmembran", "Cell membrane", "Membrane plasmique", "Membrana plasmática"),
      text: L(
        "Die Zellmembran grenzt die Zelle nach außen ab. Ihre Lipiddoppelschicht lässt nur bestimmte Stoffe durch; Kanäle und Pumpen regeln gezielt, was hinein- und hinausgelangt.",
        "The cell membrane separates the cell from its surroundings. Its lipid bilayer lets only certain substances through; channels and pumps control what enters and leaves.",
        "La membrane plasmique sépare la cellule de l'extérieur. Sa bicouche lipidique ne laisse passer que certaines substances ; canaux et pompes règlent ce qui entre et sort.",
        "La membrana plasmática separa la célula del exterior. Su bicapa lipídica solo deja pasar ciertas sustancias; canales y bombas regulan lo que entra y sale.",
      ),
      fact: L("Dicke: nur etwa 7–8 Nanometer.", "Thickness: only about 7–8 nanometres.", "Épaisseur : environ 7 à 8 nanomètres seulement.", "Grosor: solo unos 7–8 nanómetros."),
      quiz: L("Welche Struktur regelt, was in die Zelle hinein- und hinausgelangt?", "Which structure controls what enters and leaves the cell?", "Quelle structure règle ce qui entre dans la cellule et en sort ?", "¿Qué estructura regula lo que entra y sale de la célula?"),
    },
    {
      id: "nucleus",
      position: [0, 0.38, 0],
      title: L("Zellkern", "Nucleus", "Noyau", "Núcleo"),
      text: L(
        "Der Zellkern enthält die DNA, den Bauplan der Zelle. Hier wird sie abgelesen: Die mRNA verlässt den Kern durch die Kernporen und trägt die Information zu den Ribosomen.",
        "The nucleus contains the DNA, the cell's blueprint. It is read here: mRNA leaves the nucleus through the nuclear pores and carries the information to the ribosomes.",
        "Le noyau contient l'ADN, le plan de la cellule. Il y est lu : l'ARNm quitte le noyau par les pores nucléaires et porte l'information aux ribosomes.",
        "El núcleo contiene el ADN, el plano de la célula. Aquí se lee: el ARNm sale del núcleo por los poros nucleares y lleva la información a los ribosomas.",
      ),
      fact: L("Beim Menschen: 46 Chromosomen, rund 2 Meter DNA pro Zellkern.", "In humans: 46 chromosomes, about 2 metres of DNA per nucleus.", "Chez l'être humain : 46 chromosomes, environ 2 mètres d'ADN par noyau.", "En el ser humano: 46 cromosomas, unos 2 metros de ADN por núcleo."),
      quiz: L("Wo liegt die Erbinformation der Zelle?", "Where is the cell's genetic information kept?", "Où se trouve l'information génétique de la cellule ?", "¿Dónde está la información genética de la célula?"),
    },
    {
      id: "mitochondrion",
      position: [1.1, -0.2, 0.6],
      title: L("Mitochondrium", "Mitochondrion", "Mitochondrie", "Mitocondria"),
      text: L(
        "Mitochondrien gewinnen aus Nährstoffen und Sauerstoff die Energiewährung ATP (Zellatmung). An ihrer stark gefalteten inneren Membran läuft die Atmungskette ab.",
        "Mitochondria turn nutrients and oxygen into ATP, the cell's energy currency (cellular respiration). The respiratory chain runs along their heavily folded inner membrane.",
        "Les mitochondries tirent des nutriments et de l'oxygène l'ATP, la monnaie énergétique de la cellule (respiration cellulaire). La chaîne respiratoire se déroule sur leur membrane interne, très repliée.",
        "Las mitocondrias obtienen de los nutrientes y el oxígeno el ATP, la moneda energética de la célula (respiración celular). La cadena respiratoria ocurre en su membrana interna, muy plegada.",
      ),
      fact: L("Sie besitzen eigene DNA – vererbt fast nur über die Mutter.", "They have their own DNA – inherited almost only from the mother.", "Elles ont leur propre ADN, transmis presque uniquement par la mère.", "Tienen su propio ADN, heredado casi solo de la madre."),
      quiz: L("Welches Organell stellt den Großteil des ATP her?", "Which organelle produces most of the ATP?", "Quel organite produit l'essentiel de l'ATP ?", "¿Qué orgánulo produce la mayor parte del ATP?"),
    },
    {
      id: "er",
      position: [-0.98, -0.1, 0.35],
      title: L("Endoplasmatisches Retikulum", "Endoplasmic reticulum", "Réticulum endoplasmique", "Retículo endoplasmático"),
      text: L(
        "Das raue ER ist mit Ribosomen besetzt: Hier entstehen Proteine für Membranen und für den Export. Das glatte ER stellt Lipide her und speichert Calcium.",
        "The rough ER is studded with ribosomes: proteins for membranes and for export are made here. The smooth ER produces lipids and stores calcium.",
        "Le RE rugueux est couvert de ribosomes : on y fabrique les protéines des membranes et celles à exporter. Le RE lisse produit des lipides et stocke le calcium.",
        "El RE rugoso está cubierto de ribosomas: aquí se fabrican las proteínas de las membranas y las de exportación. El RE liso produce lípidos y almacena calcio.",
      ),
      fact: L("Seine Membran geht direkt in die Kernhülle über.", "Its membrane is continuous with the nuclear envelope.", "Sa membrane est en continuité avec l'enveloppe nucléaire.", "Su membrana se continúa con la envoltura nuclear."),
      quiz: L("Wo werden Proteine für den Export hergestellt?", "Where are proteins for export made?", "Où sont fabriquées les protéines destinées à l'exportation ?", "¿Dónde se fabrican las proteínas de exportación?"),
    },
    {
      id: "golgi",
      position: [-0.3, -0.18, 1.12],
      title: L("Golgi-Apparat", "Golgi apparatus", "Appareil de Golgi", "Aparato de Golgi"),
      text: L(
        "Der Golgi-Apparat ist die Poststelle der Zelle: Er verändert die Proteine aus dem ER, sortiert sie und verpackt sie in Vesikel für ihren Bestimmungsort.",
        "The Golgi apparatus is the cell's post office: it modifies the proteins coming from the ER, sorts them and packs them into vesicles for their destination.",
        "L'appareil de Golgi est la poste de la cellule : il modifie les protéines venues du RE, les trie et les emballe dans des vésicules vers leur destination.",
        "El aparato de Golgi es la oficina de correos de la célula: modifica las proteínas del RE, las clasifica y las empaqueta en vesículas hacia su destino.",
      ),
      fact: L("Aufbau: ein Stapel flacher Membransäckchen (Zisternen).", "Structure: a stack of flat membrane sacs (cisternae).", "Structure : une pile de saccules membranaires aplatis (citernes).", "Estructura: una pila de sacos membranosos aplanados (cisternas)."),
      quiz: L("Welches Organell sortiert und verpackt Proteine?", "Which organelle sorts and packs proteins?", "Quel organite trie et emballe les protéines ?", "¿Qué orgánulo clasifica y empaqueta las proteínas?"),
    },
  ],
  keywords: ["\\bzelle\\b", "\\bzellkern", "mitochondri", "\\bcell\\b", "\\bcellule\\b", "\\bcélula\\b", "\\bcelula\\b", "organell", "organite", "orgánulo"],
};

/* ── Médecine : le cœur, vu de face ──────────────────────────────────────────
 * Modèle anatomique BodyParts3D 4.0 (CC BY 4.0), converti par
 * models-pipeline/build-heart.mjs. Les positions des repères sont celles que
 * ce script imprime : un point de la surface de chaque pièce, face à l'étudiant. */
/** Le fichier servi (public/models/medicine/heart.glb). */
export const HEART_GLB = "/models/medicine/heart.glb";
/** Pièce du fichier → repère qu'elle allume et qu'elle ouvre au clic (null : ni l'un ni l'autre). */
export const HEART_PART_OF: Record<string, string | null> = {
  "right-atrium": "right-atrium",
  "left-atrium": "left-atrium",
  "right-ventricle": "right-ventricle",
  "left-ventricle": "left-ventricle",
  aorta: "aorta",
  // Les veines caves se jettent dans l'oreillette droite ; le tronc pulmonaire part du ventricule droit.
  "venae-cavae": "right-atrium",
  "pulmonary-trunk": "right-ventricle",
  "heart-other": null,
};

export const HEART: ExplorerModel = {
  id: "heart",
  discipline: "medicine",
  name: L("Herz", "Heart", "Cœur", "Corazón"),
  intro: L(
    "Das Herz von vorn, als anatomisches Modell: Hohlvenen und Lungenstamm (sauerstoffarmes Blut) blau, die Aorta hellrot. Tippe auf einen Punkt.",
    "The heart from the front, as an anatomical model: venae cavae and pulmonary trunk (oxygen-poor blood) in blue, the aorta in bright red. Tap a point.",
    "Le cœur vu de face, en modèle anatomique : veines caves et tronc pulmonaire (sang pauvre en oxygène) en bleu, l'aorte en rouge vif. Touche un point.",
    "El corazón visto de frente, en modelo anatómico: venas cavas y tronco pulmonar (sangre pobre en oxígeno) en azul, la aorta en rojo vivo. Toca un punto.",
  ),
  credit: L(
    "3D-Modell: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International – für TRED umgerechnet und eingefärbt.",
    "3D model: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International – converted and coloured for TRED.",
    "Modèle 3D : BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International – converti et coloré pour TRED.",
    "Modelo 3D: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International – convertido y coloreado para TRED.",
  ),
  bounds: { min: [-1.6, -1.9, -1.7], max: [1.6, 1.9, 1.7] },
  camera: [0, 0.4, 6.6],
  hotspots: [
    {
      id: "right-atrium",
      position: [-0.96, -0.68, 1.11],
      title: L("Rechter Vorhof", "Right atrium", "Oreillette droite", "Aurícula derecha"),
      text: L(
        "Der rechte Vorhof sammelt das sauerstoffarme Blut aus dem Körper, das über die obere und untere Hohlvene ankommt, und gibt es an die rechte Kammer weiter.",
        "The right atrium collects the oxygen-poor blood returning from the body through the superior and inferior venae cavae and passes it to the right ventricle.",
        "L'oreillette droite recueille le sang pauvre en oxygène revenu du corps par les veines caves supérieure et inférieure, et le transmet au ventricule droit.",
        "La aurícula derecha recoge la sangre pobre en oxígeno que vuelve del cuerpo por las venas cavas superior e inferior y la pasa al ventrículo derecho.",
      ),
      fact: L("Hier sitzt der Sinusknoten, der natürliche Schrittmacher.", "The sinoatrial node, the natural pacemaker, sits here.", "C'est ici que se trouve le nœud sinusal, le stimulateur naturel.", "Aquí se encuentra el nódulo sinusal, el marcapasos natural."),
      quiz: L("Wo kommt das sauerstoffarme Blut aus dem Körper an?", "Where does the oxygen-poor blood from the body arrive?", "Où arrive le sang pauvre en oxygène venu du corps ?", "¿Adónde llega la sangre pobre en oxígeno del cuerpo?"),
    },
    {
      id: "right-ventricle",
      position: [0.14, -1.02, 1.42],
      title: L("Rechte Kammer", "Right ventricle", "Ventricule droit", "Ventrículo derecho"),
      text: L(
        "Die rechte Kammer pumpt das Blut durch die Lungenarterie in die Lunge (kleiner Kreislauf). Dort gibt es Kohlendioxid ab und nimmt Sauerstoff auf.",
        "The right ventricle pumps the blood through the pulmonary artery into the lungs (pulmonary circulation). There it releases carbon dioxide and takes up oxygen.",
        "Le ventricule droit envoie le sang dans les poumons par l'artère pulmonaire (petite circulation). Il y cède son dioxyde de carbone et se charge en oxygène.",
        "El ventrículo derecho bombea la sangre a los pulmones por la arteria pulmonar (circulación menor). Allí cede dióxido de carbono y toma oxígeno.",
      ),
      fact: L("Druck: nur etwa 25 mmHg – die Lunge liegt gleich nebenan.", "Pressure: only about 25 mmHg – the lungs are right next door.", "Pression : environ 25 mmHg seulement, les poumons sont tout proches.", "Presión: solo unos 25 mmHg; los pulmones están justo al lado."),
      quiz: L("Welche Kammer pumpt das Blut in die Lunge?", "Which chamber pumps blood into the lungs?", "Quelle cavité envoie le sang dans les poumons ?", "¿Qué cavidad bombea la sangre a los pulmones?"),
    },
    {
      id: "left-atrium",
      position: [0.75, -0.1, 0.9],
      title: L("Linker Vorhof", "Left atrium", "Oreillette gauche", "Aurícula izquierda"),
      text: L(
        "Der linke Vorhof nimmt das sauerstoffreiche Blut aus der Lunge auf, das über die vier Lungenvenen zurückkommt, und füllt damit die linke Kammer.",
        "The left atrium receives the oxygen-rich blood returning from the lungs through the four pulmonary veins and fills the left ventricle with it.",
        "L'oreillette gauche reçoit le sang riche en oxygène revenu des poumons par les quatre veines pulmonaires, et en remplit le ventricule gauche.",
        "La aurícula izquierda recibe la sangre rica en oxígeno que vuelve de los pulmones por las cuatro venas pulmonares y llena con ella el ventrículo izquierdo.",
      ),
      fact: L("Zwischen Vorhof und Kammer: die Mitralklappe.", "Between atrium and ventricle: the mitral valve.", "Entre l'oreillette et le ventricule : la valve mitrale.", "Entre la aurícula y el ventrículo: la válvula mitral."),
      quiz: L("Wo kommt das sauerstoffreiche Blut aus der Lunge an?", "Where does the oxygen-rich blood from the lungs arrive?", "Où arrive le sang riche en oxygène venu des poumons ?", "¿Adónde llega la sangre rica en oxígeno de los pulmones?"),
    },
    {
      id: "left-ventricle",
      position: [0.95, -1.22, 1.05],
      title: L("Linke Kammer", "Left ventricle", "Ventricule gauche", "Ventrículo izquierdo"),
      text: L(
        "Die linke Kammer pumpt das Blut durch die Aorta in den ganzen Körper (großer Kreislauf). Ihre Wand ist deutlich dicker als die der rechten Kammer, weil sie gegen viel höheren Druck arbeitet.",
        "The left ventricle pumps the blood through the aorta to the whole body (systemic circulation). Its wall is much thicker than that of the right ventricle because it works against far higher pressure.",
        "Le ventricule gauche envoie le sang dans tout le corps par l'aorte (grande circulation). Sa paroi est bien plus épaisse que celle du ventricule droit, car il travaille contre une pression beaucoup plus forte.",
        "El ventrículo izquierdo bombea la sangre a todo el cuerpo por la aorta (circulación mayor). Su pared es mucho más gruesa que la del derecho porque trabaja contra una presión muy superior.",
      ),
      fact: L("Druck in der Auswurfphase: etwa 120 mmHg.", "Pressure during ejection: about 120 mmHg.", "Pression pendant l'éjection : environ 120 mmHg.", "Presión durante la eyección: unos 120 mmHg."),
      quiz: L("Welche Kammer hat die dickste Wand?", "Which chamber has the thickest wall?", "Quelle cavité a la paroi la plus épaisse ?", "¿Qué cavidad tiene la pared más gruesa?"),
      steps: [
        { tex: "HZV = HF \\cdot SV", note: L("Herzzeitvolumen = Herzfrequenz mal Schlagvolumen.", "Cardiac output = heart rate times stroke volume.", "Débit cardiaque = fréquence cardiaque fois volume d'éjection.", "Gasto cardíaco = frecuencia cardíaca por volumen sistólico.") },
        { tex: "HZV \\approx 70\\,\\tfrac{1}{\\text{min}} \\cdot 70\\,\\text{ml}", note: L("In Ruhe, beim Erwachsenen.", "At rest, in an adult.", "Au repos, chez l'adulte.", "En reposo, en el adulto.") },
        { tex: "HZV \\approx 5\\,\\tfrac{\\text{l}}{\\text{min}}", note: L("Das gesamte Blutvolumen – einmal pro Minute.", "The entire blood volume – once a minute.", "Tout le volume sanguin, une fois par minute.", "Todo el volumen sanguíneo, una vez por minuto.") },
      ],
    },
    {
      id: "aorta",
      position: [-0.42, 1.22, 0.46],
      title: L("Aorta", "Aorta", "Aorte", "Aorta"),
      text: L(
        "Die Aorta ist die Hauptschlagader. Sie entspringt der linken Kammer, verläuft im Bogen und verteilt das sauerstoffreiche Blut auf alle Arterien des Körpers.",
        "The aorta is the main artery. It arises from the left ventricle, curves in an arch and distributes the oxygen-rich blood to all the arteries of the body.",
        "L'aorte est l'artère principale. Elle naît du ventricule gauche, décrit une crosse et distribue le sang riche en oxygène à toutes les artères du corps.",
        "La aorta es la arteria principal. Nace del ventrículo izquierdo, forma un arco y distribuye la sangre rica en oxígeno a todas las arterias del cuerpo.",
      ),
      fact: L("Durchmesser beim Erwachsenen: etwa 2,5 bis 3,5 cm.", "Diameter in adults: about 2.5 to 3.5 cm.", "Diamètre chez l'adulte : environ 2,5 à 3,5 cm.", "Diámetro en el adulto: de 2,5 a 3,5 cm aproximadamente."),
      quiz: L("Welches Gefäß verteilt das Blut auf den ganzen Körper?", "Which vessel distributes blood to the whole body?", "Quel vaisseau distribue le sang à tout le corps ?", "¿Qué vaso distribuye la sangre a todo el cuerpo?"),
    },
  ],
  keywords: ["\\bherz\\b", "\\bherzens\\b", "herzkammer", "vorhof", "\\bheart\\b", "c(œ|oe)ur", "\\bcoraz[oó]n\\b", "ventricule", "oreillette", "ventrículo", "aurícula"],
};

/* ── Mathématiques : la surface z = sin x + cos y ────────────────────────── */
/** Échelle du dessin : une unité mathématique = 0,8 unité de scène ; z (math) monte selon Y (scène). */
export const SURFACE = { scale: 0.8, range: Math.PI } as const;
export const surfaceHeight = (x: number, y: number) => Math.sin(x) + Math.cos(y);
/** Un point (x, y) du plan → sa place dans la scène. */
export const surfacePoint = (x: number, y: number): [number, number, number] => [x * SURFACE.scale, surfaceHeight(x, y) * SURFACE.scale, y * SURFACE.scale];

/** Le gradient de f(x, y) = sin x + cos y. */
export const surfaceGradient = (x: number, y: number): [number, number] => [Math.cos(x), -Math.sin(y)];
/** Un pas de descente de gradient : (x, y) − η·∇f. Les billes de la scène avancent ainsi. */
export function descend(x: number, y: number, eta: number): [number, number] {
  const [gx, gy] = surfaceGradient(x, y);
  return [x - eta * gx, y - eta * gy];
}

export const MATH_SURFACE: ExplorerModel = {
  id: "surface",
  discipline: "mathematics",
  name: L("Fläche z = sin x + cos y", "Surface z = sin x + cos y", "Surface z = sin x + cos y", "Superficie z = sin x + cos y"),
  intro: L(
    "Der Graph einer Funktion von zwei Variablen. Drehe die Fläche und tippe auf einen Punkt: Gipfel, Tal, Sattel. Die Kugeln rollen in Richtung des steilsten Abstiegs (−∇f).",
    "The graph of a function of two variables. Turn the surface and tap a point: peak, valley, saddle. The balls roll in the direction of steepest descent (−∇f).",
    "Le graphe d'une fonction de deux variables. Fais tourner la surface et touche un point : sommet, creux, col. Les billes roulent dans la direction de la plus grande pente (−∇f).",
    "La gráfica de una función de dos variables. Gira la superficie y toca un punto: cima, valle, puerto. Las bolas ruedan en la dirección de máximo descenso (−∇f).",
  ),
  bounds: { min: [-2.7, -1.9, -2.7], max: [2.7, 1.9, 2.7] },
  camera: [5.8, 5.2, 7.8],
  hotspots: [
    {
      id: "maximum",
      position: surfacePoint(Math.PI / 2, 0),
      title: L("Maximum", "Maximum", "Maximum", "Máximo"),
      text: L(
        "Hier erreicht die Fläche ihren höchsten Wert: sin x = 1 und cos y = 1 gleichzeitig. Beide partiellen Ableitungen sind null, und in jede Richtung geht es bergab.",
        "The surface reaches its highest value here: sin x = 1 and cos y = 1 at the same time. Both partial derivatives are zero, and it goes downhill in every direction.",
        "La surface atteint ici sa plus grande valeur : sin x = 1 et cos y = 1 en même temps. Les deux dérivées partielles sont nulles, et l'on descend dans toutes les directions.",
        "Aquí la superficie alcanza su valor más alto: sin x = 1 y cos y = 1 a la vez. Las dos derivadas parciales son cero y en todas las direcciones se baja.",
      ),
      fact: L("Punkt (π/2, 0), Höhe z = 2.", "Point (π/2, 0), height z = 2.", "Point (π/2, 0), hauteur z = 2.", "Punto (π/2, 0), altura z = 2."),
      quiz: L("Wo ist die Fläche am höchsten?", "Where is the surface highest?", "Où la surface est-elle la plus haute ?", "¿Dónde es más alta la superficie?"),
      steps: [
        { tex: "f(x,y) = \\sin x + \\cos y", note: L("Die Funktion.", "The function.", "La fonction.", "La función.") },
        { tex: "\\nabla f = (\\cos x,\\; -\\sin y)", note: L("Der Gradient: die beiden partiellen Ableitungen.", "The gradient: the two partial derivatives.", "Le gradient : les deux dérivées partielles.", "El gradiente: las dos derivadas parciales.") },
        { tex: "\\nabla f = 0 \\;\\Rightarrow\\; \\cos x = 0,\\; \\sin y = 0", note: L("Kritische Punkte: dort ist die Tangentialebene waagerecht.", "Critical points: the tangent plane is horizontal there.", "Points critiques : le plan tangent y est horizontal.", "Puntos críticos: allí el plano tangente es horizontal.") },
        { tex: "\\det H = f_{xx}\\, f_{yy} - f_{xy}^2 = \\sin x \\cos y", note: L("Die Hesse-Matrix entscheidet: det H > 0 Extremum, det H < 0 Sattel.", "The Hessian decides: det H > 0 extremum, det H < 0 saddle.", "La hessienne tranche : det H > 0 extremum, det H < 0 col.", "La hessiana decide: det H > 0 extremo, det H < 0 punto de silla.") },
      ],
    },
    {
      id: "minimum",
      position: surfacePoint(-Math.PI / 2, Math.PI),
      title: L("Minimum", "Minimum", "Minimum", "Mínimo"),
      text: L(
        "Der tiefste Punkt der Fläche: sin x = −1 und cos y = −1. Der Gradient ist null, die Hesse-Matrix ist positiv definit – in jede Richtung geht es bergauf.",
        "The lowest point of the surface: sin x = −1 and cos y = −1. The gradient is zero and the Hessian is positive definite – it goes uphill in every direction.",
        "Le point le plus bas de la surface : sin x = −1 et cos y = −1. Le gradient est nul et la hessienne est définie positive : on monte dans toutes les directions.",
        "El punto más bajo de la superficie: sin x = −1 y cos y = −1. El gradiente es cero y la hessiana es definida positiva: en todas las direcciones se sube.",
      ),
      fact: L("Punkt (−π/2, π), Höhe z = −2.", "Point (−π/2, π), height z = −2.", "Point (−π/2, π), hauteur z = −2.", "Punto (−π/2, π), altura z = −2."),
      quiz: L("Wo ist die Fläche am tiefsten?", "Where is the surface lowest?", "Où la surface est-elle la plus basse ?", "¿Dónde es más baja la superficie?"),
    },
    {
      id: "saddle",
      position: surfacePoint(Math.PI / 2, Math.PI),
      title: L("Sattelpunkt", "Saddle point", "Point col", "Punto de silla"),
      text: L(
        "Auch hier ist der Gradient null – aber es ist kein Extremum. In x-Richtung ist es ein Gipfel, in y-Richtung ein Tal: Die Hesse-Matrix hat Eigenwerte mit verschiedenen Vorzeichen.",
        "The gradient is zero here too – but it is not an extremum. Along x it is a peak, along y a valley: the Hessian has eigenvalues of opposite signs.",
        "Ici aussi le gradient est nul, mais ce n'est pas un extremum. Selon x c'est un sommet, selon y un creux : la hessienne a des valeurs propres de signes opposés.",
        "Aquí el gradiente también es cero, pero no es un extremo. Según x es una cima, según y un valle: la hessiana tiene valores propios de signos opuestos.",
      ),
      fact: L("Punkt (π/2, π), Höhe z = 0, det H = −1 < 0.", "Point (π/2, π), height z = 0, det H = −1 < 0.", "Point (π/2, π), hauteur z = 0, det H = −1 < 0.", "Punto (π/2, π), altura z = 0, det H = −1 < 0."),
      quiz: L("Wo ist der Gradient null, ohne dass ein Extremum vorliegt?", "Where is the gradient zero without there being an extremum?", "Où le gradient est-il nul sans qu'il y ait d'extremum ?", "¿Dónde es cero el gradiente sin que haya un extremo?"),
    },
    {
      id: "slope",
      position: surfacePoint(0, Math.PI / 2),
      title: L("Gradient am Hang", "Gradient on the slope", "Gradient sur la pente", "Gradiente en la ladera"),
      text: L(
        "An diesem Punkt zeigt der Gradient (1, −1) in die Richtung des steilsten Anstiegs. Senkrecht dazu verläuft die Höhenlinie: Dort ändert sich z nicht.",
        "At this point the gradient (1, −1) points in the direction of steepest ascent. The contour line runs perpendicular to it: z does not change along it.",
        "En ce point, le gradient (1, −1) indique la direction de plus forte montée. La ligne de niveau lui est perpendiculaire : z n'y change pas.",
        "En este punto el gradiente (1, −1) señala la dirección de máxima subida. La curva de nivel le es perpendicular: en ella z no cambia.",
      ),
      fact: L("Punkt (0, π/2), Höhe z = 0, Steigung |∇f| = √2.", "Point (0, π/2), height z = 0, slope |∇f| = √2.", "Point (0, π/2), hauteur z = 0, pente |∇f| = √2.", "Punto (0, π/2), altura z = 0, pendiente |∇f| = √2."),
      quiz: L("Wohin zeigt der Gradient?", "Where does the gradient point?", "Dans quelle direction pointe le gradient ?", "¿Hacia dónde apunta el gradiente?"),
    },
  ],
  keywords: ["sattelpunkt", "partielle ableitung", "hesse-?matrix", "saddle point", "partial derivative", "point col", "dérivée partielle", "derivee partielle", "punto de silla", "derivada parcial", "\\bgradient", "\\bgradiente\\b"],
};

/* ── Physique : l'atome de carbone, modèle des couches ───────────────────── */
export const ATOM_SHELLS = { k: { radius: 1.05, electrons: 2 }, l: { radius: 2.0, electrons: 4 } } as const;

export const ATOM: ExplorerModel = {
  id: "atom",
  discipline: "physics",
  name: L("Kohlenstoffatom", "Carbon atom", "Atome de carbone", "Átomo de carbono"),
  intro: L(
    "Ein Kohlenstoffatom: 6 Protonen und 6 Neutronen im Kern, 6 Elektronen. Die Kreise sind das Schalenmodell; die Punktwolken sind aus den Orbitalen 1s, 2s und 2p berechnet (Form wie beim Wasserstoff, Größen nicht maßstäblich). Tippe auf einen Punkt.",
    "A carbon atom: 6 protons and 6 neutrons in the nucleus, 6 electrons. The circles are the shell model; the point clouds are computed from the 1s, 2s and 2p orbitals (hydrogen-like shapes, sizes not to scale). Tap a point.",
    "Un atome de carbone : 6 protons et 6 neutrons dans le noyau, 6 électrons. Les cercles sont le modèle en couches ; les nuages de points sont calculés à partir des orbitales 1s, 2s et 2p (formes de type hydrogène, tailles non à l'échelle). Touche un point.",
    "Un átomo de carbono: 6 protones y 6 neutrones en el núcleo, 6 electrones. Los círculos son el modelo de capas; las nubes de puntos se calculan a partir de los orbitales 1s, 2s y 2p (formas de tipo hidrógeno, tamaños no a escala). Toca un punto.",
  ),
  bounds: { min: [-2.4, -2.4, -2.4], max: [2.4, 2.4, 2.4] },
  camera: [2.6, 3.4, 6.2],
  hotspots: [
    {
      id: "nucleus",
      position: [0, 0.42, 0],
      title: L("Atomkern", "Nucleus", "Noyau", "Núcleo"),
      text: L(
        "Im Kern sitzen die Protonen (positiv) und die Neutronen (neutral). Die starke Kernkraft hält sie zusammen, obwohl sich die Protonen elektrisch abstoßen.",
        "The nucleus holds the protons (positive) and the neutrons (neutral). The strong nuclear force binds them together although the protons repel each other electrically.",
        "Le noyau contient les protons (positifs) et les neutrons (neutres). L'interaction forte les maintient ensemble, bien que les protons se repoussent électriquement.",
        "El núcleo contiene los protones (positivos) y los neutrones (neutros). La fuerza nuclear fuerte los mantiene unidos aunque los protones se repelen eléctricamente.",
      ),
      fact: L("Fast die gesamte Masse – bei einem Hunderttausendstel des Durchmessers.", "Almost all the mass – in one hundred-thousandth of the diameter.", "Presque toute la masse, dans un cent-millième du diamètre.", "Casi toda la masa, en una cienmilésima del diámetro."),
      quiz: L("Wo steckt fast die gesamte Masse des Atoms?", "Where is almost all of the atom's mass?", "Où se trouve presque toute la masse de l'atome ?", "¿Dónde está casi toda la masa del átomo?"),
    },
    {
      id: "k-shell",
      position: [ATOM_SHELLS.k.radius, 0.05, 0],
      title: L("K-Schale", "K shell", "Couche K", "Capa K"),
      text: L(
        "Die innerste Schale fasst höchstens 2 Elektronen. Sie sind am stärksten an den Kern gebunden: Um sie zu entfernen, braucht man die meiste Energie.",
        "The innermost shell holds at most 2 electrons. They are the most strongly bound to the nucleus: removing them takes the most energy.",
        "La couche la plus interne contient au plus 2 électrons. Ce sont les plus liés au noyau : il faut le plus d'énergie pour les arracher.",
        "La capa más interna admite como máximo 2 electrones. Son los más ligados al núcleo: arrancarlos requiere la mayor energía.",
      ),
      fact: L("Maximal 2n² Elektronen je Schale: n = 1 → 2.", "At most 2n² electrons per shell: n = 1 → 2.", "Au plus 2n² électrons par couche : n = 1 → 2.", "Como máximo 2n² electrones por capa: n = 1 → 2."),
      quiz: L("Welche Schale fasst höchstens zwei Elektronen?", "Which shell holds at most two electrons?", "Quelle couche contient au plus deux électrons ?", "¿Qué capa admite como máximo dos electrones?"),
    },
    {
      id: "valence",
      position: [-ATOM_SHELLS.l.radius, 0.05, 0],
      title: L("Valenzschale (L)", "Valence shell (L)", "Couche de valence (L)", "Capa de valencia (L)"),
      text: L(
        "Auf der äußeren Schale hat Kohlenstoff 4 Elektronen. Sie bestimmen sein chemisches Verhalten: Kohlenstoff geht vier Bindungen ein – die Grundlage der organischen Chemie.",
        "Carbon has 4 electrons on its outer shell. They determine its chemical behaviour: carbon forms four bonds – the basis of organic chemistry.",
        "Sur sa couche externe, le carbone a 4 électrons. Ils déterminent son comportement chimique : le carbone forme quatre liaisons, base de la chimie organique.",
        "En su capa externa el carbono tiene 4 electrones. Determinan su comportamiento químico: el carbono forma cuatro enlaces, base de la química orgánica.",
      ),
      fact: L("Elektronenkonfiguration: 1s² 2s² 2p².", "Electron configuration: 1s² 2s² 2p².", "Configuration électronique : 1s² 2s² 2p².", "Configuración electrónica: 1s² 2s² 2p²."),
      quiz: L("Welche Elektronen bestimmen das chemische Verhalten?", "Which electrons determine the chemical behaviour?", "Quels électrons déterminent le comportement chimique ?", "¿Qué electrones determinan el comportamiento químico?"),
      steps: [
        { tex: "E_n = -\\dfrac{13{,}6\\,\\text{eV}}{n^2}", note: L("Energieniveaus des Wasserstoffatoms (Bohr).", "Energy levels of the hydrogen atom (Bohr).", "Niveaux d'énergie de l'atome d'hydrogène (Bohr).", "Niveles de energía del átomo de hidrógeno (Bohr).") },
        { tex: "\\Delta E = E_2 - E_1 = 10{,}2\\,\\text{eV}", note: L("Sprung von n = 1 nach n = 2.", "Jump from n = 1 to n = 2.", "Saut de n = 1 à n = 2.", "Salto de n = 1 a n = 2.") },
        { tex: "\\Delta E = h \\cdot f", note: L("Diese Energie trägt ein Photon der Frequenz f.", "A photon of frequency f carries this energy.", "Un photon de fréquence f porte cette énergie.", "Un fotón de frecuencia f lleva esta energía.") },
      ],
    },
    {
      id: "limits",
      position: [0, 1.85, 0.6],
      title: L("Grenzen des Modells", "Limits of the model", "Limites du modèle", "Límites del modelo"),
      text: L(
        "Elektronen laufen in Wirklichkeit nicht auf Kreisbahnen. Die Quantenmechanik beschreibt sie durch Orbitale: Bereiche, in denen man das Elektron mit hoher Wahrscheinlichkeit antrifft.",
        "In reality electrons do not travel on circular paths. Quantum mechanics describes them by orbitals: regions where the electron is found with high probability.",
        "En réalité, les électrons ne suivent pas des orbites circulaires. La mécanique quantique les décrit par des orbitales : des régions où l'on trouve l'électron avec une forte probabilité.",
        "En realidad los electrones no recorren órbitas circulares. La mecánica cuántica los describe mediante orbitales: regiones donde es muy probable encontrar el electrón.",
      ),
      fact: L("Das Schalenmodell erklärt das Periodensystem, nicht die Form der Moleküle.", "The shell model explains the periodic table, not the shape of molecules.", "Le modèle en couches explique le tableau périodique, pas la forme des molécules.", "El modelo de capas explica la tabla periódica, no la forma de las moléculas."),
      quiz: L("Warum sind die Kreisbahnen nur ein Modell?", "Why are the circular paths only a model?", "Pourquoi les orbites circulaires ne sont-elles qu'un modèle ?", "¿Por qué las órbitas circulares son solo un modelo?"),
    },
  ],
  keywords: ["\\batom\\b", "\\batoms\\b", "atomkern", "elektronenschale", "schalenmodell", "\\batome\\b", "\\bátomo\\b", "\\batomo\\b", "bohr"],
};

/* ── Droit : la hiérarchie des normes (Allemagne) ────────────────────────── */
/** Les étages de la pyramide, du sommet à la base : [id, hauteur du milieu, demi-largeur]. */
export const NORM_LEVELS = [
  { id: "constitution", y: 1.3, half: 0.7 },
  { id: "statute", y: 0.45, half: 1.15 },
  { id: "ordinance", y: -0.4, half: 1.6 },
  { id: "bylaw", y: -1.25, half: 2.05 },
] as const;
const levelSpot = (i: number): [number, number, number] => [0, NORM_LEVELS[i].y, NORM_LEVELS[i].half + 0.04];

export const NORMS: ExplorerModel = {
  id: "norms",
  discipline: "law",
  name: L("Normenpyramide", "Hierarchy of norms", "Pyramide des normes", "Pirámide normativa"),
  intro: L(
    "Die Rangordnung der Rechtsnormen in Deutschland: Die höhere Norm geht der niedrigeren vor. Tippe auf eine Stufe.",
    "The ranking of legal norms in Germany: the higher norm takes precedence over the lower one. Tap a level.",
    "La hiérarchie des normes en Allemagne : la norme supérieure prime sur la norme inférieure. Touche un étage.",
    "La jerarquía de las normas en Alemania: la norma superior prevalece sobre la inferior. Toca un nivel.",
  ),
  bounds: { min: [-2.4, -1.9, -2.4], max: [2.4, 2.0, 2.4] },
  camera: [3.4, 2.6, 6.4],
  hotspots: [
    {
      id: "constitution",
      position: levelSpot(0),
      title: L("Grundgesetz", "Basic Law (constitution)", "Loi fondamentale", "Ley Fundamental"),
      text: L(
        "An der Spitze steht das Grundgesetz. Gesetzgebung, Verwaltung und Rechtsprechung sind daran gebunden; ein Gesetz, das ihm widerspricht, kann das Bundesverfassungsgericht für nichtig erklären.",
        "The Basic Law is at the top. Legislature, administration and courts are bound by it; a statute that contradicts it can be declared void by the Federal Constitutional Court.",
        "Au sommet se trouve la Loi fondamentale. Le législateur, l'administration et les juges y sont soumis ; une loi qui la contredit peut être annulée par la Cour constitutionnelle fédérale.",
        "En la cima está la Ley Fundamental. El legislador, la administración y los jueces están sujetos a ella; el Tribunal Constitucional Federal puede anular una ley que la contradiga.",
      ),
      fact: L("Art. 20 Abs. 3 GG; unabänderlicher Kern: Art. 79 Abs. 3 GG.", "Art. 20(3) GG; unamendable core: Art. 79(3) GG.", "Art. 20 al. 3 GG ; noyau intangible : art. 79 al. 3 GG.", "Art. 20.3 GG; núcleo intangible: art. 79.3 GG."),
      quiz: L("Welche Norm steht über allen anderen?", "Which norm ranks above all others?", "Quelle norme est au-dessus de toutes les autres ?", "¿Qué norma está por encima de todas las demás?"),
    },
    {
      id: "statute",
      position: levelSpot(1),
      title: L("Formelles Gesetz", "Parliamentary statute", "Loi formelle", "Ley formal"),
      text: L(
        "Formelle Gesetze werden vom Parlament im Gesetzgebungsverfahren beschlossen – etwa das BGB oder das StGB. Wesentliche Entscheidungen muss der Gesetzgeber selbst treffen (Wesentlichkeitstheorie).",
        "Parliamentary statutes are passed by parliament in the legislative procedure – for example the Civil Code (BGB) or the Criminal Code (StGB). Parliament must take the essential decisions itself.",
        "Les lois formelles sont adoptées par le Parlement selon la procédure législative, par exemple le BGB ou le StGB. Les décisions essentielles doivent être prises par le législateur lui-même.",
        "Las leyes formales las aprueba el Parlamento por el procedimiento legislativo, por ejemplo el BGB o el StGB. Las decisiones esenciales debe tomarlas el propio legislador.",
      ),
      fact: L("Bundesrecht bricht Landesrecht (Art. 31 GG).", "Federal law overrides state law (Art. 31 GG).", "Le droit fédéral prime le droit des Länder (art. 31 GG).", "El derecho federal prevalece sobre el de los Länder (art. 31 GG)."),
      quiz: L("Welche Normen beschließt das Parlament?", "Which norms does parliament pass?", "Quelles normes le Parlement adopte-t-il ?", "¿Qué normas aprueba el Parlamento?"),
    },
    {
      id: "ordinance",
      position: levelSpot(2),
      title: L("Rechtsverordnung", "Statutory instrument", "Règlement", "Reglamento"),
      text: L(
        "Rechtsverordnungen erlässt die Exekutive – aber nur, wenn ein Gesetz sie dazu ermächtigt. Das Gesetz muss Inhalt, Zweck und Ausmaß der Ermächtigung selbst bestimmen. Beispiel: die StVO.",
        "Statutory instruments are issued by the executive – but only if a statute authorises it. The statute itself must define the content, purpose and scope of the authorisation. Example: the Road Traffic Regulations (StVO).",
        "Les règlements sont pris par l'exécutif, mais seulement si une loi l'y habilite. La loi doit fixer elle-même le contenu, le but et l'étendue de l'habilitation. Exemple : le code de la route (StVO).",
        "Los reglamentos los dicta el ejecutivo, pero solo si una ley lo habilita. La propia ley debe fijar el contenido, la finalidad y el alcance de la habilitación. Ejemplo: el reglamento de circulación (StVO).",
      ),
      fact: L("Ermächtigung: Art. 80 Abs. 1 GG.", "Authorisation: Art. 80(1) GG.", "Habilitation : art. 80 al. 1 GG.", "Habilitación: art. 80.1 GG."),
      quiz: L("Welche Normen erlässt die Exekutive aufgrund eines Gesetzes?", "Which norms does the executive issue on the basis of a statute?", "Quelles normes l'exécutif prend-il sur le fondement d'une loi ?", "¿Qué normas dicta el ejecutivo en virtud de una ley?"),
    },
    {
      id: "bylaw",
      position: levelSpot(3),
      title: L("Satzung", "By-law", "Statut autonome", "Estatuto autónomo"),
      text: L(
        "Satzungen geben sich selbstverwaltete Körperschaften für ihre eigenen Angelegenheiten: Gemeinden, Universitäten, Kammern. Die Prüfungsordnung deiner Hochschule ist eine Satzung.",
        "By-laws are adopted by self-governing bodies for their own affairs: municipalities, universities, professional chambers. Your university's examination regulations are a by-law.",
        "Les statuts sont adoptés par des collectivités autonomes pour leurs propres affaires : communes, universités, chambres professionnelles. Le règlement des examens de ton université en est un.",
        "Los estatutos los aprueban las corporaciones autónomas para sus propios asuntos: municipios, universidades, colegios profesionales. El reglamento de exámenes de tu universidad es uno.",
      ),
      fact: L("Über dem deutschen Recht: der Anwendungsvorrang des EU-Rechts.", "Above German law: EU law takes precedence in application.", "Au-dessus du droit allemand : la primauté d'application du droit de l'Union.", "Por encima del derecho alemán: la primacía de aplicación del derecho de la Unión."),
      quiz: L("Welche Normen gibt sich eine Hochschule selbst?", "Which norms does a university give itself?", "Quelles normes une université se donne-t-elle elle-même ?", "¿Qué normas se da a sí misma una universidad?"),
    },
  ],
  keywords: ["normenhierarchie", "normenpyramide", "rechtsverordnung", "rangordnung der normen", "hierarchy of norms", "hi[ée]rarchie des normes", "pyramide des normes", "jerarqu[ií]a normativa", "pir[aá]mide normativa"],
};
