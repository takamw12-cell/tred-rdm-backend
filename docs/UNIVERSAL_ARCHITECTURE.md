# TRED universel — architecture « Domain-Based Agent »

*7 novembre 2026. Le routeur de domaines et le moteur d'évaluation logique sont codés et en production. Les solveurs finance, lycée, électrotechnique, matériaux et chimie sont planifiés ci-dessous : rien n'est codé tant que le fondateur n'a pas validé.*

## 1. Les trois couches

```
question de l'étudiant
   │
   ├─► solvers/domain.ts      MATIÈRE fine (mots-clés de/fr/en, pondérés)
   │                          mechanik, elektrotechnik, … recht, medizin, wirtschaft
   │
   ├─► lib/domains/           FAMILLE : stem · law · medicine · economics · highschool
   │     index.ts             resolveFamily() + familyHint()
   │     stem.ts law.ts …     une fiche par famille : méthode (prompt), outils,
   │                          évaluation, où chercher dans les documents
   │     structure.ts         moteur d'évaluation logique (evaluate_structure)
   │
   └─► prompts/               MODULE de la matière (Fachmodul), par programme
                              (germany, international, highschool)
```

Tout part dans des messages système **après** le bloc fixe mis en cache. Le prompt principal ne change qu'une fois, pour la règle universelle ; ensuite le cache tient à nouveau.

| Famille | Matières | Méthode | Évaluation |
|---|---|---|---|
| stem | maths, physique, méca, élec, thermo, info, IA, cyber… | les solveurs (prompt principal inchangé) | solveur avec contre-épreuve |
| law | recht | Gutachtenstil : Sachverhalt → Anspruchsgrundlage → Subsumtion → Ergebnis | `evaluate_structure` |
| medicine | medizin | Anamnese → Verdachtsdiagnose → Differenzialdiagnose → Therapie | `evaluate_structure` |
| economics | wirtschaft | Hypothese → Daten → Modell → Schlussfolgerung ; chiffres par les outils | `evaluate_structure` |
| highschool | toute matière au niveau scolaire | langage et notation de l'école | solveurs |

**Niveau scolaire.** Il est détecté par le profil (`level: "school"`) ou par des mots explicites : Abitur, Klasse 10, lycée, terminale, brevet. Le sujet seul ne suffit jamais, car une parabole est aussi un sujet d'université.

## 2. Décisions

- **Outils : toujours tous déclarés.** Une fiche liste les outils *pertinents*, et l'indice les nomme au modèle. Retirer des outils changerait le préfixe et ferait manquer le cache de ~41 000 tokens. Un test vérifie que chaque outil cité existe vraiment.
- **`evaluate_structure` est déterministe.** Des motifs de/fr/en repèrent chaque étape, sa position et un extrait. Le moteur relève les étapes manquantes, les inversions d'ordre (−10 points chacune) et calcule une note sur 100 (25 points par étape). Il **ne juge pas le fond** (bonne norme, bon diagnostic), et le résultat le dit toujours. Le modèle commente ensuite le contenu.
- **Pas de « solution inventée ».** Normes, valeurs cliniques et données viennent des documents de l'étudiant (`suche_in_unterlagen`) ou de la recherche externe, avec la source.
- **Garde-fous de domaine** (à valider par le fondateur) :
  - droit : pas de conseil juridique individuel (RDG) ;
  - médecine : pas de diagnostic pour une personne réelle, renvoi au médecin, 112 en cas d'urgence ;
  - économie : pas de conseil en placement.
- **Ne jamais mélanger les méthodes.** Pas de Gutachtenstil en maths ; pas de calcul de formule à la place d'une subsomption.

## 3. À valider par le fondateur

