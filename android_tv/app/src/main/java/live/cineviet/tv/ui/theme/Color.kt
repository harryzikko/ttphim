package live.cineviet.tv.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// CineViet Brand Palette (Unified across Web, Mobile Flutter & Android TV)
val CineVietRed = Color(0xFFE50914)
val CineVietRedLight = Color(0xFFFF334B)
val CineVietRedDark = Color(0xFF990008)

// Obsidian Cinema Dark Surfaces
val TvBackground = Color(0xFF0B0D13)
val TvSurface = Color(0xFF131722)
val TvSurfaceLow = Color(0xFF161A26)
val TvSurfaceContainer = Color(0xFF1B2030)
val TvSurfaceHigh = Color(0xFF242A3E)
val TvSurfaceHighest = Color(0xFF2B3248)

// Text Colors
val TvOnSurface = Color(0xFFF8FAFC)
val TvOnSurfaceVariant = Color(0xFF94A3B8)
val TvOnSurfaceMuted = Color(0xFF64748B)

// Accents
val TvGold = Color(0xFFFFB800)
val CineVietGold = TvGold
val GoldRating = Color(0xFFFFB800)
val EmeraldGreen = Color(0xFF10B981)
val TvSurfaceContainerHighest = TvSurfaceHighest
val TvFocusBorder = CineVietRed
val TvFocusGlow = Color(0x66E50914)

// Brand Gradients
val PrimaryRedGradient = Brush.horizontalGradient(listOf(CineVietRed, CineVietRedLight))
val CardSurfaceGradient = Brush.verticalGradient(listOf(Color(0xFF1B2030), Color(0xFF131722)))
val ScrimDarkGradient = Brush.verticalGradient(listOf(Color.Transparent, Color(0x990B0D13), Color(0xFF0B0D13)))
