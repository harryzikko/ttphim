---
name: Obsidian Cinema
colors:
  surface: '#11131c'
  surface-dim: '#11131c'
  surface-bright: '#373943'
  surface-container-lowest: '#0c0e17'
  surface-container-low: '#191b24'
  surface-container: '#1d1f29'
  surface-container-high: '#282933'
  surface-container-highest: '#32343e'
  on-surface: '#e1e1ef'
  on-surface-variant: '#e9bcb6'
  inverse-surface: '#e1e1ef'
  inverse-on-surface: '#2e303a'
  outline: '#af8782'
  outline-variant: '#5e3f3b'
  surface-tint: '#ffb4aa'
  primary: '#ffb4aa'
  on-primary: '#690003'
  primary-container: '#e50914'
  on-primary-container: '#fff7f6'
  inverse-primary: '#c0000c'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#dcb8ff'
  on-tertiary: '#480081'
  tertiary-container: '#9a40f2'
  on-tertiary-container: '#fff7ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930007'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#efdbff'
  tertiary-fixed-dim: '#dcb8ff'
  on-tertiary-fixed: '#2c0051'
  on-tertiary-fixed-variant: '#6700b5'
  background: '#11131c'
  on-background: '#e1e1ef'
  surface-variant: '#32343e'
typography:
  display-hero:
    fontFamily: Montserrat
    fontSize: 56px
    fontWeight: '800'
    lineHeight: 64px
  display-hero-mobile:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Montserrat
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Montserrat
    fontSize: 18px
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
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-badge:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 3.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system delivers an immersive, theater-first digital experience crafted for a premier streaming service. The brand persona is cinematic, refined, authoritative, and technologically sophisticated. 

The aesthetic is anchored in **Premium Dark Cinema Mode**, blending deep obsidian surfaces with disciplined glassmorphism and subtle atmospheric glows (cyan and violet lighting accents inspired by modern theatrical projection). The interface intentionally dissolves into the darkness, allowing dynamic key art, high-bitrate video, and rich metadata to take center stage. 

Visual density is tuned for effortless browsing during evening viewing sessions, minimizing eye fatigue through deliberate dark contrast ratios while retaining punchy primary actions via a signature high-energy cinema red.

## Colors

The palette relies on absolute light suppression and deliberate focal points:

- **Primary (`#E50914`)**: Vibrant Cinema Red. Reserved for high-intent conversion points, active playback progress, live stream status badges, and focused interactions.
- **Secondary (`#00F0FF`)**: Atmospheric Cyan. Used exclusively as an ethereal ambient edge highlight, focus states on secondary media controls, and subtle glow backdrops on featured theatrical releases.
- **Tertiary (`#8A2BE2`)**: Deep Violet. Paired with cyan in fluid radial gradient backgrounds behind key hero artwork to simulate theatrical auditorium lighting.
- **Neutral Base Surfaces**:
  - `Surface Void (#090A0F)`: Canvas baseline, root layout, and letterbox areas.
  - `Surface Base (#12141D)`: Primary container panels, background cards, and bottom sheet drawers.
  - `Surface Elevated (#1A1D29)`: Hovered cards, floating overlays, modal surfaces, and active episode tiles.
  - `Surface Glass`: Semi-transparent `rgba(18, 20, 29, 0.75)` combined with `backdrop-filter: blur(20px)`.
- **Text & Metadata**:
  - `Text High-Emphasis (#FFFFFF)`: 100% white for titles, active navigations, and player timestamps.
  - `Text Medium-Emphasis (#9CA3AF)`: Slate-gray for synopses, cast names, and secondary metadata.
  - `Text Muted (#4B5563)`: Technical specs and inactive control toggles.

## Typography

Typography establishes an immediate hierarchy between cinematic drama and utilitarian readability:

- **Headlines (Montserrat)**: Features high geometric impact, solid character widths, and clean diagonals. Used for hero billboard titles, rail section titles ("Phim Chiếu Rạp Mới", "Thịnh Hành"), and modal headers.
- **Body & Metadata (Inter)**: Delivers unmatched cross-platform clarity at small sizes for complex metadata strings, Vietnamese diacritics, cast listings, and descriptive synopsis text.
- **Badges & Labels (Inter SemiBold/Bold)**: Compact, uppercase or semi-bold styling engineered to remain crisp within high-density badges (`VIETSUB`, `THUYẾT MINH`, `4K HDR`, `T18`).

## Layout & Spacing

The platform follows a responsive 12-column fluid grid system on desktop and tablet, converting to a 4-column layout on mobile devices.

