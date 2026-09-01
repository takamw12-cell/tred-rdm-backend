// Les douze langues de l'interface.
//
//   node patch-langues-ui.mjs
//
// Deux défauts corrigés, un principe changé.
//
//   1. `es` figurait dans le type `Locale` et avait son fichier, mais AUCUN
//      chargeur. `LOADERS["es"]` valait donc `undefined`, et l'appeler levait
//      une exception pendant le rendu : choisir l'espagnol faisait tomber la
//      page sur l'écran « Etwas ist schiefgelaufen ».
//
//   2. Huit langues du menu n'avaient pas de fichier du tout.
//
// Le principe : un paquet de langue n'a plus besoin d'être COMPLET. Il est
// fusionné par-dessus l'allemand au chargement, donc une clé absente affiche
// l'allemand au lieu de son chemin technique. Ajouter une langue coûte
// désormais ce qu'on veut y mettre — et jamais une compilation cassée.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const I18N = path.join(ROOT, "packages", "web", "src", "web", "i18n");
const MSG = path.join(I18N, "messages");

if (!fs.existsSync(I18N)) {
  console.log(`\n⚠️  Introuvable : ${path.relative(ROOT, I18N)}`);
  console.log("   Tu n'es pas à la racine du projet.\n");
  process.exit(1);
}

/* ══════════════════════════════════════════════════════════════════════════
   Les traductions.

   Portée : ce qu'un étudiant voit dans ses cinq premières minutes — la
   navigation, les mots communs, la connexion, les réglages. Le reste retombe
   sur l'allemand, ce qui est cohérent pour une application de la FH Aachen et
   se complète quand on veut.

   Les termes techniques allemands restent en allemand — « Engineering DNA »,
   « Klausur » — comme partout ailleurs dans le produit.
   ══════════════════════════════════════════════════════════════════════════ */

