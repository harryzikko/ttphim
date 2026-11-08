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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import live.cineviet.tv.data.models.RankingMovie
import live.cineviet.tv.ui.theme.CineVietRed
import live.cineviet.tv.ui.theme.TvFocusBorder
import live.cineviet.tv.ui.theme.TvOnSurface
import live.cineviet.tv.ui.theme.TvOnSurfaceVariant
import live.cineviet.tv.ui.theme.TvSurface

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
        targetValue = if (isFocused) 1.10f else 1.0f,
        animationSpec = tween(180),
        label = "rankScale"
    )

    Column(
        modifier = modifier
            .width(160.dp)
            .scale(scale)
            .focusable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(4.dp)
    ) {
        // Poster Box with Rank Badge Overlay
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(230.dp)
                .background(
                    color = TvSurface,
                    shape = RoundedCornerShape(10.dp)
                )
                .border(
                    width = if (isFocused) 3.dp else 1.dp,
                    color = if (isFocused) CineVietRed else Color.White.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(10.dp)
                )
                .clip(RoundedCornerShape(10.dp))
        ) {
            // Poster Image
            AsyncImage(
                model = movie.displayPoster,
                contentDescription = movie.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            // Bottom Gradient Scrim
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(60.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.88f))
                        )
                    )
            )

            // Top-Left Rank Medal Badge (Gold / Silver / Bronze)
            val badgeBrush = when (rank) {
                1 -> Brush.horizontalGradient(listOf(Color(0xFFFFDF00), Color(0xFFD97706)))
                2 -> Brush.horizontalGradient(listOf(Color(0xFFF1F5F9), Color(0xFF64748B)))
                3 -> Brush.horizontalGradient(listOf(Color(0xFFFED7AA), Color(0xFFC2410C)))
                else -> Brush.horizontalGradient(listOf(Color(0xFF1E293B), Color(0xFF0F172A)))
            }
            val badgeBorderColor = when (rank) {
                1 -> Color(0xFFFFE082)
                2 -> Color.White.copy(alpha = 0.7f)
                3 -> Color(0xFFFFCC80)
                else -> Color.White.copy(alpha = 0.2f)
            }
            val textColor = if (rank <= 2) Color.Black else Color.White

            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .background(badgeBrush, RoundedCornerShape(6.dp))
                    .border(1.dp, badgeBorderColor, RoundedCornerShape(6.dp))
                    .padding(horizontal = 7.dp, vertical = 3.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (rank == 1) {
                        Icon(
                            imageVector = Icons.Default.EmojiEvents,
                            contentDescription = "Top 1",
                            tint = Color.Black,
                            modifier = Modifier.size(13.dp)
                        )
                        Spacer(modifier = Modifier.width(3.dp))
                    }
                    Text(
                        text = "#$rank",
                        color = textColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // Top-Right Quality / Episode Badge
            val topBadgeText = movie.episodeCurrent?.takeIf { it.isNotBlank() } ?: movie.quality
            if (!topBadgeText.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .background(CineVietRed.copy(alpha = 0.9f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = topBadgeText,
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Bottom-Right Views Overlay
            val viewsText = movie.displayViews
            if (viewsText.isNotBlank()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(6.dp)
                        .background(Color.Black.copy(alpha = 0.75f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 5.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "$viewsText lượt xem",
                        color = Color(0xFFFFB800),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        // Movie Title
        Text(
            text = movie.name,
            color = if (isFocused) Color.White else TvOnSurface,
            fontSize = 13.sp,
            fontWeight = if (isFocused) FontWeight.Bold else FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        // Subtitle / Year
        val sub = listOfNotNull(movie.originName?.takeIf { it.isNotBlank() }, movie.year?.toString()).joinToString(" · ")
        if (sub.isNotBlank()) {
            Text(
                text = sub,
                color = TvOnSurfaceVariant,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
