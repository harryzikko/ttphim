package live.cineviet.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
        targetValue = if (isFocused) 1.08f else 1.0f,
        label = "rankScale"
    )

    Row(
        modifier = modifier
            .width(220.dp)
            .scale(scale)
            .focusable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Big Rank Number
        Box(
            modifier = Modifier.width(44.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "$rank",
                color = when (rank) {
                    1 -> CineVietRed
                    2 -> Color(0xFFFFB800)
                    3 -> Color(0xFF00ADB5)
                    else -> TvOnSurfaceVariant.copy(alpha = 0.5f)
                },
                fontSize = 44.sp,
                fontWeight = FontWeight.Black
            )
        }

        Spacer(modifier = Modifier.width(4.dp))

        // Poster & Info
        Column(modifier = Modifier.weight(1f)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(TvSurface)
                    .then(
                        if (isFocused) {
                            Modifier
                                .border(2.5.dp, TvFocusBorder, RoundedCornerShape(8.dp))
                                .shadow(14.dp, RoundedCornerShape(8.dp), spotColor = CineVietRed)
                        } else {
                            Modifier.border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
                        }
                    )
            ) {
                AsyncImage(
                    model = movie.displayPoster,
                    contentDescription = movie.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                val viewsText = movie.displayViews
                if (viewsText.isNotBlank()) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp)
                            .background(Color.Black.copy(alpha = 0.75f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "$viewsText lượt xem",
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = movie.name,
                color = if (isFocused) Color.White else TvOnSurface,
                fontSize = 12.sp,
                fontWeight = if (isFocused) FontWeight.Bold else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