const T = {
  it: {
    nav: {
      hideMenu: "Comprimi il menu", showMenu: "Mostra il menu", dashboard: "Dashboard",
      chat: "Chat IA", dictionary: "Dizionario", dna: "Engineering DNA",
      exercises: "Esercizi ed esami", formulas: "Formulario", exam: "Modalità esame",
      settings: "Impostazioni", pricing: "Abbonamento", menu: "Menu",
    },
    common: {
      email: "E-mail", password: "Password", firstName: "Nome", lastName: "Cognome",
      university: "Università", degree: "Corso di laurea", semester: "Semestre",
      nativeLanguage: "Lingua madre", germanLevel: "Livello di tedesco",
      save: "Salva", cancel: "Annulla", continue: "Avanti", back: "Indietro",
      search: "Cerca", loading: "Caricamento …", send: "Invia", close: "Chiudi",
      start: "Inizia", activate: "Attiva", submit: "Consegna", page: "Pagina",
      of: "di", all: "Tutti", light: "Chiaro", dark: "Scuro", system: "Sistema",
      theme: "Aspetto",
    },
    auth: {
      forgotPassword: "Password dimenticata?",
      forgotSent: "Se esiste un account con questo indirizzo, l'e-mail è in arrivo.",
      resetTitle: "Imposta una nuova password", newPassword: "Nuova password",
      confirmPassword: "Conferma la password", passwordTooShort: "Almeno 8 caratteri.",
      passwordMismatch: "Le password non coincidono.", setNewPassword: "Salva la password",
      resetDone: "Password modificata. Ti reindirizziamo all'accesso.",
      resetLinkInvalid: "Questo link è scaduto o è già stato usato.",
      backToLogin: "Torna all'accesso", inviteCode: "Codice di invito",
      inviteHint: "Al momento la registrazione richiede un codice di invito.",
      inviteInvalid: "Questo codice non è valido, è scaduto o è già stato usato.",
      accountDisabled: "Il tuo accesso è stato disattivato. Contatta il gestore.",
      signInTitle: "Bentornato", signInSubtitle: "Accedi per studiare con i tuoi corsi.",
      signUpTitle: "Crea un account", signUpSubtitle: "Inizia il tuo studio trilingue.",
      google: "Continua con Google", apple: "Continua con Apple", or: "oppure",
      signInBtn: "Accedi", signUpBtn: "Registrati",
      toSignUp: "Non hai un account? Registrati", toSignIn: "Hai già un account? Accedi",
      signOut: "Esci", name: "Nome",
      errorGeneric: "Accesso non riuscito. Controlla i tuoi dati.",
    },
    settings: {
      title: "Impostazioni", subtitle: "Gestisci preferenze, abbonamento e account.",
      appearanceSection: "Aspetto", themeLabel: "Tema", themeLight: "Chiaro",
      themeDark: "Scuro", themeSystem: "Sistema", fontSizeLabel: "Dimensione del testo",
      languagesSection: "Lingue", interfaceLanguage: "Lingua dell'interfaccia",
      germanLearningMode: "Modalità tedesco tecnico",
      subscriptionSection: "Abbonamento", currentPlan: "Piano attuale",
      managePlan: "Gestisci il piano", dataSection: "Dati",
      exportData: "Esporta i miei dati", privacySection: "Privacy",
      deleteAccount: "Elimina l'account",
    },
  },

  pt: {
    nav: {
      hideMenu: "Recolher o menu", showMenu: "Mostrar o menu", dashboard: "Painel",
      chat: "Chat IA", dictionary: "Dicionário", dna: "Engineering DNA",
      exercises: "Exercícios e exames", formulas: "Formulário", exam: "Modo de exame",
      settings: "Definições", pricing: "Subscrição", menu: "Menu",
    },
    common: {
      email: "E-mail", password: "Palavra-passe", firstName: "Nome", lastName: "Apelido",
      university: "Universidade", degree: "Curso", semester: "Semestre",
      nativeLanguage: "Língua materna", germanLevel: "Nível de alemão",
      save: "Guardar", cancel: "Cancelar", continue: "Continuar", back: "Voltar",
      search: "Pesquisar", loading: "A carregar …", send: "Enviar", close: "Fechar",
      start: "Começar", activate: "Ativar", submit: "Entregar", page: "Página",
      of: "de", all: "Todos", light: "Claro", dark: "Escuro", system: "Sistema",
      theme: "Aparência",
    },
    auth: {
      forgotPassword: "Esqueceste-te da palavra-passe?",
      forgotSent: "Se existir uma conta com este endereço, o e-mail está a caminho.",
      resetTitle: "Definir nova palavra-passe", newPassword: "Nova palavra-passe",
      confirmPassword: "Confirmar a palavra-passe", passwordTooShort: "Pelo menos 8 caracteres.",
      passwordMismatch: "As palavras-passe não coincidem.", setNewPassword: "Guardar",
      resetDone: "Palavra-passe alterada. A redirecionar para o início de sessão.",
      resetLinkInvalid: "Este link expirou ou já foi utilizado.",
      backToLogin: "Voltar ao início de sessão", inviteCode: "Código de convite",
      inviteHint: "De momento o registo exige um código de convite.",
      inviteInvalid: "Este código é inválido, expirou ou já foi usado.",
      accountDisabled: "O teu acesso foi desativado. Contacta o responsável.",
      signInTitle: "Bem-vindo de volta", signInSubtitle: "Inicia sessão para estudar com os teus cursos.",
      signUpTitle: "Criar conta", signUpSubtitle: "Começa o teu curso de engenharia trilingue.",
      google: "Continuar com Google", apple: "Continuar com Apple", or: "ou",
      signInBtn: "Iniciar sessão", signUpBtn: "Registar",
      toSignUp: "Ainda não tens conta? Regista-te", toSignIn: "Já tens conta? Inicia sessão",
      signOut: "Terminar sessão", name: "Nome",
      errorGeneric: "Início de sessão falhou. Verifica os teus dados.",
    },
    settings: {
      title: "Definições", subtitle: "Gere as tuas preferências, a subscrição e a conta.",
      appearanceSection: "Aparência", themeLabel: "Tema", themeLight: "Claro",
      themeDark: "Escuro", themeSystem: "Sistema", fontSizeLabel: "Tamanho do texto",
      languagesSection: "Idiomas", interfaceLanguage: "Idioma da interface",
      germanLearningMode: "Modo alemão técnico",
      subscriptionSection: "Subscrição", currentPlan: "Plano atual",
      managePlan: "Gerir o plano", dataSection: "Dados",
      exportData: "Exportar os meus dados", privacySection: "Privacidade",
      deleteAccount: "Eliminar a conta",
    },
  },

  ru: {
    nav: {
      hideMenu: "Свернуть меню", showMenu: "Показать меню", dashboard: "Панель",
      chat: "ИИ-чат", dictionary: "Словарь", dna: "Engineering DNA",
      exercises: "Задачи и экзамены", formulas: "Сборник формул", exam: "Режим экзамена",
      settings: "Настройки", pricing: "Подписка", menu: "Меню",
    },
    common: {
      email: "Эл. почта", password: "Пароль", firstName: "Имя", lastName: "Фамилия",
      university: "Университет", degree: "Специальность", semester: "Семестр",
      nativeLanguage: "Родной язык", germanLevel: "Уровень немецкого",
      save: "Сохранить", cancel: "Отмена", continue: "Далее", back: "Назад",
      search: "Поиск", loading: "Загрузка …", send: "Отправить", close: "Закрыть",
      start: "Начать", activate: "Активировать", submit: "Сдать", page: "Страница",
      of: "из", all: "Все", light: "Светлая", dark: "Тёмная", system: "Системная",
      theme: "Оформление",
    },
    auth: {
      forgotPassword: "Забыли пароль?",
      forgotSent: "Если аккаунт с таким адресом существует, письмо уже в пути.",
      resetTitle: "Задать новый пароль", newPassword: "Новый пароль",
      confirmPassword: "Подтвердите пароль", passwordTooShort: "Минимум 8 символов.",
      passwordMismatch: "Пароли не совпадают.", setNewPassword: "Сохранить пароль",
      resetDone: "Пароль изменён. Переходим ко входу.",
      resetLinkInvalid: "Ссылка устарела или уже была использована.",
      backToLogin: "Вернуться ко входу", inviteCode: "Код приглашения",
      inviteHint: "Сейчас регистрация возможна только по коду приглашения.",
      inviteInvalid: "Код недействителен, истёк или уже использован.",
      accountDisabled: "Ваш доступ отключён. Свяжитесь с администратором.",
      signInTitle: "С возвращением", signInSubtitle: "Войдите, чтобы заниматься по своим курсам.",
      signUpTitle: "Создать аккаунт", signUpSubtitle: "Начните учёбу на трёх языках.",
      google: "Продолжить с Google", apple: "Продолжить с Apple", or: "или",
      signInBtn: "Войти", signUpBtn: "Зарегистрироваться",
      toSignUp: "Нет аккаунта? Зарегистрируйтесь", toSignIn: "Уже есть аккаунт? Войдите",
      signOut: "Выйти", name: "Имя",
      errorGeneric: "Не удалось войти. Проверьте введённые данные.",
    },
    settings: {
      title: "Настройки", subtitle: "Управляйте настройками, подпиской и аккаунтом.",
      appearanceSection: "Оформление", themeLabel: "Тема", themeLight: "Светлая",
      themeDark: "Тёмная", themeSystem: "Системная", fontSizeLabel: "Размер текста",
      languagesSection: "Языки", interfaceLanguage: "Язык интерфейса",
      germanLearningMode: "Режим технического немецкого",
      subscriptionSection: "Подписка", currentPlan: "Текущий тариф",
      managePlan: "Управлять тарифом", dataSection: "Данные",
      exportData: "Экспортировать мои данные", privacySection: "Конфиденциальность",
      deleteAccount: "Удалить аккаунт",
    },
  },

  ar: {
    nav: {
      hideMenu: "طيّ القائمة", showMenu: "إظهار القائمة", dashboard: "لوحة التحكم",
      chat: "محادثة الذكاء الاصطناعي", dictionary: "القاموس", dna: "Engineering DNA",
      exercises: "التمارين والاختبارات", formulas: "مجموعة الصيغ", exam: "وضع الاختبار",
      settings: "الإعدادات", pricing: "الاشتراك", menu: "القائمة",
    },
    common: {
      email: "البريد الإلكتروني", password: "كلمة المرور", firstName: "الاسم الأول",
      lastName: "اسم العائلة", university: "الجامعة", degree: "التخصص",
      semester: "الفصل الدراسي", nativeLanguage: "اللغة الأم", germanLevel: "مستوى الألمانية",
      save: "حفظ", cancel: "إلغاء", continue: "متابعة", back: "رجوع",
      search: "بحث", loading: "جارٍ التحميل …", send: "إرسال", close: "إغلاق",
      start: "ابدأ", activate: "تفعيل", submit: "تسليم", page: "صفحة",
      of: "من", all: "الكل", light: "فاتح", dark: "داكن", system: "النظام",
      theme: "المظهر",
    },
    auth: {
      forgotPassword: "هل نسيت كلمة المرور؟",
      forgotSent: "إذا كان هناك حساب بهذا العنوان، فالرسالة في طريقها إليك.",
      resetTitle: "تعيين كلمة مرور جديدة", newPassword: "كلمة مرور جديدة",
      confirmPassword: "تأكيد كلمة المرور", passwordTooShort: "٨ أحرف على الأقل.",
      passwordMismatch: "كلمتا المرور غير متطابقتين.", setNewPassword: "حفظ كلمة المرور",
      resetDone: "تم تغيير كلمة المرور. سيتم تحويلك إلى تسجيل الدخول.",
      resetLinkInvalid: "انتهت صلاحية هذا الرابط أو تم استخدامه من قبل.",
      backToLogin: "العودة إلى تسجيل الدخول", inviteCode: "رمز الدعوة",
      inviteHint: "التسجيل متاح حاليًا برمز دعوة فقط.",
      inviteInvalid: "هذا الرمز غير صالح أو منتهٍ أو مستخدَم بالفعل.",
      accountDisabled: "تم تعطيل حسابك. يرجى التواصل مع المشغّل.",
      signInTitle: "أهلًا بعودتك", signInSubtitle: "سجّل الدخول للدراسة من موادك.",
      signUpTitle: "إنشاء حساب", signUpSubtitle: "ابدأ دراستك الهندسية بثلاث لغات.",
      google: "المتابعة عبر Google", apple: "المتابعة عبر Apple", or: "أو",
      signInBtn: "تسجيل الدخول", signUpBtn: "إنشاء حساب",
      toSignUp: "ليس لديك حساب؟ أنشئ واحدًا", toSignIn: "لديك حساب؟ سجّل الدخول",
      signOut: "تسجيل الخروج", name: "الاسم",
      errorGeneric: "فشل تسجيل الدخول. تحقّق من بياناتك.",
    },
    settings: {
      title: "الإعدادات", subtitle: "أدِر تفضيلاتك واشتراكك وحسابك.",
      appearanceSection: "المظهر", themeLabel: "السمة", themeLight: "فاتح",
      themeDark: "داكن", themeSystem: "النظام", fontSizeLabel: "حجم النص",
      languagesSection: "اللغات", interfaceLanguage: "لغة الواجهة",
      germanLearningMode: "وضع الألمانية التقنية",
      subscriptionSection: "الاشتراك", currentPlan: "الخطة الحالية",
      managePlan: "إدارة الخطة", dataSection: "البيانات",
      exportData: "تصدير بياناتي", privacySection: "الخصوصية",
      deleteAccount: "حذف الحساب",
    },
  },

  zh: {
    nav: {
      hideMenu: "收起菜单", showMenu: "展开菜单", dashboard: "仪表板",
      chat: "AI 对话", dictionary: "词典", dna: "Engineering DNA",
      exercises: "习题与考试", formulas: "公式集", exam: "考试模式",
      settings: "设置", pricing: "订阅", menu: "菜单",
    },
    common: {
      email: "电子邮箱", password: "密码", firstName: "名", lastName: "姓",
      university: "大学", degree: "专业", semester: "学期",
      nativeLanguage: "母语", germanLevel: "德语水平",
      save: "保存", cancel: "取消", continue: "继续", back: "返回",
      search: "搜索", loading: "加载中 …", send: "发送", close: "关闭",
      start: "开始", activate: "激活", submit: "提交", page: "第",
      of: "页，共", all: "全部", light: "浅色", dark: "深色", system: "跟随系统",
      theme: "外观",
    },
    auth: {
      forgotPassword: "忘记密码？",
      forgotSent: "如果该邮箱已注册，邮件正在发送中。",
      resetTitle: "设置新密码", newPassword: "新密码",
      confirmPassword: "确认密码", passwordTooShort: "至少 8 个字符。",
      passwordMismatch: "两次输入的密码不一致。", setNewPassword: "保存密码",
      resetDone: "密码已修改，正在跳转到登录页面。",
      resetLinkInvalid: "此链接已过期或已被使用。",
      backToLogin: "返回登录", inviteCode: "邀请码",
      inviteHint: "目前仅能通过邀请码注册。",
      inviteInvalid: "邀请码无效、已过期或已被使用。",
      accountDisabled: "你的账号已被停用，请联系运营者。",
      signInTitle: "欢迎回来", signInSubtitle: "登录后即可使用你的课程资料学习。",
      signUpTitle: "创建账号", signUpSubtitle: "开启你的三语工程学习。",
      google: "使用 Google 继续", apple: "使用 Apple 继续", or: "或",
      signInBtn: "登录", signUpBtn: "注册",
      toSignUp: "还没有账号？注册", toSignIn: "已有账号？登录",
      signOut: "退出登录", name: "姓名",
      errorGeneric: "登录失败，请检查你的信息。",
    },
    settings: {
      title: "设置", subtitle: "管理你的偏好、订阅和账号。",
      appearanceSection: "外观", themeLabel: "主题", themeLight: "浅色",
      themeDark: "深色", themeSystem: "跟随系统", fontSizeLabel: "文字大小",
      languagesSection: "语言", interfaceLanguage: "界面语言",
      germanLearningMode: "德语术语模式",
      subscriptionSection: "订阅", currentPlan: "当前方案",
      managePlan: "管理方案", dataSection: "数据",
      exportData: "导出我的数据", privacySection: "隐私",
      deleteAccount: "删除账号",
    },
  },

  hi: {
    nav: {
      hideMenu: "मेन्यू छिपाएँ", showMenu: "मेन्यू दिखाएँ", dashboard: "डैशबोर्ड",
      chat: "एआई चैट", dictionary: "शब्दकोश", dna: "Engineering DNA",
      exercises: "अभ्यास और परीक्षाएँ", formulas: "सूत्र संग्रह", exam: "परीक्षा मोड",
      settings: "सेटिंग्स", pricing: "सदस्यता", menu: "मेन्यू",
    },
    common: {
      email: "ईमेल", password: "पासवर्ड", firstName: "पहला नाम", lastName: "उपनाम",
      university: "विश्वविद्यालय", degree: "पाठ्यक्रम", semester: "सेमेस्टर",
      nativeLanguage: "मातृभाषा", germanLevel: "जर्मन स्तर",
      save: "सहेजें", cancel: "रद्द करें", continue: "आगे", back: "पीछे",
      search: "खोजें", loading: "लोड हो रहा है …", send: "भेजें", close: "बंद करें",
      start: "शुरू करें", activate: "सक्रिय करें", submit: "जमा करें", page: "पृष्ठ",
      of: "में से", all: "सभी", light: "हल्का", dark: "गहरा", system: "सिस्टम",
      theme: "रूप",
    },
    auth: {
      forgotPassword: "पासवर्ड भूल गए?",
      forgotSent: "यदि इस पते से कोई खाता जुड़ा है, तो ईमेल भेजा जा चुका है।",
      resetTitle: "नया पासवर्ड सेट करें", newPassword: "नया पासवर्ड",
      confirmPassword: "पासवर्ड की पुष्टि करें", passwordTooShort: "कम से कम 8 अक्षर।",
      passwordMismatch: "दोनों पासवर्ड मेल नहीं खाते।", setNewPassword: "पासवर्ड सहेजें",
      resetDone: "पासवर्ड बदल गया। आपको साइन-इन पर भेजा जा रहा है।",
      resetLinkInvalid: "यह लिंक समाप्त हो चुका है या पहले ही उपयोग हो चुका है।",
      backToLogin: "साइन-इन पर लौटें", inviteCode: "आमंत्रण कोड",
      inviteHint: "फ़िलहाल पंजीकरण केवल आमंत्रण कोड से संभव है।",
      inviteInvalid: "यह कोड अमान्य है, समाप्त हो चुका है या पहले ही उपयोग हो चुका है।",
      accountDisabled: "आपकी पहुँच बंद कर दी गई है। कृपया संचालक से संपर्क करें।",
      signInTitle: "वापसी पर स्वागत है", signInSubtitle: "अपने पाठ्यक्रमों से पढ़ने के लिए साइन इन करें।",
      signUpTitle: "खाता बनाएँ", signUpSubtitle: "अपनी त्रिभाषी इंजीनियरिंग पढ़ाई शुरू करें।",
      google: "Google से जारी रखें", apple: "Apple से जारी रखें", or: "या",
      signInBtn: "साइन इन", signUpBtn: "पंजीकरण करें",
      toSignUp: "खाता नहीं है? पंजीकरण करें", toSignIn: "पहले से खाता है? साइन इन करें",
      signOut: "साइन आउट", name: "नाम",
      errorGeneric: "साइन-इन विफल रहा। कृपया अपनी जानकारी जाँचें।",
    },
    settings: {
      title: "सेटिंग्स", subtitle: "अपनी पसंद, सदस्यता और खाता प्रबंधित करें।",
      appearanceSection: "रूप", themeLabel: "थीम", themeLight: "हल्का",
      themeDark: "गहरा", themeSystem: "सिस्टम", fontSizeLabel: "अक्षरों का आकार",
      languagesSection: "भाषाएँ", interfaceLanguage: "इंटरफ़ेस की भाषा",
      germanLearningMode: "तकनीकी जर्मन मोड",
      subscriptionSection: "सदस्यता", currentPlan: "मौजूदा योजना",
      managePlan: "योजना प्रबंधित करें", dataSection: "डेटा",
      exportData: "मेरा डेटा निर्यात करें", privacySection: "गोपनीयता",
      deleteAccount: "खाता हटाएँ",
    },
  },

  bn: {
    nav: {
      hideMenu: "মেনু লুকান", showMenu: "মেনু দেখান", dashboard: "ড্যাশবোর্ড",
      chat: "এআই চ্যাট", dictionary: "অভিধান", dna: "Engineering DNA",
      exercises: "অনুশীলন ও পরীক্ষা", formulas: "সূত্রসংগ্রহ", exam: "পরীক্ষা মোড",
      settings: "সেটিংস", pricing: "সাবস্ক্রিপশন", menu: "মেনু",
    },
    common: {
      email: "ইমেল", password: "পাসওয়ার্ড", firstName: "নাম", lastName: "পদবি",
      university: "বিশ্ববিদ্যালয়", degree: "বিষয়", semester: "সেমিস্টার",
      nativeLanguage: "মাতৃভাষা", germanLevel: "জার্মান দক্ষতা",
      save: "সংরক্ষণ", cancel: "বাতিল", continue: "এগিয়ে যান", back: "পেছনে",
      search: "অনুসন্ধান", loading: "লোড হচ্ছে …", send: "পাঠান", close: "বন্ধ",
      start: "শুরু করুন", activate: "সক্রিয় করুন", submit: "জমা দিন", page: "পৃষ্ঠা",
      of: "এর", all: "সব", light: "উজ্জ্বল", dark: "গাঢ়", system: "সিস্টেম",
      theme: "চেহারা",
    },
    auth: {
      forgotPassword: "পাসওয়ার্ড ভুলে গেছেন?",
      forgotSent: "এই ঠিকানায় অ্যাকাউন্ট থাকলে ইমেলটি পাঠানো হয়েছে।",
      resetTitle: "নতুন পাসওয়ার্ড দিন", newPassword: "নতুন পাসওয়ার্ড",
      confirmPassword: "পাসওয়ার্ড নিশ্চিত করুন", passwordTooShort: "অন্তত ৮টি অক্ষর।",
      passwordMismatch: "পাসওয়ার্ড দুটি মিলছে না।", setNewPassword: "পাসওয়ার্ড সংরক্ষণ",
      resetDone: "পাসওয়ার্ড বদলে গেছে। সাইন-ইনে নিয়ে যাওয়া হচ্ছে।",
      resetLinkInvalid: "এই লিংকের মেয়াদ শেষ বা এটি ব্যবহার হয়ে গেছে।",
      backToLogin: "সাইন-ইনে ফিরুন", inviteCode: "আমন্ত্রণ কোড",
      inviteHint: "এখন কেবল আমন্ত্রণ কোড দিয়ে নিবন্ধন করা যায়।",
      inviteInvalid: "কোডটি অবৈধ, মেয়াদোত্তীর্ণ বা ব্যবহৃত।",
      accountDisabled: "আপনার প্রবেশাধিকার বন্ধ করা হয়েছে। পরিচালকের সঙ্গে যোগাযোগ করুন।",
      signInTitle: "আবার স্বাগতম", signInSubtitle: "নিজের কোর্স দিয়ে পড়তে সাইন ইন করুন।",
      signUpTitle: "অ্যাকাউন্ট তৈরি করুন", signUpSubtitle: "ত্রিভাষিক প্রকৌশল পড়া শুরু করুন।",
      google: "Google দিয়ে চালিয়ে যান", apple: "Apple দিয়ে চালিয়ে যান", or: "অথবা",
      signInBtn: "সাইন ইন", signUpBtn: "নিবন্ধন",
      toSignUp: "অ্যাকাউন্ট নেই? নিবন্ধন করুন", toSignIn: "অ্যাকাউন্ট আছে? সাইন ইন করুন",
      signOut: "সাইন আউট", name: "নাম",
      errorGeneric: "সাইন-ইন ব্যর্থ। তথ্য যাচাই করুন।",
    },
    settings: {
      title: "সেটিংস", subtitle: "পছন্দ, সাবস্ক্রিপশন ও অ্যাকাউন্ট পরিচালনা করুন।",
      appearanceSection: "চেহারা", themeLabel: "থিম", themeLight: "উজ্জ্বল",
      themeDark: "গাঢ়", themeSystem: "সিস্টেম", fontSizeLabel: "লেখার আকার",
      languagesSection: "ভাষা", interfaceLanguage: "ইন্টারফেসের ভাষা",
      germanLearningMode: "কারিগরি জার্মান মোড",
      subscriptionSection: "সাবস্ক্রিপশন", currentPlan: "বর্তমান প্ল্যান",
      managePlan: "প্ল্যান পরিচালনা", dataSection: "ডেটা",
      exportData: "আমার ডেটা রপ্তানি", privacySection: "গোপনীয়তা",
      deleteAccount: "অ্যাকাউন্ট মুছুন",
    },
  },

  ja: {
    nav: {
      hideMenu: "メニューを閉じる", showMenu: "メニューを表示", dashboard: "ダッシュボード",
      chat: "AI チャット", dictionary: "辞書", dna: "Engineering DNA",
      exercises: "演習と試験", formulas: "公式集", exam: "試験モード",
      settings: "設定", pricing: "サブスクリプション", menu: "メニュー",
    },
    common: {
      email: "メールアドレス", password: "パスワード", firstName: "名", lastName: "姓",
      university: "大学", degree: "専攻", semester: "学期",
      nativeLanguage: "母語", germanLevel: "ドイツ語レベル",
      save: "保存", cancel: "キャンセル", continue: "次へ", back: "戻る",
      search: "検索", loading: "読み込み中 …", send: "送信", close: "閉じる",
      start: "開始", activate: "有効にする", submit: "提出", page: "ページ",
      of: "／", all: "すべて", light: "ライト", dark: "ダーク", system: "システム",
      theme: "外観",
    },
    auth: {
      forgotPassword: "パスワードをお忘れですか？",
      forgotSent: "このアドレスの登録があれば、メールを送信しました。",
      resetTitle: "新しいパスワードを設定", newPassword: "新しいパスワード",
      confirmPassword: "パスワードの確認", passwordTooShort: "8 文字以上にしてください。",
      passwordMismatch: "パスワードが一致しません。", setNewPassword: "パスワードを保存",
      resetDone: "パスワードを変更しました。ログイン画面へ移動します。",
      resetLinkInvalid: "このリンクは期限切れか、すでに使用されています。",
      backToLogin: "ログインに戻る", inviteCode: "招待コード",
      inviteHint: "現在、登録には招待コードが必要です。",
      inviteInvalid: "このコードは無効、期限切れ、または使用済みです。",
      accountDisabled: "アカウントが無効化されています。運営者にご連絡ください。",
      signInTitle: "おかえりなさい", signInSubtitle: "ログインして自分の講義資料で学びましょう。",
      signUpTitle: "アカウントを作成", signUpSubtitle: "三言語での工学の学びを始めましょう。",
      google: "Google で続行", apple: "Apple で続行", or: "または",
      signInBtn: "ログイン", signUpBtn: "登録",
      toSignUp: "アカウントがありませんか？登録", toSignIn: "アカウントをお持ちですか？ログイン",
      signOut: "ログアウト", name: "名前",
      errorGeneric: "ログインに失敗しました。入力内容をご確認ください。",
    },
    settings: {
      title: "設定", subtitle: "設定、サブスクリプション、アカウントを管理します。",
      appearanceSection: "外観", themeLabel: "テーマ", themeLight: "ライト",
      themeDark: "ダーク", themeSystem: "システム", fontSizeLabel: "文字サイズ",
      languagesSection: "言語", interfaceLanguage: "表示言語",
      germanLearningMode: "技術ドイツ語モード",
      subscriptionSection: "サブスクリプション", currentPlan: "現在のプラン",
      managePlan: "プランを管理", dataSection: "データ",
      exportData: "データをエクスポート", privacySection: "プライバシー",
      deleteAccount: "アカウントを削除",
    },
  },
};

