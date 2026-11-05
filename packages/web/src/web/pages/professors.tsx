import { ProfessorPicker } from "@/components/professor-picker";
import { professorUi } from "@/lib/professors";
import { useT } from "@/i18n";

/** Le vestiaire des professeurs — aussi présent dans les réglages. */
export default function ProfessorsPage() {
  const { locale } = useT();
  const ui = professorUi(locale);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-semibold">{ui.section}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{ui.sectionDesc}</p>
      <ProfessorPicker />
    </div>
  );
}
