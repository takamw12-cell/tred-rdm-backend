# TRED universel — architecture « Domain-Based Agent »

*7 novembre 2026, mis à jour le même jour. Codé : le routeur de domaines (10 familles), le moteur d'évaluation logique (9 structures), les solveurs électrotechnique, matériaux, chimie, finance et lycée, et le champ « niveau » du profil d'études.*

## 1. Les trois couches

```
question de l'étudiant
   │
   ├─► solvers/domain.ts      MATIÈRE fine (mots-clés de/fr/en, pondérés)
   │                          mechanik, elektrotechnik, … recht, medizin, wirtschaft
   │
   ├─► lib/domains/           FAMILLE : stem · law · medicine · economics · biology ·
   │                          psychology · philosophy · languages · history · highschool
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
| economics | wirtschaft | Hypothese → Daten → Modell → Schlussfolgerung ; chiffres par `wirtschaft_berechnen` | `evaluate_structure` |
| biology | biologie | Fragestellung → Hypothese → Durchführung → Beobachtung → Deutung ; cellule, génétique (Punnett) | `evaluate_structure` (biologie) |
| psychology | psychologie | Theorie → Hypothese → Methode → Ergebnisse → Diskussion ; analyse comportementale SORKC ; biais cognitifs | `evaluate_structure` (psychologie, verhaltensanalyse) |
| philosophy | philosophie | These → Argument → Einwand → Fazit ; validité, sophismes, éthique (positions exposées, pas prêchées) | `evaluate_structure` (philosophie) |
| languages | sprachen | allemand, anglais, français : forme fausse → forme juste → règle ; tableaux de conjugaison ; rédaction | `evaluate_structure` (sprachen) |
| history | geschichte | Quelle → Datierung → Inhalt → Kontext → Urteil ; chronologie | `evaluate_structure` (geschichte) |
| highschool | maths et sciences au niveau scolaire | langage et notation de l'école ; `schule_berechnen` | solveurs |

**Lycée et méthode.** Une matière à méthode propre (droit, histoire, langues…) garde sa famille même à l'école : l'indice ajoute « SCHULNIVEAU ». Les maths et les sciences au lycée passent par la famille `highschool`.

**Niveau scolaire.** Il est détecté par le profil (`level: "school"`) ou par des mots explicites : Abitur, Klasse 10, lycée, terminale, brevet. Le sujet seul ne suffit jamais, car une parabole est aussi un sujet d'université.

## 2. Décisions

- **Outils : toujours tous déclarés.** Une fiche liste les outils *pertinents*, et l'indice les nomme au modèle. Retirer des outils changerait le préfixe et ferait manquer le cache de ~41 000 tokens. Un test vérifie que chaque outil cité existe vraiment.
- **`evaluate_structure` est déterministe.** Des motifs de/fr/en repèrent chaque étape, sa position et un extrait. Le moteur relève les étapes manquantes, les inversions d'ordre (−10 points chacune) et calcule une note sur 100 (25 points par étape). Il **ne juge pas le fond** (bonne norme, bon diagnostic), et le résultat le dit toujours. Le modèle commente ensuite le contenu.
- **Pas de « solution inventée ».** Normes, valeurs cliniques et données viennent des documents de l'étudiant (`suche_in_unterlagen`) ou de la recherche externe, avec la source.
- **Garde-fous de domaine** (validés par le fondateur) :
  - droit : pas de conseil juridique individuel (RDG) ;
  - médecine : pas de diagnostic pour une personne réelle, renvoi au médecin, 112 en cas d'urgence ;
  - économie et finance : pas de conseil en placement (dans chaque résultat de `wirtschaft_berechnen`) ;
  - psychologie : pas de diagnostic ni de thérapie ; détresse → consultation, 112 ou TelefonSeelsorge (0800 111 0 111) ;
  - histoire, philosophie, psychologie : dates, citations et études jamais inventées.
- **Détection sans faux positifs.** Les mots ambigus comptent peu ou pas : « Zelle » (Excel), « DNS » (réseau), « Verhalten » (régulation), « history » (git), « Übersetzung » (engrenage), « en français » (langue de réponse).
- **Ne jamais mélanger les méthodes.** Pas de Gutachtenstil en maths ; pas de calcul de formule à la place d'une subsomption.

## 3. À valider par le fondateur

1. **Motifs des étapes.** Ils sont à faire relire par une juriste et un médecin. En particulier, « Sachverhalt » compte pour 25 points à la demande du fondateur ; en Allemagne, beaucoup de correcteurs n'exigent pas de le reformuler.
2. **Positionnement.** L'identité du prompt (NIVEAU 1) et le site présentent toujours TRED comme un tuteur d'ingénierie. Le paragraphe ajouté l'ouvre aux autres matières sans réécrire l'identité. La landing page et les textes marketing restent à décider.
3. **Le champ « niveau » (école ou université)** n'existe pas encore dans le profil d'études. Il faut l'ajouter à l'onboarding.

## 4. Solveurs ajoutés (codés, testés)

| Fichier | Outil | Fonctions | Contre-épreuve |
|---|---|---|---|
| `electrical-solver.ts` | `elektro_berechnen` | `solveOhmLaw`, `solveRLC`, `solveRCTransient`, `solveVoltageDivider`, `solveKirchhoff` (mathjs) | U = R·I, X_L(f₀) = X_C(f₀), loi des mailles, résidu A·x − b ; recoupé avec `schaltung_berechnen` |
| `materials-solver.ts` | `werkstoff_berechnen` | `solveHookesLaw`, `solveStress`, `solveThermalExpansion`, `solveBeamBendingStress`, `solvePoissonRatio` | σ = E·ε, M·e/I = M/W, E = 2G(1+ν), −1 < ν ≤ 0,5 |
| `chemistry-solver.ts` | `chemie_berechnen` | `molarMass`, `solveMolarity`, `solveStoichiometry`, `solvePH`/`solvePOH` (+ acides/bases faibles, tampon), `solveIdealGasChem` | équation équilibrée (atomes et charges) ou refus, K_w, K_s = x²/(c − x) |
| `finance-solver.ts` | `wirtschaft_berechnen` | `solveCompoundInterest`, `solveNPV`, `solveIRR`, `solveAnnuity` | K₀·q^n = K_n, VAN(TRI) = 0, reste dû final = 0 |
| `highschool-solver.ts` | `schule_berechnen` | `solveQuadratic` (forme exacte, p-q, sommet), `solvePythagoras` | substitution, Viète |

Tests : `tests/solvers/*-solver.test.ts`, au moins trois valeurs de manuel par fonction (f₀ = 1 591,5 Hz ; 63,2 % à τ ; acier ΔL = 1,2 mm ; pH 2 ; 22,41 L ; annuité 12 950,46 € ; x = 1 ± √2…).