/* ══ Écriture des fichiers ═════════════════════════════════════════════ */

function render(locale, tree) {
  const body = Object.entries(tree)
    .map(([block, keys]) => {
      const lines = Object.entries(keys)
        .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
        .join("\n");
      return `  ${block}: {\n${lines}\n  },`;
    })
    .join("\n");

  return `import type { PartialMessages } from "../types";

/**
 * Paquet PARTIEL.
 *
 * Seuls les textes qu'un étudiant voit dans ses premières minutes sont
 * traduits ici : navigation, mots communs, connexion, réglages. Tout le reste
 * retombe sur l'allemand — la fusion est faite au chargement, dans i18n/index.
 *
 * Compléter ce fichier ne demande aucune précaution : ajoute les clés que tu
 * veux, quand tu veux. Une clé absente n'a jamais cassé la compilation.
 */
export const ${locale}: PartialMessages = {
${body}
};
`;
}

let written = 0;
for (const [locale, tree] of Object.entries(T)) {
  const file = path.join(MSG, `${locale}.ts`);
  if (fs.existsSync(file)) {
    console.log(`⏭️  ${locale}.ts — existe déjà, laissé tel quel`);
    continue;
  }
  fs.writeFileSync(file, render(locale, tree), "utf8");
  console.log(`✅ ${locale}.ts`);
  written++;
}

