package live.cineviet.tv.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import live.cineviet.tv.ui.theme.CineVietRed

@Composable
fun TvLoadingSpinner(
    modifier: Modifier = Modifier,
    color: Color = CineVietRed,
    size: Dp = 48.dp,
    strokeWidth: Dp = 4.dp
) {
    val transition = rememberInfiniteTransition(label = "spinnerTransition")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "spinnerAngle"
    )

    Canvas(modifier = modifier.size(size)) {
        val stroke = strokeWidth.toPx()
        // Background faint track
        drawCircle(
            color = color.copy(alpha = 0.2f),
            style = Stroke(width = stroke)
        )
        // Rotating arc
        drawArc(
            color = color,
            startAngle = angle,
            sweepAngle = 100f,
            useCenter = false,
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
    }
}
