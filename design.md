# AeroStudy AI — Design System

EdTech platform for engineering students at German-speaking universities. Apple-inspired: minimalist, calm, precise, generous whitespace, soft depth.

## Brand
- **Product**: AeroStudy AI — logo is a stylized aircraft wing (upward swept chevron) in the primary gradient.
- **Voice**: focused, encouraging, technical-but-clear. Trilingual DE / FR / EN, with German technical terms always preserved.

## Typography
- **Display / headings**: `Sora` (600–800), tight tracking (-0.02em).
- **Body / UI**: `Manrope` (400–700).
- Generous line-height (1.6 body). Numbers and formulas in KaTeX serif where math.

## Color (light)
- Background: near-white `oklch(0.99 0.004 240)`
- Foreground: ink `oklch(0.20 0.02 250)`
- **Primary**: aerospace blue `oklch(0.55 0.18 255)` — sky/precision. Gradient to `oklch(0.62 0.15 210)` (cyan).
- **Accent**: warm amber `oklch(0.78 0.15 70)` for "in progress" states.
- Success/mastered: green `oklch(0.68 0.16 150)`.
- Neutral cards, hairline borders `oklch(0.92 0.005 250)`.

## Color (dark)
- Background deep slate `oklch(0.17 0.02 255)`, cards `oklch(0.21 0.02 255)`.
- Primary brightens to `oklch(0.70 0.16 255)`.

## Knowledge state palette (Engineering DNA, dictionary, badges)
- **mastered** (maîtrisé / gemeistert): green
- **learning** (en cours / in Bearbeitung): amber
- **new** (nouveau / neu): neutral gray

## Layout
- Fixed left **sidebar** (256px) on desktop with logo + nav; collapses into a burger `Sheet` on mobile.
- Content max-width ~1100px, padding 24–40px, mobile-first.
- Cards: radius 1rem (`--radius: 0.9rem`), soft shadow, hairline border, subtle hover lift.
- Language switcher: 3 pill buttons (🇩🇪 DE · 🇫🇷 FR · 🇬🇧 EN) top-right, active pill fills with primary, 200ms spring.

## Motion (Framer Motion)
- Page load: staggered fade+rise (y: 12→0, 60ms stagger, 300ms).
- Hover: cards lift `y:-2`, shadow grow. Buttons scale 0.98 on tap.
- Language switch & theme toggle: 150–250ms.

## Components (shadcn/ui built on Radix)
Button, Card, Input, Textarea, Select, Checkbox, Badge, Progress, Switch, RadioGroup, Separator, Sheet, DropdownMenu, Avatar, ScrollArea, Label, Tooltip.
Custom: LanguageSwitcher, Sidebar, DictionaryTooltip, ConceptBadge, FormulaRenderer (KaTeX), SourceCitation.

## i18n
- All copy from `src/web/i18n/messages/{de,fr,en}.ts`. Zero hardcoded UI strings.
- Locale in Zustand + localStorage, switch is instant (no reload).
- German technical terms kept verbatim in every language, glossed in-line: **Querkraft** (effort tranchant).

## Accessibility
- WCAG AA contrast, visible focus rings, labels on all inputs, aria on interactive controls.