/* ══ Le type ═══════════════════════════════════════════════════════════ */

const typesFile = path.join(I18N, "types.ts");
const typesBefore = fs.readFileSync(typesFile, "utf8");

if (!typesBefore.includes("PartialMessages")) {
  const next = typesBefore
    .replace(
      /^export type Locale = .*$/m,
      `export type Locale =
  | "de" | "en" | "fr" | "es"
  | "it" | "pt" | "ru" | "ar"
  | "zh" | "hi" | "bn" | "ja";`,
    )
    .replace(/\s*$/, "\n") +
    `
/**
 * Un paquet de langue n'a pas besoin d'être complet.
 *
 * Il est fusionné par-dessus l'allemand au chargement : une clé absente
 * affiche donc l'allemand, jamais son chemin technique. C'est ce qui rend
 * l'ajout d'une langue possible en une heure au lieu d'une journée — et
 * impossible à casser.
 */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]>;
};

export type PartialMessages = DeepPartial<Messages>;
`;
  fs.writeFileSync(typesFile + ".bak", typesBefore, "utf8");
  fs.writeFileSync(typesFile, next, "utf8");
  console.log("✅ types.ts — Locale élargi, PartialMessages ajouté");
  written++;
} else {
  console.log("⏭️  types.ts — déjà fait");
}

