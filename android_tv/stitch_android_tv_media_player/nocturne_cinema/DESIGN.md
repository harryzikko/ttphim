---
name: Nocturne Cinema
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
  on-surface-variant: '#cdc2d8'
  inverse-surface: '#e1e2eb'
  inverse-on-surface: '#2e3037'
  outline: '#968da1'
  outline-variant: '#4b4455'
  surface-tint: '#d4bbff'
  primary: '#d4bbff'
  on-primary: '#41008b'
  primary-container: '#8a3ffc'
  on-primary-container: '#faf1ff'
  inverse-primary: '#7825ea'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#ffb1c3'
  on-tertiary: '#66002c'
  tertiary-container: '#db0068'
  on-tertiary-container: '#fff1f2'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ebdcff'
  primary-fixed-dim: '#d4bbff'
  on-primary-fixed: '#270058'
  on-primary-fixed-variant: '#5d00c2'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#ffd9e0'
  tertiary-fixed-dim: '#ffb1c3'
  on-tertiary-fixed: '#3f0019'
  on-tertiary-fixed-variant: '#8f0041'
  background: '#10131a'
  on-background: '#e1e2eb'
  surface-variant: '#32353c'
typography:
  headline-xl:
    fontFamily: Sora
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 68px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-sm:
    fontFamily: Sora
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
  title-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  title-sm:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 30px
  body-md:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-sm:
    fontFamily: Manrope
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  label-lg:
    fontFamily: Sora
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0.04em
  label-md:
    fontFamily: Sora
    fontSize: 13px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Sora
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 3.5rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1.25rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

This design system defines an immersive 10-foot television viewing experience optimized for Android TV and Jetpack Compose for TV. Tailored for living-room viewing environments at a 3-meter distance, the aesthetic merges cinematic darkness with high-energy luminous focus states.