1. **Motifs des étapes.** Ils sont à faire relire par une juriste et un médecin. En particulier, « Sachverhalt » compte pour 25 points à la demande du fondateur ; en Allemagne, beaucoup de correcteurs n'exigent pas de le reformuler.
2. **Positionnement.** L'identité du prompt (NIVEAU 1) et le site présentent toujours TRED comme un tuteur d'ingénierie. Le paragraphe ajouté l'ouvre aux autres matières sans réécrire l'identité. La landing page et les textes marketing restent à décider.
3. **Le champ « niveau » (école ou université)** n'existe pas encore dans le profil d'études. Il faut l'ajouter à l'onboarding.

## 4. Planifié — solveurs finance et lycée (non codés)

| Fichier | Fonctions | Outil | Contre-épreuve |
|---|---|---|---|
| `finance-solver.ts` | `solveCompoundInterest(P, r, t, n?)`, `solveNPV(cashflows, rate)`, `solveIRR(cashflows)` (Newton + bissection, plusieurs TRI signalés) | `wirtschaft_berechnen` | VAN au TRI = 0 |
| `highschool-solver.ts` | `solveQuadratic(a, b, c)` (discriminant, racines réelles/complexes, sommet), `solvePythagoras(a, b)` | via `mathe_berechnen` (mode lycée) ou outil dédié | réinjection des racines |

## 5. Plan — solveurs électrotechnique, matériaux, chimie (en attente de validation)

**Ce qui existe déjà** et qu'on ne duplique pas :
- `schaltung_berechnen` (MNA, 714 lignes) : Kirchhoff, diviseurs, impédances, Thevenin/Norton, DC/AC, AOP idéal ;
- `mathe_berechnen` : systèmes linéaires ;
- `thermo-solver.ts` : `solveIdealGas`.

| Fichier | Fonctions | Outil | Remarques |
|---|---|---|---|
| `electrical-solver.ts` | `solveOhmLaw(V, I, R)` (une inconnue, plus la puissance), `solveRLC(R, L, C, f)` (série/parallèle : \|Z\|, φ, f₀ = 1/(2π√LC), Q, bande passante), `solveRCTransient(V0, R, C, t, mode)` (τ = RC, charge/décharge, courbe), `solveVoltageDivider(Vin, R1, R2)`, `solveKirchhoff(A, b)` (`mathjs.lusolve`, avec vérification du résidu) | `elektro_berechnen` | les réseaux complets restent sur `schaltung_berechnen` ; le diviseur et Kirchhoff sont recoupés avec lui dans les tests |
| `materials-solver.ts` | `solveHookesLaw(σ, ε)` → E, `solveStress(F, A)`, `solveThermalExpansion(α, L0, ΔT)`, `solveBeamBendingStress(M, c, I)`, `solvePoissonRatio(ε_lat, ε_ax)` (contrôle −1 < ν ≤ 0,5) | `werkstoff_berechnen` | « werkstoffkunde » passe de « sans solveur » à « couvert » ; unités N, mm², MPa, GPa |
| `chemistry-solver.ts` | `solveMolarity(n, V)`, `solveStoichiometry(n, ratio)`, `solvePH(c_H)` / `solvePOH(c_OH)` (25 °C, pKw = 14), `solveIdealGasChem(p, V, T, n)` (L, atm/kPa, °C ; R = 0,082057 L·atm/(mol·K) ; réutilise `solveIdealGas`) | `chemie_berechnen` | « chemie » passe à « couvert » ; avertissement : acides faibles et tampons non couverts |

**Tests de référence.** Valeurs de manuel, au moins 3 par fonction. Quelques exemples :
- RLC série, L = 10 mH, C = 1 µF : f₀ = 1 591,5 Hz ;
- τ = RC = 1 ms : 63,2 % de la charge à t = τ ;
- acier : α = 12·10⁻⁶ /K, ΔL = 1,2 mm pour 1 m et 100 K ;
- 0,01 mol/L H⁺ : pH = 2 ;
- 1 mol à 0 °C et 1 atm : 22,41 L.

**Livraison.** Un commit par solveur, puis l'intégration : domaine, outil, règle du prompt, graphiques (courbe RC, résonance) et étape « Ich berechne die Lösung … ».
