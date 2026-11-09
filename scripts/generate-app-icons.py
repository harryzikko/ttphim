import os
import sys
from PySide6.QtGui import QImage, QPainter, QGuiApplication
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtCore import QSize, QRectF, Qt
from PIL import Image

app = QGuiApplication(sys.argv)

# 1. Full-bleed 1024x1024 Master iOS & Store App Icon (Full-bleed square, no clipped outer corners)
ICON_1024_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <!-- Deep Cinema Radial Background -->
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="#1c1f2e" />
      <stop offset="45%" stop-color="#0f111a" />
      <stop offset="100%" stop-color="#05060a" />
    </radialGradient>

    <!-- Ambient Red Core Glow -->
    <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e50914" stop-opacity="0.45" />
      <stop offset="50%" stop-color="#e50914" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#e50914" stop-opacity="0" />
    </radialGradient>

    <!-- Cine Red Gradient -->
    <linearGradient id="cineRed" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#ff473d" />
      <stop offset="35%" stop-color="#e50914" />
      <stop offset="75%" stop-color="#b8050e" />
      <stop offset="100%" stop-color="#730006" />
    </linearGradient>

    <!-- Play Triangle Soft Coral Gradient -->
    <linearGradient id="playGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="70%" stop-color="#fff5f4" />
      <stop offset="100%" stop-color="#ffc2ba" />
    </linearGradient>

    <!-- Soft Inner Plate Border -->
    <linearGradient id="plateBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff473d" stop-opacity="0.5" />
      <stop offset="50%" stop-color="#e50914" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#00eefc" stop-opacity="0.35" />
    </linearGradient>
  </defs>

  <!-- Full-bleed Background -->
  <rect width="1024" height="1024" fill="url(#bgGrad)" />

  <!-- Subtle Inner Obsidian Card (860x860) -->
  <rect x="82" y="82" width="860" height="860" rx="200" fill="#0b0d15" fill-opacity="0.9" />
  <rect x="82" y="82" width="860" height="860" rx="200" fill="url(#coreGlow)" />
  <rect x="85" y="85" width="854" height="854" rx="197" fill="none" stroke="url(#plateBorder)" stroke-width="8" />

  <!-- Central Red Ambient Aura -->
  <circle cx="512" cy="512" r="340" fill="url(#coreGlow)" />

  <!-- Master Cine Emblem (Scaled centered at 512, 512) -->
  <g transform="translate(512, 512) scale(13.6) translate(-22, -22)">
    <!-- Stylized "C" Arc -->
    <path d="M 33 11 C 28 6.5, 14 6.5, 9.5 13 C 5 19.5, 5 26.5, 9.5 32 C 14 38, 28 38.5, 33 34" 
          fill="none" 
          stroke="url(#cineRed)" 
          stroke-width="5.4" 
          stroke-linecap="round" />

    <!-- Play Triangle Glyph Inside C (optically centered) -->
    <polygon points="18.2,14.5 32.2,22.5 18.2,30.5" 
             fill="url(#playGrad)" />

    <!-- Cyan Accent Sparkle / Star at top tip -->
    <circle cx="33" cy="11" r="2.2" fill="#00eefc" />
  </g>
</svg>
"""

# 2. Android Adaptive Icon Foreground (Transparent background, centered within 72dp safe zone)
FOREGROUND_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <radialGradient id="fgAura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e50914" stop-opacity="0.45" />
      <stop offset="60%" stop-color="#e50914" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#e50914" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="fgCineRed" x1="10%" y1="10%" x2="90%" y2="90%">
      <stop offset="0%" stop-color="#ff473d" />
      <stop offset="35%" stop-color="#e50914" />
      <stop offset="75%" stop-color="#b8050e" />
      <stop offset="100%" stop-color="#730006" />
    </linearGradient>
    <linearGradient id="fgPlayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="70%" stop-color="#fff5f4" />
      <stop offset="100%" stop-color="#ffc2ba" />
    </linearGradient>
    <linearGradient id="fgBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff473d" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#00eefc" stop-opacity="0.4" />
    </linearGradient>
  </defs>

  <!-- Centered within 720x720 (Safe Zone: 180 to 900) -->
  <g transform="translate(540, 540)">
    <!-- Plate Container (560x560) -->
    <rect x="-280" y="-280" width="560" height="560" rx="130" fill="#0c0e17" />
    <circle cx="0" cy="0" r="260" fill="url(#fgAura)" />
    <rect x="-278" y="-278" width="556" height="556" rx="128" fill="none" stroke="url(#fgBorder)" stroke-width="6" />

    <!-- Emblem -->
    <g transform="scale(9.5) translate(-22, -22)">
      <path d="M 33 11 C 28 6.5, 14 6.5, 9.5 13 C 5 19.5, 5 26.5, 9.5 32 C 14 38, 28 38.5, 33 34" 
            fill="none" 
            stroke="url(#fgCineRed)" 
            stroke-width="5.4" 
            stroke-linecap="round" />
      <polygon points="18.2,14.5 32.2,22.5 18.2,30.5" 
               fill="url(#fgPlayGrad)" />
      <circle cx="33" cy="11" r="2.2" fill="#00eefc" />
    </g>
  </g>
</svg>
"""

