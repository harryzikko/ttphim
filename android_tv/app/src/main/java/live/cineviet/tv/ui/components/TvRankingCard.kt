package live.cineviet.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import live.cineviet.tv.data.models.RankingMovie
import live.cineviet.tv.ui.theme.*

@Composable
fun TvRankingCard(
    movie: RankingMovie,
    rank: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.08f else 1.0f,
        animationSpec = tween(160),
        label = "rankScale"
    )

    Column(
        modifier = modifier
            .width(165.dp)
            .scale(scale)
            .focusable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(4.dp)
    ) {
        // 2:3 Vertical Poster with Big Stylized Rank Overlay
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(235.dp)
                .background(
                    color = TvSurfaceContainer,
                    shape = RoundedCornerShape(12.dp)
                )
                .border(
                    width = if (isFocused) 2.5.dp else 1.dp,
                    color = if (isFocused) CineVietRed else Color.White.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clip(RoundedCornerShape(12.dp))
        ) {
            // Poster Image
            AsyncImage(
                model = movie.displayPoster,
                contentDescription = movie.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            // Deep Gradient Scrim from bottom for rank number visibility
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.65f),
                                Color.Black.copy(alpha = 0.95f)
                            )
                        )
                    )
            )

            // Top-Right Metric Badge (Views or Quality)
            val metricText = movie.displayViews.takeIf { it.isNotBlank() && it != "0 lượt xem" }
                ?: movie.episodeCurrent?.takeIf { it.isNotBlank() }
                ?: movie.quality
            if (!metricText.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .background(TvBackground.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = metricText,
                        color = if (rank <= 3) TvGold else TvOnSurfaceVariant,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // MASSIVE Stylized Rank Number Overlaid on bottom left (Netflix / Nocturne Cinema Style)
            val rankNumberColor = when (rank) {
                1 -> Color(0xFFFFD700) // Gold
                2 -> Color(0xFFE2E8F0) // Silver
                3 -> Color(0xFFFFB366) // Bronze
                else -> Color.White.copy(alpha = 0.90f)
            }

            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 8.dp, bottom = 4.dp)
            ) {
                // Drop shadow effect with offset
                Text(
                    text = rank.toString(),
                    color = Color.Black.copy(alpha = 0.85f),
                    fontSize = 58.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = 58.sp,
                    modifier = Modifier.offset(x = 2.dp, y = 2.dp)
                )
                Text(
                    text = rank.toString(),
                    color = rankNumberColor,
                    fontSize = 58.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = 58.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Title
        Text(
            text = movie.name,
            color = if (isFocused) CineVietRedLight else Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        // Subtitle (Original name or quality)
        val subtitle = movie.originName ?: movie.quality ?: ""
        if (subtitle.isNotBlank()) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtitle,
                color = TvOnSurfaceVariant,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
