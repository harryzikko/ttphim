---
name: CineViet Premier Dark
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363940'
  surface-container-lowest: '#0b0e14'
  surface-container-low: '#191c22'
  surface-container: '#1d2026'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2eb'
  on-surface-variant: '#e9bcb6'
  inverse-surface: '#e1e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#af8782'
  outline-variant: '#5e3f3b'
  surface-tint: '#ffb4aa'
  primary: '#ffb4aa'
  on-primary: '#690003'
  primary-container: '#e50914'
  on-primary-container: '#fff7f6'
  inverse-primary: '#c0000c'
  secondary: '#ffb5a0'
  on-secondary: '#5f1500'
  secondary-container: '#d73b00'
  on-secondary-container: '#fffbff'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#a06500'
  on-tertiary-container: '#fff7f1'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930007'
  secondary-fixed: '#ffdbd1'
  secondary-fixed-dim: '#ffb5a0'
  on-secondary-fixed: '#3b0900'
  on-secondary-fixed-variant: '#862200'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#10131a'
  on-background: '#e1e2eb'
  surface-variant: '#32353c'
  surface-base: '#0B0E14'
  surface-card: '#141824'
  surface-elevated: '#1E2333'
  border-subtle: rgba(255, 255, 255, 0.08)
  border-active: rgba(229, 9, 20, 0.5)
  badge-dolby: '#1E293B'
  badge-gold: '#F59E0B'
  text-primary: '#FFFFFF'
  text-secondary: '#94A3B8'
  text-muted: '#64748B'
typography:
  display-hero:
    fontFamily: Montserrat
    fontSize: 44px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Montserrat
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Montserrat
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: Montserrat
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  label-badge:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a high-end, immersive cinematic streaming experience tailored for premium digital entertainment. Drawing structural and atmospheric inspiration from flagship platforms such as Apple TV+ and Netflix, the aesthetic merges razor-sharp technical fidelity with deep visual drama.

### Personality & Tone
- **Cinematic & Immersive:** Deep obsidian backgrounds push visual artwork, cover stills, and video backdrops forward without chromatic interference.
- **High-Fidelity & Modern:** Crisp typography, razor-thin borders, and meticulous micro-badges (4K, HDR, Dolby Atmos) communicate institutional quality and cutting-edge media delivery.
- **Electric & Engaging:** Vibrant energetic neon crimson and solar amber gradients produce decisive focal anchors across calls-to-action and marquee highlights.

### Design Movement
A fusion of **Modern Dark-Mode Corporate** and **Cinematic Glassmorphism**:
- Ultra-dark tonal layering with matte deep-navy charcoal undertones.
- Subtle 1px luminous borders (`rgba(255, 255, 255, 0.08)` to `rgba(229, 9, 20, 0.3)`).
- Controlled atmospheric ambient glow behind interactive hero elements and prominent carousel rows.

## Colors

The color palette is engineered around dark-room theater environments. By avoiding pure `#000000` for cards and content containers, the system creates optical depth while minimizing OLED clipping and visual fatigue.

### Palette Architecture
- **Primary (`#E50914` - Neon Cinema Red):** Reserved strictly for high-priority actions, brand identification, play indicators, and active selection underlines.
- **Secondary (`#FF5722` - Solar Orange):** Acts as the transition vector for dynamic linear gradients (`linear-gradient(135deg, #E50914 0%, #FF5722 100%)`), signaling hot releases, trending ranks, and promotional callouts.
- **Tertiary (`#F59E0B` - Amber Gold):** Dedicated to technical metadata, VIP distinctions, star ratings, and top-ranking leaderboards.
- **Neutral Foundation (`#0B0E14` & `#141824`):** The stage backdrop. Canvas maintains `#0B0E14`, while cards, carousels, and dialogs ascend through `#141824` and `#1E2333`.

## Typography

Typography prioritizes maximum scan-efficiency during horizontal carousels and swift browsing:
- **Headlines & Feature Titles (`Montserrat`):** Geometric, solid, high impact. Used in high weights (`700`, `800`) to anchor hero promotional titles, section headers, and numerical rankings.
- **Body & Metadata (`Inter`):** Clean, neutral, high legibility on dark surfaces. Keeps complex metadata (genres, durations, synopses, cast) readable even at compact mobile scales.
- **Badges & Tags (`label-caps`, `label-badge`):** Micro-scale uppercase typography rendered with generous letter-spacing to ensure crisp legibility on top of vibrant artwork posters.

## Layout & Spacing

The layout is built around a content-first fluid grid structured to support continuous edge-to-edge media carousels and immersive hero showcases.

### Layout Rhythm & Breakpoints
- **Mobile (< 768px):** Single-column stack with horizontal overflow snapping for movie shelves. Side margins: `1rem` (`16px`), gutter: `0.75rem` (`12px`).
- **Tablet (768px - 1024px):** 8-column layout. Side margins: `1.5rem` (`24px`).
- **Desktop (> 1024px):** 12-column layout with a maximum content canvas of `1440px`. Side margins: `3rem` (`48px`), gutters: `1.5rem` (`24px`).

