# Ciao Ciao Joyería — Design System

## Color Strategy: Committed

Champagne (#B89968) carries brand identity at 25–40% of the surface (CTAs, active states, accents). Ink for text, cream/vellum for surfaces. One accent color — no complementary palette.

### Palette

| Token | Hex | Usage |
|---|---|---|
| `champagne` | #B89968 | Primary CTA, active states, accents |
| `champagne-deep` | #9A7E50 | CTA hover, pressed states |
| `champagne-soft` | #EFE6D3 | Active nav bg, tag bg, soft highlight |
| `champagne-tint` | #FAF6EE | Row hover bg, input hover bg |
| `champagne-glow` | rgba(184,153,104,0.18) | Focus ring outer, selection |
| `ink` | #1A1A1A | Primary text |
| `ink-muted` | #6B6B6B | Secondary text, placeholders |
| `ink-subtle` | #A8A8A8 | Tertiary text, disabled labels |
| `ink-line` | #E8E2D4 | Borders (warm, replaces stone-100/200 entirely) |
| `cream` | #FAFAF7 | Page background |
| `cream-soft` | #F4F2EC | Section backgrounds, button ghost bg |
| `vellum` | #F7F2E8 | Warmer panel background, editorial sections |

### OKLCH equivalents (for reference, not in Tailwind config)
These are design-time references. The hex values above are canonical.

## Typography

### Fonts (oct-2026: same three voices as the certificate «El Estuche»)
- **Cinzel** (wordmark): «CIAO CIAO MX» only, via `<Wordmark>` (src/components/brand/Wordmark.tsx), tracking 0.3em.
- **Cormorant Garamond** (display, serif): weights 300 to 500 + italic. Never bold. Headings, large numerics (always lining figures: old-style made «11:00» read «I I:OO»), chapter numerals.
- **Jost** (sans, `--font-body`): all body copy, labels, inputs, UI elements, public and admin. Inter is retired.

### Scale
| Name | Size | Line-height | Usage |
|---|---|---|---|
| display-lg | 64px | 68px | Hero headlines (client only) |
| display-md | 40px | 44px | Section headlines, admin KPI |
| display-sm | 28px | 32px | Card headings, modal titles |
| xl | 20px | 28px | Sub-headings |
| lg | 17px | 24px | Large body, feature text |
| base | 15px | 22px | Default body |
| sm | 13px | 18px | Secondary body, table rows |
| xs | 11px | 16px | Labels, eyebrows, badges |

### Tracking Scale
| Token | Value | Usage |
|---|---|---|
| `tight` | -0.02em | Display headings |
| `snug` | -0.01em | Large body |
| `normal` | 0 | Default Inter |
| `eyebrow` | 0.18em | Section labels, badge text |
| `display-eyebrow` | 0.32em | Brand wordmark, hero eyebrow |

No improvised inline `tracking-[…]` values — use only named tokens.

## Depth System

| Level | Implementation | Usage |
|---|---|---|
| Flat | `bg-vellum` or transparent | Section breaks, editorial panels |
| Whisper | `border border-ink-line` | Secondary cards, table wrappers (no shadow) |
| Soft | `shadow-soft border border-ink-line/50` | Primary UI cards |
| Lift | `shadow-lift` | Modals, dropdowns, floating elements |
| Pop | `shadow-pop` | Active/hover state for gold buttons |

**Never nest cards.** If content inside a Card needs grouping, use a bordered `<dl>` or a `divide-y` list.

## Motion

### Easing
- Default ease: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out, stored as `--ease` CSS var)
- Quart: `cubic-bezier(0.25, 1, 0.5, 1)` — wizard step transitions
- Expo: `cubic-bezier(0.16, 1, 0.3, 1)` — modals, reveals

### Duration
- Hover/active: 120–150ms
- Enter/exit: 380–450ms
- Reveal (scroll): 500–600ms
- Count-up: 800ms
- No bounce. No elastic. No spring overshoot.

### AnimatePresence usage
- Wizard steps: `mode="wait"`, slide 24px + fade, 380ms quart
- Modal: scale 0.97↔1 + fade, 280ms expo
- Nav active pill: `layoutId="active-nav"` — slides between items
- Slot selection pill: `layoutId="slot-pill"` — slides between choices
- Calendar day selection: `layoutId="cal-selected"` — slides between days

### `reducedMotion="user"` on global MotionConfig
All JS animations auto-disable when OS reduce-motion preference is on.

## Component Decisions

### Card
4 variants: `flat`, `whisper`, `soft`, `lift`. Never `border-stone-*` — always `border-ink-line`.

### Input / Textarea / Select
Focus ring: `box-shadow: 0 0 0 3px rgba(184,153,104,0.18), 0 0 0 1px rgba(184,153,104,0.6)`. Never outline.

### Iconography
Lucide at `strokeWidth={1.5}` throughout. Default is 2 — thinner reads as luxury at this scale.

### Focus rings
Global: `box-shadow` focus ring (not `outline`). Champagne-glow outer + champagne inner ring at 1px.

### Skeleton
Warm shimmer: `#F7F2E8 → #FAFAF7 → #F7F2E8`, not cool gray.

## Layout Principles

- Body line length capped at 72ch on content pages.
- Admin content max-width: none (full fluid).
- Spacing rhythm: intentional variation. Not the same padding everywhere.
- Sidebar: w-56 on lg, icon-rail w-14 on md, hidden on sm (hamburger drawer).

## House stationery (oct-2026)

Public surface reads as an invitation card from a maison, not a booking tool.

- `.paper-grain`: warm paper with a fixed, pointer-events-none grain layer.
- `.engraved`: double hairline frame (outer champagne). Used for the final invitation card, the private reservation card and the admin login.
- `.gold-leaf` + `<HouseSeal>`: 5-stop OKLCH metallic gradient, only for seals and rules, never text.
- `.ornament-rule`: hairline with a central lozenge; `.chapter-numeral`: Cormorant italic roman numerals (I, II, III) instead of «Step 1/2/3».
- Imagery: `<HousePicture>` serves pre-optimized AVIF/WebP from public/images (3 widths, no metadata) with explicit width/height.
- Motion: `WordsReveal` (per-word mask rise), `Rise` (once on view), layoutId for the experience ring, slot pill and agenda day. Everything carries `data-reveal` so the noscript CSS shows it without JS.
- Privacy: the showroom address never appears on public pages, metadata, OG or client bundles (see src/lib/showroom-privacy.test.ts and `npm run check:privacy`).

## Admin (product register)

- Agenda (/admin/hoy): week strip + day timeline (free gaps, «Ahora» marker, next appointment) and the «Por decidir» inbox.
- Decisions and attendance use a deferred «Deshacer» window (useDeferredAction): nothing is sent until it expires.
- Resumen: inline figures between hairlines (no giant metric cards) and a CSS stacked weekly attendance chart.
