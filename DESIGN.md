# DESIGN.md — citas.ciaociao.mx

Sistema de diseño de la app de reservas de CIAO CIAO (maison de alta joyería, México). Extraído del código vivo (`tailwind.config.ts`, `globals.css`, `src/components/ui`). Register: **product** (la UI sirve al producto), con alma **brand** en las superficies de la clienta (reserva/estado) porque son cara de la maison.

## Principio rector
Sobriedad de casa de lujo: calma, aire, tipografía con carácter, movimiento discreto. Nunca "dashboard SaaS". El equipo opera desde iPhone; la clienta reserva desde iPhone. Todo tap target ≥44px.

## Color (OKLCH, neutrales tintados — nunca #000/#fff)
- **champagne** (acento, ≤10% de la superficie): DEFAULT `oklch(0.66 0.083 80)`, `solid` para texto sobre claro, `deep`, `soft`, `tint` (fondos), .
- **ink** (texto): DEFAULT `0.18`, `muted` (secundario), `subtle` (terciario), `line` (bordes `0.88`).
- **cream** (fondo página) / **porcelain** / **vellum** / **admin.surface|panel|line** (superficies del panel).
- **showroom.ink|velvet|stone**: acentos cálidos para superficies de lujo (clienta).
- Estados: usa `Badge` (verde/ámbar/rojo/neutro) — NUNCA inventes colores sueltos; ámbar = falta algo, verde = listo, rojo = problema.

## Tipografía
- **serif/display** = Cormorant (`font-serif`, `font-display`): títulos, nombres, cifras hero. **sans** = Inter: cuerpo/UI.
- Escala: `display-lg/md/sm`, `13`, `11`. Jerarquía por escala + peso (≥1.25 entre pasos). Eyebrows con `tracking-eyebrow`/`display-eyebrow` en mayúsculas, `text-champagne-solid`.
- Cuerpo ≤75ch.

## Elevación y forma
- Sombras: `soft` (reposo), `lift` (hover/activo), `pop` (champagne), `warm`, `whisper` (hairline), `focus-ring`.
- Bordes hairline `ink-line`. Radios generosos y consistentes. **Nada de nested cards.** Las cards solo cuando son el mejor affordance; mucho respira sin contenedor.

## Movimiento
- Solo curvas ease-out exponenciales: `ease-quart|quint|expo`. Animaciones existentes: `fade-down`, `scale-in`, `slide-left|right`. Nunca bounce/elastic; nunca animar propiedades de layout.

## Componentes canónicos (`src/components/ui`)
`Button` (variantes gold/ghost/danger…), `Card`, `Badge`, `Modal`, `AlertDialog` (confirmaciones destructivas), `Field`/`Input`, `EmptyState` (todo estado vacío pasa por aquí), `Skeleton` (toda carga), `Tooltip`, `KbdHint`. Reusa SIEMPRE estos; no reimplementes.

## Copy
Español, tono maison, cálido y breve. CERO emojis de color en UI. Sin em dashes. Cada palabra cuenta; el subtítulo no repite el título.

## Anti-referencias (lo que NO somos)
Panel de aerolínea, Calendly genérico, dashboard cripto, tarjetas-icono-título-texto en rejilla infinita, hero-métrica con degradado. Si parece "lo hizo una IA", falló.
