package live.cineviet.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

private val TvDarkColorScheme = darkColorScheme(
    primary = CineVietRed,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    primaryContainer = CineVietRedDark,
    onPrimaryContainer = androidx.compose.ui.graphics.Color.White,
    secondary = CineVietRedLight,
    onSecondary = androidx.compose.ui.graphics.Color.White,
    background = TvBackground,
    onBackground = TvOnSurface,
    surface = TvSurface,
    onSurface = TvOnSurface,
    surfaceVariant = TvSurfaceHigh,
    onSurfaceVariant = TvOnSurfaceVariant
)

@Composable
fun CineVietTvTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = TvDarkColorScheme,
        content = content
    )
}