### Vertical Rhythm
- Section gaps between distinct film carousels follow `2.5rem` (`40px`) to prevent visual crowding while keeping multiple categories discoverable within the primary viewport fold.
- Hero headers utilize dynamic bottom padding with dark gradient scrims (`linear-gradient(to top, #0B0E14 0%, transparent 100%)`) spanning the lower 35% of the viewport.

## Elevation & Depth

Visual hierarchy is managed through controlled tonal elevation, delicate luminous contours, and cinematic neon glows rather than harsh drop shadows.

### Elevation Levels
1. **Level 0 (Canvas Base):** Deep matte `#0B0E14`. No elevation.
2. **Level 1 (Card & Shelf Surfaces):** Surface `#141824` with a 1px inner or perimeter border of `rgba(255, 255, 255, 0.06)`.
3. **Level 2 (Active Hover & Interactive Floating Sheets):** Surface `#1E2333`, outer ambient border `rgba(255, 255, 255, 0.12)`, supported by an ambient drop shadow: `0 8px 24px rgba(0, 0, 0, 0.6)`.
4. **Level 3 (Focused & Primary Neon Focus):** Border becomes `rgba(229, 9, 20, 0.6)` supplemented by a dual-glow:
   - Near glow: `0 0 12px rgba(229, 9, 20, 0.35)`
   - Diffused cast: `0 16px 36px rgba(0, 0, 0, 0.8)`

### Scrims and Overlays
- Modal overlays use `rgba(11, 14, 20, 0.85)` with a `12px` background blur (`backdrop-filter: blur(12px)`).
- Media poster footers apply a direct vertical black gradient overlay (`rgba(11, 14, 20, 0) 0%` to `rgba(11, 14, 20, 0.95) 100%`) ensuring title text and badge contrast.

## Shapes

The design system maintains a refined balance between modern architectural sharpness and fluid streaming interfaces. 

- **Media Posters & Standard Cards:** Use default roundedness (`0.5rem` / `8px`) to ensure poster artwork edges remain clear without clipping composition corners.
- **Controls & Chips:** Filter tags, technology badges, and category tabs adopt pill geometry (`rounded-full` / `9999px`) for ergonomic touch targets.
- **Hero Banners & Modals:** Standardized on `rounded-xl` (`1.5rem` / `24px`) to frame wide compositions cleanly on large viewports.

## Components

### Buttons
- **Primary Action (Watch Now / Play):** Filled linear gradient from `#E50914` to `#FF5722`. High-contrast white typography (`label-md`), accompanied by solid glyph icons (Play, Download). On hover: subtle scale transform (`1.03`) with a crimson outer bloom (`0 4px 20px rgba(229, 9, 20, 0.4)`).
- **Secondary Action (Trailer / Add to List):** Translucent backdrop (`rgba(255, 255, 255, 0.1)`) with `1px` subtle outline (`rgba(255, 255, 255, 0.15)`), dynamic blur `8px`, white text. Hover state shifts background to `rgba(255, 255, 255, 0.2)`.
- **Tertiary / Icon Buttons:** Borderless `40x40px` circular buttons with dark-tinted glass background (`#1E2333`), housing high-contrast icons.

### Badges & Tech Indicators (4K, HDR, Dolby, VietSub)
- **High-Spec Badges (4K HDR, Dolby Audio):** Solid slate base (`#1E293B`) or frosted obsidian with a gold/white hairline border (`0.5px solid rgba(245, 158, 11, 0.4)`). Typography: `label-badge`, crisp uppercase, zero padding bleed.
- **Episode & Release Tags:** Neon Red pill (`#E50914`) top-left anchored on cards, bold white lettering.
- **Ranking Indicators (Top 10):** Stylized giant outlines overlaid across poster corners or dynamic multi-color metallic glyphs.

### Movie & Show Cards
- **Aspect Ratios:** Standard vertical portrait (`2:3`) for film posters, cinematic widescreen (`16:9`) for series episodes and ongoing live streams.
- **Hover & Focus Interactions:** Poster scales smoothly by `4%`, elevated with 1px active gradient border (`rgba(229, 9, 20, 0.6)`) and an automatic bottom meta-reveal displaying rating, year, and rapid-play shortcuts.

### Filter Chips & Navigation Tabs
- Pill-shaped container (`rounded-full`). Inactive state: `#141824` background with `#94A3B8` text. Active state: high-contrast red accent background (`#E50914`) or white foreground with illuminated indicators.

### Inputs & Search
- Inputs feature deep charcoal fill (`#141824`), muted placeholder typography (`#64748B`), and 1px border (`rgba(255, 255, 255, 0.08)`).
- On focus: Glow transitions to intense primary border (`#E50914`) with `0 0 0 3px rgba(229, 9, 20, 0.15)` focus ring.