### Core Character
- **Atmospheric & Submerged:** A deep midnight obsidian canvas (#0B0E14) eliminates panel glare and optical fatigue in darkened rooms, letting photography and key art occupy center stage.
- **Electric Precision:** Navigational state relies on sharp, radiant accents—electric violet transitioning to piercing cyan—ensuring D-pad movement delivers instantaneous visual feedback across the room.
- **Cinematic Depth:** Frosted smoked-glass overlays, layered metadata tiers, and soft luminous Halos define depth instead of skeuomorphic bevels or heavy opaque drop shadows.

### Aesthetic Movement
The aesthetic synthesizes modern **Glassmorphism** with **Luminous High-Contrast TV Architecture**: deep obsidian surfaces, edge-lit chromatic borders on focus, and expansive 16:9 spatial choreography tailored strictly for directional pad (D-pad) navigation.

## Colors

The palette is engineered specifically for self-emissive OLED and high-brightness HDR television panels. Backgrounds remain in the near-black spectrum to optimize panel contrast, while interaction accents employ high-saturation values capable of slicing through ambient living room lighting.

### Color Roles
- **Base Canvas (`#0B0E14`):** Near-black obsidian. Serves as the ultimate resting plane. Prevents optical burnout during extended evening viewing.
- **Surface Elevation (`#141923`):** Elevated card containers, inactive rails, and modals.
- **Surface Glass (`rgba(20, 25, 35, 0.65)`):** Smoked translucent container with a 24px backdrop blur for overlays and contextual drawers.
- **Primary Accent - Electric Violet (`#8A3FFC`):** Focus rings, active rail pills, primary button fills, and progress indicators.
- **Secondary Accent - Cyber Cyan (`#00F0FF`):** Focus glow halos, scrubbing heads, live indicators, and secondary highlights.
- **Tertiary Accent - Neon Magenta (`#FF007A`):** Critical alerts, bookmark highlights, and editorial badge highlights.
- **Neutral Foreground (`#F1F5F9`):** High-contrast text core, calibrated to achieve an 11:1+ contrast ratio against midnight containers.
- **Neutral Subdued (`#94A3B8`):** Secondary metadata, inactive icons, and descriptive copy.
- **Focus Glow Gradient:** Dynamic dual-stop linear stroke transitioning from `#8A3FFC` to `#00F0FF` on active D-pad selection.

## Typography

Typography for a 10-foot experience requires specialized tracking, weight distribution, and sizing thresholds to remain legible at distances ranging from 2.5 to 4 meters. The minimum font size across the entire system is strictly capped at 11px (used only for micro badges), with standard body copy fixed at 18px and above.

### Font Pairings
- **Headlines & Technical Labels (`Sora`):** A geometric typeface with open apertures and high horizontal distinction. Sora prevents pixel-clustering on 1080p upscaled panels and retains crisp legibility on 4K displays.
- **Body & Metadata (`Manrope`):** A semi-geometric sans-serif balancing warm readability with modern tech precision. Perfect for multi-line cinematic synopses.

### Application Rules
- **No Light Weights:** 400 (Regular) is the lowest allowable weight. Thin and Light styles suffer rasterization shimmer during scroll cycles.
- **All-Caps Badges:** `label-md` and `label-sm` are deployed in uppercase with expanded letter-spacing (`+0.08em` to `+0.1em`) for immediate parsing of technical specs (e.g., `4K UHD`, `HDR10`, `DOLBY ATMOS`).

## Layout & Spacing

Designed strictly around standard 16:9 widescreen canvas resolutions (1920x1080 baseline dp scaling to 3840x2160 UHD).

### Safe Areas & Margins
- **Overscan Margins (`margin: 3.5rem` / 56dp):** Content conforms to a mandatory overscan safety buffer from display perimeters, protecting against edge clipping on legacy or budget panels.
- **Horizontal Rails:** Rows extend past the right overscan boundary using open-ended clipping to telegraph horizontal scrollability, while key card titles align strictly to the primary left margin.

### Spatial Rhythm
- **Rail-to-Rail Stacking:** Vertical distance between horizontal carousel rows is set to `space-xl` (48dp) to provide clear focus isolation as the D-pad traverses vertically.
- **Inter-Item Distance:** Cards within carousels are separated by `gutter` (24dp) at rest, expanding contextually when adjacent items scale up on focus.

## Elevation & Depth

TV interfaces lack cursor pointers and touch points. Elevation is therefore not static; it is an active state driven by focus navigation.

### Focus Elevation (Scale + Halo)
- **Scale Factor:** Focused cards and primary action components elevate physically via a scale transform (`1.08x` scale on standard 16:9 cards, `1.12x` on circular avatars or square icons).
- **Luminous Bloom:** Focused elements emit an intense, dual-layer colored glow instead of a black shadow:
  - Ambient: `0px 12px 32px rgba(138, 63, 252, 0.45)`
  - Direct Edge Bloom: `0px 0px 16px rgba(0, 240, 255, 0.35)`
- **Resting Depth:** Inactive surfaces use zero box-shadow, remaining visually flat against the `#0B0E14` backdrop to focus viewer attention exclusively on the selected node.

### Glassmorphic Surfaces
- **Backdrop Filters:** Overlay elements (flyout navigation rail, audio track selector, quick settings modal) utilize background blurring (`blur(24px)`) over `#141923` filled at 65% opacity.
- **Perimeter Hairline:** Glass layers feature a 1px border colored `rgba(255, 255, 255, 0.08)` to clearly articulate structural boundaries against photographic backdrops.

## Shapes

The interface utilizes a disciplined rounded-corner visual language (`roundedness: 2`). This provides soft, modern silhouettes that match hardware bezels while maximizing poster artwork canvas area.

### Corner Radii Tokens
- **Base Elements (`rounded`, 8dp):** Small interactive chips, technical specs badges, and sub-labels.
- **Cards & Banners (`rounded-lg`, 16dp):** Standard media thumbnail cards, episode selectors, and hero banner focus frames.
- **Flyout Drawers & Modals (`rounded-xl`, 24dp):** Floating context menus, full screen modal dialogue wrappers, and detail sheets.
- **Full Radius (Pill):** Navigation rail indicator pills, search bars, and play/resume primary action buttons.

## Components

### 1. Media Cards (Poster & 16:9 Landscape)
- **Unfocused State:** High-res image thumbnail masked with an 8dp radius (`rounded`). Subdued metadata below.
- **Focused State:** Scales smoothly to `1.08x` over 200ms using Jetpack Compose `FastOutSlowInEasing`. Gains a 2.5dp gradient focus ring (`#8A3FFC` to `#00F0FF`) and a 16dp outer glow. Image reveals a subtle bottom-gradient scrim containing rich inline metadata (runtime, match %, audio format).
- **Progress Tracking:** In-progress cards feature a bottom-docked 4dp linear bar with an active `#00F0FF` fill and a dark slate track.

### 2. Navigation Rail
- **Collapsed (Default):** 72dp wide vertical bar docked to the safe margin. Displays monochrome, semi-transparent icons (`#94A3B8`).
- **Expanded (Focused):** Expands to 280dp with a frosted obsidian glass drawer (`rgba(11, 14, 20, 0.85)` + 24dp blur). Icon labels animate into visibility via a smooth alpha fade. Active destination is anchored by an electric violet capsule indicator with high-contrast white text.

### 3. Audio / Video Technical Badges
- **Display Properties:** Compact micro-components displaying hardware capabilities: `4K UHD`, `HDR10`, `DOLBY VISION`, `DOLBY ATMOS`.
- **Styling:** Inset padding of 4dp vertical by 8dp horizontal. Background fill of `rgba(255, 255, 255, 0.06)` with a 1px solid border of `rgba(255, 255, 255, 0.15)`. Font is `label-sm` (`Sora` 11px uppercase bold). Inactive badges are neutral white/slate; hero badges use `#00F0FF` border accents.

### 4. Interactive Buttons (Action Bar)
- **Play / Primary:** Fully rounded pill button. When focused: Solid white or `#8A3FFC` fill with a stark black or white icon/label, accompanied by a dynamic outward halo glow. Unfocused: Semi-transparent smoked glass with white label.
- **Secondary Actions (Watchlist, Trailer, Audio):** 48dp circular icon buttons. On focus: Scales to `1.12x` with a cyan outline ring.

### 5. Carousel Rows
- **Structure:** Vertical stack of horizontal rows. Row titles use `title-lg` with high-contrast `#F1F5F9`.
- **Navigation Behavior:** Smooth horizontal scrolling with snap-to-center or snap-to-margin logic. Focus transition between cards preserves horizontal scroll position when navigating vertically away and back.