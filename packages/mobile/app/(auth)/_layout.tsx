import { Stack } from "expo-router";

/**
 * Le groupe des écrans d'authentification.
 *
 * `SessionGate` redirige vers `/(auth)/sign-in` dès que la session est vide.
 * Ce groupe n'existait pas : la redirection pointait donc vers le vide, et
 * personne ne pouvait se connecter depuis le téléphone. L'application se
 * lançait, affichait le logo, puis restait figée.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
