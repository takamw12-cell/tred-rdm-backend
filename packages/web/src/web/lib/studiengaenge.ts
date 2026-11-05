/**
 * Les filières (Studiengänge) proposées dans les réglages.
 *
 * La VALEUR enregistrée reste le nom allemand officiel (« Maschinenbau ») :
 * c'est lui qui figure sur l'inscription, et c'est lui que lisent le fond
 * (lib/background-sets.ts) et les ressources partenaires. Seul l'AFFICHAGE
 * est traduit dans les 12 langues de l'interface.
 *
 * Module pur, testé dans tests/background-sets.test.ts.
 */

type Locale = "en" | "fr" | "es" | "it" | "pt" | "ru" | "zh" | "ja" | "ar" | "bn" | "hi";

export interface Studiengang {
  /** Nom allemand, enregistré tel quel dans le profil. */
  value: string;
  labels: Record<Locale, string>;
}

const S = (value: string, l: [string, string, string, string, string, string, string, string, string, string, string]): Studiengang => {
  const [en, fr, es, it, pt, ru, zh, ja, ar, bn, hi] = l;
  return { value, labels: { en, fr, es, it, pt, ru, zh, ja, ar, bn, hi } };
};

export const STUDIENGAENGE: Studiengang[] = [
  S("Luft- und Raumfahrttechnik", ["Aerospace Engineering", "Génie aérospatial", "Ingeniería aeroespacial", "Ingegneria aerospaziale", "Engenharia aeroespacial", "Авиационно-космическая техника", "航空航天工程", "航空宇宙工学", "هندسة الطيران والفضاء", "মহাকাশ প্রকৌশল", "एयरोस्पेस इंजीनियरिंग"]),
  S("Maschinenbau", ["Mechanical Engineering", "Génie mécanique", "Ingeniería mecánica", "Ingegneria meccanica", "Engenharia mecânica", "Машиностроение", "机械工程", "機械工学", "الهندسة الميكانيكية", "যন্ত্র প্রকৌশল", "यांत्रिक अभियांत्रिकी"]),
  S("Mechatronik", ["Mechatronics", "Mécatronique", "Mecatrónica", "Meccatronica", "Mecatrônica", "Мехатроника", "机电一体化", "メカトロニクス", "الميكاترونيكس", "মেকাট্রনিক্স", "मेकाट्रॉनिक्स"]),
  S("Robotik / Autonome Systeme", ["Robotics & Autonomous Systems", "Robotique / systèmes autonomes", "Robótica y sistemas autónomos", "Robotica e sistemi autonomi", "Robótica e sistemas autônomos", "Робототехника и автономные системы", "机器人与自主系统", "ロボット工学・自律システム", "الروبوتات والأنظمة الذاتية", "রোবোটিক্স ও স্বয়ংক্রিয় ব্যবস্থা", "रोबोटिक्स एवं स्वायत्त प्रणालियाँ"]),
  S("Elektrotechnik", ["Electrical Engineering", "Génie électrique", "Ingeniería eléctrica", "Ingegneria elettrica", "Engenharia elétrica", "Электротехника", "电气工程", "電気工学", "الهندسة الكهربائية", "তড়িৎ প্রকৌশল", "विद्युत अभियांत्रिकी"]),
  S("Bauingenieurwesen", ["Civil Engineering", "Génie civil", "Ingeniería civil", "Ingegneria civile", "Engenharia civil", "Строительная инженерия", "土木工程", "土木工学", "الهندسة المدنية", "পুরকৌশল", "सिविल इंजीनियरिंग"]),
  S("Architektur", ["Architecture", "Architecture", "Arquitectura", "Architettura", "Arquitetura", "Архитектура", "建筑学", "建築学", "العمارة", "স্থাপত্য", "वास्तुकला"]),
  S("Wirtschaftsingenieurwesen", ["Industrial Engineering & Management", "Génie industriel", "Ingeniería industrial", "Ingegneria gestionale", "Engenharia de produção", "Промышленная инженерия и менеджмент", "工业工程与管理", "経営工学", "الهندسة الصناعية والإدارة", "শিল্প প্রকৌশল ও ব্যবস্থাপনা", "औद्योगिक इंजीनियरिंग एवं प्रबंधन"]),
  S("Chemieingenieurwesen / Verfahrenstechnik", ["Chemical & Process Engineering", "Génie chimique / génie des procédés", "Ingeniería química y de procesos", "Ingegneria chimica e di processo", "Engenharia química e de processos", "Химическая и технологическая инженерия", "化学与过程工程", "化学工学・プロセス工学", "الهندسة الكيميائية وهندسة العمليات", "রাসায়নিক ও প্রক্রিয়া প্রকৌশল", "रासायनिक एवं प्रक्रिया अभियांत्रिकी"]),
  S("Umwelttechnik", ["Environmental Engineering", "Génie de l'environnement", "Ingeniería ambiental", "Ingegneria ambientale", "Engenharia ambiental", "Экологическая инженерия", "环境工程", "環境工学", "الهندسة البيئية", "পরিবেশ প্রকৌশল", "पर्यावरण अभियांत्रिकी"]),
  S("Biomedizinische Technik", ["Biomedical Engineering", "Génie biomédical", "Ingeniería biomédica", "Ingegneria biomedica", "Engenharia biomédica", "Биомедицинская инженерия", "生物医学工程", "生体医工学", "الهندسة الطبية الحيوية", "বায়োমেডিক্যাল প্রকৌশল", "जैव चिकित्सा अभियांत्रिकी"]),
  S("Informatik", ["Computer Science", "Informatique", "Informática", "Informatica", "Ciência da computação", "Информатика", "计算机科学", "情報科学", "علوم الحاسوب", "কম্পিউটার বিজ্ঞান", "कंप्यूटर विज्ञान"]),
  S("Data Science / KI", ["Data Science / AI", "Science des données / IA", "Ciencia de datos / IA", "Data science / IA", "Ciência de dados / IA", "Наука о данных / ИИ", "数据科学 / 人工智能", "データサイエンス / AI", "علم البيانات / الذكاء الاصطناعي", "ডেটা সায়েন্স / কৃত্রিম বুদ্ধিমত্তা", "डेटा साइंस / एआई"]),
  S("Mathematik/Physik", ["Mathematics / Physics", "Mathématiques / Physique", "Matemáticas / Física", "Matematica / Fisica", "Matemática / Física", "Математика / Физика", "数学 / 物理", "数学 / 物理学", "الرياضيات / الفيزياء", "গণিত / পদার্থবিজ্ঞান", "गणित / भौतिकी"]),
  S("Physik", ["Physics", "Physique", "Física", "Fisica", "Física", "Физика", "物理学", "物理学", "الفيزياء", "পদার্থবিজ্ঞান", "भौतिकी"]),
];

/**
 * Libellé affiché : le nom allemand seul en allemand ; ailleurs la
 * traduction, suivie du nom officiel pour qu'il reste reconnaissable.
 */
export function studiengangLabel(s: Studiengang, locale: string): string {
  if (locale === "de") return s.value;
  const tr = s.labels[locale as Locale] ?? s.labels.en;
  return tr === s.value ? tr : `${tr} · ${s.value}`;
}
