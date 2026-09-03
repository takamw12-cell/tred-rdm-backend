import { Fragment, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LEGAL, LEGAL_TITLE, type LegalDoc } from "@template/web/legal";

import { useColors } from "@/hooks/use-colors";
import { FontSize, Space } from "@/constants/theme";

/**
 * Impressum, Datenschutz, Widerruf, AGB — dans l'application.
 *
 * ── Pourquoi le texte est embarqué et non chargé ──────────────────────────
 *
 * § 5 DDG veut l'Impressum « ständig verfügbar » : disponible en permanence.
 * Un écran qui va chercher la page sur le serveur ne l'est pas — il est vide
 * dans le métro et vide le jour où le serveur tombe, c'est-à-dire précisément
 * le jour où quelqu'un cherche à savoir qui tu es.
 *
 * Le texte vient donc du paquet `@template/web/legal`, la même source que les
 * pages du site. Un seul texte, deux affichages : impossible que le mobile
 * dise autre chose que le web après une correction.
 *
 * ── Pourquoi un rendu maison plutôt qu'une bibliothèque ───────────────────
 *
 * Ces documents n'utilisent que trois formes : des titres `##`, des
 * sous-titres `###` et des paragraphes, plus quatre passages en gras. Une
 * bibliothèque de Markdown pèserait plus que les textes eux-mêmes et
 * ajouterait une dépendance à maintenir pour zéro gain visible.
 *
 * ── Les sauts de ligne à l'intérieur d'un paragraphe ──────────────────────
 *
 * Les sources sont coupées à 80 colonnes pour rester lisibles dans l'éditeur.
 * Un rendu naïf reproduirait ces coupures sur un écran de téléphone et
 * donnerait un texte en escalier. Les lignes d'un même bloc sont donc
 * recollées ; seule la ligne vide sépare deux blocs.
 */

const DOCS: LegalDoc[] = ["impressum", "datenschutz", "widerruf", "agb"];

function isDoc(value: unknown): value is LegalDoc {
  return typeof value === "string" && (DOCS as string[]).includes(value);
}

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const c = useColors();
  const router = useRouter();

  // Une adresse inattendue retombe sur l'Impressum plutôt que sur un écran
  // blanc : c'est le document dont l'absence coûte le plus cher.
  const key: LegalDoc = isDoc(doc) ? doc : "impressum";
  const blocks = useMemo(() => parse(LEGAL[key]), [key]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <View style={[styles.bar, { borderBottomColor: c.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={LEGAL_TITLE[key]}
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={22} color={c.foreground} />
        </Pressable>
        <Text
          numberOfLines={1}
          accessibilityRole="header"
          style={[styles.barTitle, { color: c.foreground }]}
        >
          {LEGAL_TITLE[key]}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {blocks.map((block, i) => (
          <Fragment key={i}>
            {block.kind === "h2" ? (
              <Text style={[styles.h2, { color: c.foreground }]}>{block.text}</Text>
            ) : block.kind === "h3" ? (
              <Text style={[styles.h3, { color: c.foreground }]}>{block.text}</Text>
            ) : (
              <Text style={[styles.p, { color: c.mutedForeground }]}>
                {inline(block.text).map((span, j) =>
                  span.bold ? (
                    <Text key={j} style={{ color: c.foreground, fontWeight: "700" }}>
                      {span.text}
                    </Text>
                  ) : (
                    <Text key={j}>{span.text}</Text>
                  ),
                )}
              </Text>
            )}
          </Fragment>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Le rendu ──────────────────────────────────────────────────────────── */

type Block = { kind: "h2" | "h3" | "p"; text: string };

/** Découpe le Markdown en blocs, en recollant les lignes d'un même paragraphe. */
function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    blocks.push({ kind: "p", text: buffer.join(" ") });
    buffer = [];
  };

  for (const raw of source.split("\n")) {
    const line = raw.trim();

    if (line === "") {
      flush();
    } else if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3) });
    } else {
      buffer.push(line);
    }
  }

  flush();
  return blocks;
}

/** Découpe un paragraphe en segments normaux et gras. */
function inline(text: string): { text: string; bold: boolean }[] {
  const parts = text.split("**");
  // Les segments d'indice impair sont ceux entre deux marqueurs. Un marqueur
  // orphelin laisse donc le dernier segment en normal — dégradation muette,
  // ce qui vaut mieux qu'un document juridique qui ne s'affiche pas.
  return parts
    .filter((part) => part.length > 0)
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }));
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { padding: Space.xs },
  barTitle: { flex: 1, fontSize: FontSize.md, fontWeight: "600" },
  scroll: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.lg,
    paddingBottom: Space.xxl,
  },
  h2: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  h3: {
    fontSize: FontSize.md,
    fontWeight: "600",
    marginTop: Space.lg,
    marginBottom: Space.xs,
  },
  p: { fontSize: FontSize.sm, lineHeight: 21, marginBottom: Space.md },
});