# 3. Master TV Banner SVG (1280x720, downscaled to 320x180 and 640x360)
TV_BANNER_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="tvBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141724" />
      <stop offset="50%" stop-color="#0a0c14" />
      <stop offset="100%" stop-color="#05060a" />
    </linearGradient>
    <linearGradient id="tvCineRed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff473d" />
      <stop offset="40%" stop-color="#e50914" />
      <stop offset="100%" stop-color="#800005" />
    </linearGradient>
    <linearGradient id="tvPlayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#ffb8b0" />
    </linearGradient>
    <radialGradient id="tvAura" cx="30%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#e50914" stop-opacity="0.35" />
      <stop offset="70%" stop-color="#e50914" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#e50914" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Fullbleed Cinema Background -->
  <rect width="1280" height="720" fill="url(#tvBg)" />
  <rect width="1280" height="720" fill="url(#tvAura)" />

  <!-- Top Cinematic Red Accent Strip -->
  <rect width="1280" height="14" fill="url(#tvCineRed)" />
  <rect y="706" width="1280" height="14" fill="#e50914" opacity="0.35" />

  <!-- Center-Left Emblem Box (260x260) -->
  <g transform="translate(180, 230)">
    <rect width="260" height="260" rx="60" fill="#0d101a" />
    <rect x="3" y="3" width="254" height="254" rx="57" fill="none" stroke="url(#tvCineRed)" stroke-width="6" opacity="0.85" />
    <circle cx="130" cy="130" r="100" fill="#e50914" opacity="0.18" />

    <g transform="translate(130, 130) scale(5.8) translate(-22, -22)">
      <path d="M 33 11 C 28 6.5, 14 6.5, 9.5 13 C 5 19.5, 5 26.5, 9.5 32 C 14 38, 28 38.5, 33 34" 
            fill="none" 
            stroke="url(#tvCineRed)" 
            stroke-width="5.2" 
            stroke-linecap="round" />
      <polygon points="18.2,14.5 32.2,22.5 18.2,30.5" 
               fill="url(#tvPlayGrad)" />
      <circle cx="33" cy="11" r="2.2" fill="#00eefc" />
    </g>
  </g>

  <!-- Typography Brand Header -->
  <g transform="translate(500, 375)">
    <!-- CINE in Pure White Bold -->
    <text font-family="'Montserrat', 'Arial Black', sans-serif" 
          font-weight="900" 
          font-size="124" 
          letter-spacing="2" 
          fill="#ffffff">CINE</text>

    <!-- VIET in Cine Red with proper 380px offset -->
    <text x="365" y="0"
          font-family="'Montserrat', 'Arial Black', sans-serif" 
          font-weight="900" 
          font-size="124" 
          letter-spacing="2" 
          fill="url(#tvCineRed)">VIET</text>

    <!-- Tagline Badge -->
    <g transform="translate(10, 52)">
      <rect width="360" height="42" rx="8" fill="#e50914" opacity="0.18" />
      <rect width="360" height="42" rx="8" fill="none" stroke="#e50914" stroke-width="2" opacity="0.45" />
      <text x="180" y="27" 
            text-anchor="middle"
            font-family="'Montserrat', 'Arial', sans-serif" 
            font-weight="700" 
            font-size="19" 
            letter-spacing="4" 
            fill="#e2e8f0">RẠP PHIM TẠI GIA</text>
    </g>
  </g>

  <!-- Premium Quality 4K Ultra HD Micro Tag Top-Right -->
  <g transform="translate(1030, 48)">
    <rect width="190" height="36" rx="6" fill="#181b28" stroke="#33384c" stroke-width="1.5" />
    <text x="95" y="23" 
          text-anchor="middle"
          font-family="'Montserrat', 'Arial', sans-serif" 
          font-weight="800" 
          font-size="14" 
          letter-spacing="2" 
          fill="#ff473d">4K ULTRA HD</text>
  </g>
