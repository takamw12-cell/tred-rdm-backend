import { cn } from "@/lib/utils";

export function Logo({ className, omitle = false }: { className?: string; omitle?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("w-10 h-10 text-primary", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Fond (optionnel, selon ton thème) */}
      <rect width="100" height="100" rx="20" fill="#F8F9FA" />
      
      {/* La base du T (Manche de l'épée) */}
      <path d="M45 40 L55 40 L55 95 C 50 98, 45 95, 45 90 Z" fill="#111111" />
      
      {/* Le bras horizontal (Garde de l'épée) */}
      <path d="M25 30 L75 30 L75 45 L45 45 L45 40 L55 40 L55 45 L25 45 Z" fill="#111111" />

      {/* Les fissures jaunes dans la lame */}
      <path d="M47 50 L49 60 L47 65 L50 75 L48 85" stroke="#EAB308" strokeWidth="1.5" fill="none" />
      <path d="M53 52 L51 62 L54 70 L52 80" stroke="#EAB308" strokeWidth="1.2" fill="none" />

      {/* L'articulation centrale jaune */}
      <rect x="47" y="37" width="6" height="6" rx="1.5" fill="#EAB308" />
      
      {/* Les éclats d'énergie jaunes en haut à droite */}
      <path d="M75 30 L82 22 L86 28 L80 38 L73 35 L85 15 Z" fill="#EAB308" opacity="0.9" />
      <path d="M70 25 L75 15 L78 18 L76 28 Z" fill="#EAB308" opacity="0.7" />
      <path d="M82 35 L90 30 L93 35 L85 40 Z" fill="#EAB308" opacity="0.6" />
      <path d="M65 30 L68 21 L70 25 Z" fill="#EAB308" opacity="0.8" />
    </svg>
  );
}