import { useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { motion } from "framer-motion";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n";
import { useUserStore, type Profile } from "@/stores/user";

interface FormValues extends Profile {
  password: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

const germanLevels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const semesters = Array.from({ length: 10 }, (_, i) => String(i + 1));
const languageKeys = ["de", "fr", "en", "other"];

export default function OnboardingPage() {
  const { t } = useT();
  const [, navigate] = useLocation();
  const setProfile = useUserStore((s) => s.setProfile);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      university: "",
      degree: "",
      semester: "",
      nativeLanguage: "",
      germanLevel: "",
      acceptTerms: false,
      acceptPrivacy: false,
    },
  });

  const onSubmit = (v: FormValues) => {
    setProfile({
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      university: v.university,
      degree: v.degree,
      semester: v.semester,
      nativeLanguage: v.nativeLanguage,
      germanLevel: v.germanLevel,
    });
    navigate("/dashboard");
  };

  const err = (m?: string) =>
    m ? <p className="text-destructive mt-1 text-xs">{m}</p> : null;

  return (
    <div className="bg-background relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-[0.12]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, oklch(0.55 0.18 255) 0%, transparent 70%)",
        }}
      />
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 sm:top-6 sm:right-6">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo variant="stacked" tagline={t("brand.claim")} className="mb-5" />
            <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              {t("onboarding.title")}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">{t("onboarding.subtitle")}</p>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="bg-card border-border space-y-5 rounded-2xl border p-6 shadow-sm sm:p-8"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName" className="mb-1.5">
                  {t("common.firstName")}
                </Label>
                <Input
                  id="firstName"
                  {...register("firstName", { required: t("onboarding.errorRequired") })}
                />
                {err(errors.firstName?.message)}
              </div>
              <div>
                <Label htmlFor="lastName" className="mb-1.5">
                  {t("common.lastName")}
                </Label>
                <Input
                  id="lastName"
                  {...register("lastName", { required: t("onboarding.errorRequired") })}
                />
                {err(errors.lastName?.message)}
              </div>
            </div>

            <div>
              <Label htmlFor="email" className="mb-1.5">
                {t("common.email")}
              </Label>
              <Input
                id="email"
                type="email"
                {...register("email", {
                  required: t("onboarding.errorRequired"),
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t("onboarding.errorEmail") },
                })}
              />
              {err(errors.email?.message)}
            </div>

            <div>
              <Label htmlFor="password" className="mb-1.5">
                {t("common.password")}
              </Label>
              <Input
                id="password"
                type="password"
                {...register("password", {
                  required: t("onboarding.errorRequired"),
                  minLength: { value: 8, message: t("onboarding.errorPassword") },
                })}
              />
              {err(errors.password?.message)}
            </div>

            <div>
              <Label className="mb-1.5">{t("common.university")}</Label>
              {/* Freies Textfeld statt fester Liste: TRED soll für jede
                  Hochschule funktionieren, nicht nur für eine Handvoll. */}
              <Input
                list="university-suggestions"
                placeholder={t("onboarding.universityPlaceholder")}
                {...register("university", {
                  required: t("onboarding.errorRequired"),
                  setValueAs: (v: string) => (v ?? "").trim(),
                })}
              />
              <datalist id="university-suggestions">
                <option value="FH Aachen" />
                <option value="RWTH Aachen" />
                <option value="TU München" />
                <option value="TU Darmstadt" />
                <option value="KIT Karlsruhe" />
                <option value="TU Berlin" />
              </datalist>
              {err(errors.university?.message)}
            </div>

            <div>
              <Label htmlFor="degree" className="mb-1.5">
                {t("common.degree")}
              </Label>
              <Input
                id="degree"
                placeholder={t("onboarding.degreePlaceholder")}
                {...register("degree", { required: t("onboarding.errorRequired") })}
              />
              {err(errors.degree?.message)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5">{t("common.semester")}</Label>
                <Controller
                  control={control}
                  name="semester"
                  rules={{ required: t("onboarding.errorRequired") }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("onboarding.selectSemester")} />
                      </SelectTrigger>
                      <SelectContent>
                        {semesters.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {err(errors.semester?.message)}
              </div>
              <div>
                <Label className="mb-1.5">{t("common.germanLevel")}</Label>
                <Controller
                  control={control}
                  name="germanLevel"
                  rules={{ required: t("onboarding.errorRequired") }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("onboarding.selectLevel")} />
                      </SelectTrigger>
                      <SelectContent>
                        {germanLevels.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {err(errors.germanLevel?.message)}
              </div>
            </div>

            <div>
              <Label className="mb-1.5">{t("common.nativeLanguage")}</Label>
              <Controller
                control={control}
                name="nativeLanguage"
                rules={{ required: t("onboarding.errorRequired") }}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("onboarding.selectLanguage")} />
                    </SelectTrigger>
                    <SelectContent>
                      {languageKeys.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`langs.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {err(errors.nativeLanguage?.message)}
            </div>

            <div className="space-y-3 pt-1">
              <Controller
                control={control}
                name="acceptTerms"
                rules={{ required: t("onboarding.errorTerms") }}
                render={({ field }) => (
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c === true)}
                      className="mt-0.5"
                    />
                    <span className="text-muted-foreground">{t("onboarding.acceptTerms")}</span>
                  </label>
                )}
              />
              {err(errors.acceptTerms?.message)}
              <Controller
                control={control}
                name="acceptPrivacy"
                rules={{ required: t("onboarding.errorTerms") }}
                render={({ field }) => (
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(c) => field.onChange(c === true)}
                      className="mt-0.5"
                    />
                    <span className="text-muted-foreground">{t("onboarding.acceptPrivacy")}</span>
                  </label>
                )}
              />
              {err(errors.acceptPrivacy?.message)}
            </div>

            <Button type="submit" className="brand-gradient h-11 w-full text-white">
              {t("onboarding.createAccount")}
            </Button>

            <p className="text-muted-foreground text-center text-sm">
              {t("onboarding.haveAccount")}{" "}
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="text-primary font-semibold hover:underline"
              >
                {t("onboarding.signIn")}
              </button>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
