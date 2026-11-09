import { useEffect } from "react";

/**
 * Titre de l'onglet tant que la page est affichée ; en la quittant, on remet
 * le titre d'avant. Les pages sans titre propre gardent donc celui
 * d'index.html (« TRED — KI-Tutor… »), au lieu d'hériter de celui de la
 * dernière page visitée.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** Espace admin : l'onglet commence toujours par « TRED Admin ». */
export const adminTitle = (section?: string) => (section ? `TRED Admin · ${section}` : "TRED Admin");
