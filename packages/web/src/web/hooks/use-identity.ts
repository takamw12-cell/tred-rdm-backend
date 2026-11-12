import { authClient } from "@/lib/auth";
import { useT } from "@/i18n";
import { useUserStore } from "@/stores/user";
import { resolveIdentity, type Identity } from "../../api/lib/display-name";

/**
 * Le nom à afficher pour l'étudiant CONNECTÉ : il vient de sa session, jamais
 * d'une valeur par défaut. Le nom saisi à l'onboarding (stocké dans le
 * navigateur) ne sert que s'il appartient à ce compte.
 */
export function useIdentity(): Identity {
  const { t } = useT();
  const { data: session } = authClient.useSession();
  const profile = useUserStore((s) => s.profile);
  const ownerId = useUserStore((s) => s.ownerId);
  const user = session?.user;
  const owns = !!user && ownerId === user.id;
  return resolveIdentity({
    name: user?.name,
    email: user?.email,
    profileName: owns ? `${profile.firstName} ${profile.lastName}` : "",
    fallback: t("common.student"),
  });
}