</svg>
"""

def render_svg(svg_data, width, height, path):
    renderer = QSvgRenderer(svg_data.encode('utf-8'))
    img = QImage(width, height, QImage.Format_ARGB32)
    img.fill(Qt.transparent)
    painter = QPainter(img)
    painter.setRenderHint(QPainter.Antialiasing, True)
    painter.setRenderHint(QPainter.SmoothPixmapTransform, True)
    renderer.render(painter, QRectF(0, 0, width, height))
    painter.end()
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.save(path, "PNG")
    print(f"Generated: {path} ({width}x{height})")

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # 1. Master files in brain artifact dir for preview
    brain_dir = r"C:\Users\tigon\.gemini\antigravity\brain\59493656-4700-4e3c-b912-1c1bf6a28b90"
    master_1024 = os.path.join(brain_dir, "cineviet_icon_1024.png")
    master_banner = os.path.join(brain_dir, "cineviet_tv_banner.png")
    render_svg(ICON_1024_SVG, 1024, 1024, master_1024)
    render_svg(TV_BANNER_SVG, 1280, 720, master_banner)

    # 2. iOS AppIcon (1024x1024 Universal)
    ios_dest1 = os.path.join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png")
    render_svg(ICON_1024_SVG, 1024, 1024, ios_dest1)
    
    # Also save in mobile_app/config/ios for CI build
    ios_config_dir = os.path.join(root, "mobile_app", "config", "ios", "AppIcon.appiconset")
    render_svg(ICON_1024_SVG, 1024, 1024, os.path.join(ios_config_dir, "AppIcon-512@2x.png"))
    
    # Contents.json for iOS
    contents_json = '''{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}'''
    with open(os.path.join(ios_config_dir, "Contents.json"), "w", encoding="utf-8") as f:
        f.write(contents_json)

    # 3. TV Banner (320x180 in mdpi, 640x360 in xhdpi)
    tv_res_mdpi = os.path.join(root, "android_tv", "app", "src", "main", "res", "drawable-mdpi")
    tv_res_xhdpi = os.path.join(root, "android_tv", "app", "src", "main", "res", "drawable-xhdpi")
    render_svg(TV_BANNER_SVG, 320, 180, os.path.join(tv_res_mdpi, "tv_banner.png"))
    render_svg(TV_BANNER_SVG, 640, 360, os.path.join(tv_res_xhdpi, "tv_banner.png"))
    
    # Also save in mobile_app/config
    render_svg(TV_BANNER_SVG, 320, 180, os.path.join(root, "mobile_app", "config", "tv_banner.png"))

    # 4. Android Mipmaps (both android_tv, mobile_app/config/android, and android/)
    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    target_res_dirs = [
        os.path.join(root, "android_tv", "app", "src", "main", "res"),
        os.path.join(root, "mobile_app", "config", "android", "res"),
        os.path.join(root, "android", "app", "src", "main", "res")
    ]

    for res_dir in target_res_dirs:
        for folder, (size_icon, size_fg) in densities.items():
            folder_path = os.path.join(res_dir, folder)
            # Legacy square/round full icon
            render_svg(ICON_1024_SVG, size_icon, size_icon, os.path.join(folder_path, "ic_launcher.png"))
            render_svg(ICON_1024_SVG, size_icon, size_icon, os.path.join(folder_path, "ic_launcher_round.png"))
            # Adaptive foreground
            render_svg(FOREGROUND_SVG, size_fg, size_fg, os.path.join(folder_path, "ic_launcher_foreground.png"))

    # 5. Save master web assets in mobile_app/assets
    mobile_assets_dir = os.path.join(root, "mobile_app", "assets")
    render_svg(ICON_1024_SVG, 512, 512, os.path.join(mobile_assets_dir, "app_icon.png"))
    render_svg(TV_BANNER_SVG, 640, 360, os.path.join(mobile_assets_dir, "tv_banner.png"))

    print("ALL APP ICONS & BANNERS GENERATED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