/* ══ Le chargeur ═══════════════════════════════════════════════════════ */

const indexFile = path.join(I18N, "index.ts");
const indexBefore = fs.readFileSync(indexFile, "utf8");

if (indexBefore.includes("mergeOverDe")) {
  console.log("⏭️  index.ts — déjà fait");
} else {
  const start = indexBefore.indexOf("const LOADERS");
  const end = indexBefore.indexOf("\n};\n", start);
  if (start === -1 || end === -1) {
    console.log("\n❌ LOADERS introuvable dans i18n/index.ts — envoie-moi le fichier.\n");
    process.exit(1);
  }

  const codes = ["fr", "en", "es", ...Object.keys(T)];
  const loaders = codes
    .map((c) => `  ${c}: () => import("./messages/${c}").then((m) => m.${c}),`)
    .join("\n");

  const block = `/**
 * Fusion profonde d'un paquet partiel par-dessus l'allemand.
 *
 * Sans elle, une clé absente d'une traduction afficherait son chemin technique
 * — « settings.themeLabel » en plein milieu de l'écran. Avec elle, elle
 * affiche l'allemand, et une langue peut être livrée à moitié traduite sans
 * que personne ne le voie comme un défaut.
 */
function mergeOverDe(base: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object") return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? mergeOverDe(out[key], value)
        : value;
  }
  return out;
}

const LOADERS: Partial<Record<Locale, () => Promise<unknown>>> = {
${loaders}
};`;

  // `end` pointe sur le "\n};\n" qui fermait l'ancienne table ; on saute ces
  // quatre caractères, sinon l'accolade se retrouve en double et le fichier ne
  // compile plus.
  let next = indexBefore.slice(0, start) + block + indexBefore.slice(end + 4);

  // Le chargement applique la fusion, et une langue sans chargeur ne lève plus
  // d'exception : c'est ce qui faisait planter la page en espagnol.
  next = next.replace(
    /  LOADERS\[locale\]\(\)\n    \.then\(\(pack\) => \{\n      loaded\[locale\] = pack;/,
    `  const load = LOADERS[locale];
  if (!load) {
    // Aucune traduction pour cette langue : l'allemand reste affiché, et le
    // tuteur répond quand même dans la langue choisie. Ne JAMAIS lever ici —
    // \`preloadLocale\` est appelé pendant le rendu.
    pending.delete(locale);
    return;
  }

  load()
    .then((pack) => {
      loaded[locale] = mergeOverDe(de, pack) as Messages;`,
  );

  fs.writeFileSync(indexFile + ".bak", indexBefore, "utf8");
  fs.writeFileSync(indexFile, next, "utf8");
  console.log("✅ index.ts — chargeurs pour les douze langues + fusion");
  written++;
}

console.log(`\n${written} fichier(s) écrit(s)`);
console.log("\n👉 Ensuite :  bun run verify");