- **Content Rails**: Horizontal content carousels span edge-to-edge, with outer items clipping dynamically against viewport margins to suggest continuous horizontal scroll affordance.
- **Vertical Rhythm**: Section titles utilize `space-md` separation from their respective card carousels, while major content rails maintain `space-xl` (40px) vertical separation.
- **Breakpoints**:
  - `Mobile (< 768px)`: 4 columns, `margin-mobile` (16px), `gutter-mobile` (12px). Carousels peek at 15% width of the next card.
  - `Tablet (768px - 1024px)`: 8 columns, 32px margins, 16px gutters.
  - `Desktop (> 1024px)`: 12 columns, max content container of 1680px centered, `margin` (56px), `gutter` (24px).

## Elevation & Depth

Visual depth is achieved through translucent glass, disciplined surface stratification, and controlled luminous shadows:

- **Level 0 (Base Canvas)**: Flat `#090A0F`. Non-interactive backdrop.
- **Level 1 (Card & Content Rails)**: Solid `#12141D` or `#1A1D29` with a subtle 1px inner border: `inset 0 1px 0 0 rgba(255, 255, 255, 0.05)`.
- **Level 2 (Hover States & Overlays)**: Surface lifts via `transform: scale(1.04)` paired with an ambient drop shadow: `0 12px 32px -4px rgba(0, 0, 0, 0.8), 0 0 16px -2px rgba(229, 9, 20, 0.15)`.
- **Level 3 (Navigation Bars & Floating Overlays)**: Glassmorphic treatment with `background: rgba(18, 20, 29, 0.72)`, `backdrop-filter: blur(24px) saturate(180%)`, and border `1px solid rgba(255, 255, 255, 0.08)`.
- **Level 4 (Video Player Controls & Fullscreen Modals)**: Gradients layered over media (`linear-gradient(to top, rgba(9, 10, 15, 0.95) 0%, transparent 100%)`) providing 100% contrast for scrub bars and telemetry.

## Shapes

The design uses a balanced `Rounded` language (`8px / 0.5rem` base) that softens the technical pitch-black aesthetic while maintaining architectural structure:

- **Base Components (0.5rem / 8px)**: Movie poster cards, backdrop cards, category chips, video player scrim buttons, and modal dialogs.
- **Pills / Capsular Shapes (Full Rounded)**: Episode selectors, play CTA buttons, badge tags (`Vietsub`, `HD`), and scrub bar thumbs.
- **Large Layout Containers (1rem / 16px)**: Floating video player preview panels and drawer sheets.

## Components

### Media Cards
- **Poster Cards (2:3 aspect ratio)**: Primary portrait format for catalog browsing. Features smooth gradient overlays at the bottom edge for metadata readability, lazy-loaded poster artwork, top-right technical badges, and bottom progress bars for partially watched titles.
- **Backdrop Cards (16:9 aspect ratio)**: Landscape format for "Tiếp tục xem" (Continue Watching) and episode selection. Shows title, episode number, duration, and a continuous playback progress track along the card's bottom rim.

### Badges & Tags
- **Metadata Badges**: Compact pill formats with 1px border.
  - `Vietsub`: Subtle amber/gold border `rgba(245, 158, 11, 0.4)` with solid typography.
  - `Thuyết minh`: Electric cyan border `rgba(0, 240, 255, 0.4)` and cyan text.
  - `Resolution (4K, FHD)`: Frosted glass badge (`rgba(255,255,255,0.1)`) with white text.
  - `Age Rating (T18, T16)`: Red tint border (`rgba(229,9,20,0.5)`).

### Buttons & Interactive Controls
- **Primary CTA**: Cinema Red (`#E50914`) background, bold white text, pill-shaped, subtle drop shadow with red ambient aura on hover.
- **Secondary CTA**: Translucent white (`rgba(255, 255, 255, 0.12)`), 1px border `rgba(255, 255, 255, 0.2)`, glass blur.
- **Episode Selectors**: Compact rounded pills or squircle boxes. Inactive states use `#1A1D29`; active/playing episode uses Cinema Red accent with an animated audio-wave indicator.

### Video Player Interface
- **Scrub Bar**: Ultra-thin 3px rail in `#374151` that expands to 6px on hover. Buffer range displayed in semi-transparent white; played portion in Cinema Red (`#E50914`) with a glowing 12px circular scrub thumb.
- **Control Overlay**: Auto-hiding control tier resting on a soft gradient scrim. High-contrast icon buttons for audio track selector (Vietsub / Lồng tiếng / Thuyết minh), episode picker shortcut, playback speed toggle, and server switchers (Hà Nội, TP.HCM, CDN Quốc Tế).

### Navigation & Search
- **Top Navigation Bar**: Sticky, glassmorphic floating header with real-time blur. Includes brand mark, main navigation links, quick search input with instant poster previews, and profile avatar.
- **Category Filter Chips**: Horizontally scrollable row of rounded pills. Active state fills with high-contrast neutral `#FFFFFF` and dark text `#090A0F`, while inactive chips rest at `#1A1D29` with `#9CA3AF` text.