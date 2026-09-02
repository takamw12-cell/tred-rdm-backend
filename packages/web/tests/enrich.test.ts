import { describe, expect, test } from "bun:test";
import { rehypeEnrich } from "../src/web/components/enrich";

/* Un arbre hast minimal, construit à la main : les tests ne doivent pas
   dépendre de la chaîne markdown complète pour valider une transformation. */
type N = Record<string, unknown>;
const text = (value: string): N => ({ type: "text", value });
const el = (tagName: string, children: N[], properties: N = {}): N => ({
  type: "element", tagName, properties, children,
});
const root = (children: N[]): N => ({ type: "root", children });

function run(tree: N): N {
  rehypeEnrich()(tree as never);
  return tree;
}

/** Tous les nœuds de l'arbre, à plat. */
function flat(node: N): N[] {
  const kids = (node.children as N[] | undefined) ?? [];
  return [node, ...kids.flatMap(flat)];
}
function spans(tree: N, attr: string): N[] {
  return flat(tree).filter(
    (n) => n.type === "element" && (n.properties as N | undefined)?.[attr] !== undefined,
  );
}
function plainText(node: N): string {
  if (node.type === "text") return String(node.value);
  return (((node.children as N[] | undefined) ?? []).map(plainText)).join("");
}

describe("termes techniques", () => {
  test("souligne un terme du dictionnaire", () => {
    const tree = run(root([el("p", [text("Die Querkraft ist maximal.")])]));
    const marked = spans(tree, "dataTredTerm");
    expect(marked).toHaveLength(1);
    expect(plainText(marked[0]!)).toBe("Querkraft");
  });

  test("le texte reste intact une fois recomposé", () => {
    const source = "Die Querkraft folgt aus dem Biegemoment.";
    const tree = run(root([el("p", [text(source)])]));
    expect(plainText(tree)).toBe(source);
  });

  test("le mot le plus long gagne : Biegemoment, pas Moment", () => {
    const tree = run(root([el("p", [text("Das Biegemoment wächst.")])]));
    const marked = spans(tree, "dataTredTerm");
    expect(marked).toHaveLength(1);
    expect((marked[0]!.properties as N)["dataTredTerm"]).toBe("biegemoment");
  });

  test("une seule fois par réponse, même répété onze fois", () => {
    const line = "Querkraft ".repeat(11);
    const tree = run(root([el("p", [text(line)])]));
    expect(spans(tree, "dataTredTerm")).toHaveLength(1);
  });

  test("ne coupe pas un mot plus long qui le contient", () => {
    // « Spannungszustand » n'est pas « Spannung » : souligner la moitié d'un
    // mot composé allemand donne une définition fausse.
    const tree = run(root([el("p", [text("Der Spannungszustand ist eben.")])]));
    expect(spans(tree, "dataTredTerm")).toHaveLength(0);
  });
});

describe("ce à quoi on ne touche pas", () => {
  test("le code", () => {
    const tree = run(root([el("code", [text("const Querkraft = 12;")])]));
    expect(spans(tree, "dataTredTerm")).toHaveLength(0);
  });

  test("les formules KaTeX", () => {
    const tree = run(
      root([el("span", [text("Querkraft")], { className: ["katex"] })]),
    );
    expect(spans(tree, "dataTredTerm")).toHaveLength(0);
  });

  test("les liens", () => {
    const tree = run(root([el("a", [text("Querkraft")])]));
    expect(spans(tree, "dataTredTerm")).toHaveLength(0);
  });
});

describe("citation de source", () => {
  test("reconnaît « → Skript TM2, Seite 12 »", () => {
    const tree = run(root([el("p", [text("Voilà. → Skript TM2, Seite 12")])]));
    const cites = spans(tree, "dataTredCite");
    expect(cites).toHaveLength(1);
    const p = cites[0]!.properties as N;
    expect(p["dataTredDoc"]).toBe("Skript TM2");
    expect(p["dataTredPage"]).toBe("12");
  });

  test("accepte la forme française", () => {
    const tree = run(root([el("p", [text("→ Cours de méca, page 7")])]));
    const p = spans(tree, "dataTredCite")[0]!.properties as N;
    expect(p["dataTredPage"]).toBe("7");
  });

  test("une flèche sans page ne déclenche rien", () => {
    // Le tuteur emploie « → » comme signe de conséquence. Le confondre avec
    // une citation ferait disparaître un morceau de phrase.
    const tree = run(root([el("p", [text("Q(x) → 0 quand x grandit.")])]));
    expect(spans(tree, "dataTredCite")).toHaveLength(0);
    expect(plainText(tree)).toBe("Q(x) → 0 quand x grandit.");
  });

  test("le titre ne dévore pas la phrase", () => {
    const long = "→ " + "a".repeat(200) + ", Seite 3";
    const tree = run(root([el("p", [text(long)])]));
    expect(spans(tree, "dataTredCite")).toHaveLength(0);
  });
});

describe("entre deux réponses", () => {
  test("le compteur de termes repart de zéro", () => {
    const a = run(root([el("p", [text("Die Querkraft.")])]));
    const b = run(root([el("p", [text("Die Querkraft.")])]));
    expect(spans(a, "dataTredTerm")).toHaveLength(1);
    expect(spans(b, "dataTredTerm")).toHaveLength(1);
  });
});
