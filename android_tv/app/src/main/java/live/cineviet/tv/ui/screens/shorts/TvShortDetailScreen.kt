package live.cineviet.tv.ui.screens.shorts

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import coil.compose.SubcomposeAsyncImage
import live.cineviet.tv.data.models.ShortDetailData
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*

@Composable
fun TvShortDetailScreen(
    slug: String,
    onBack: () -> Unit,
    onPlayShort: (slug: String, episode: Int, preferFull: Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    var detail by remember { mutableStateOf<ShortDetailData?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var preferFull by remember { mutableStateOf(false) }
    var useFallback by remember(slug) { mutableStateOf(false) }
    val playBtnFocus = remember { FocusRequester() }

    LaunchedEffect(slug) {
        isLoading = true
        errorMsg = null
        val res = repository.getShortDetail(slug)
        res.onSuccess {
            detail = it
            isLoading = false
        }.onFailure { err ->
            errorMsg = err.message ?: "Không tải được chi tiết Short Phim"
            isLoading = false
        }
    }

    LaunchedEffect(isLoading) {
        if (!isLoading && detail != null) {
            try {
                playBtnFocus.requestFocus()
            } catch (_: Exception) {}
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
            .padding(32.dp)
    ) {
        when {
            isLoading -> TvLoadingSpinner(modifier = Modifier.align(Alignment.Center))
            errorMsg != null || detail == null -> {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = errorMsg ?: "Không tìm thấy phim", color = CineVietRedLight, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(14.dp))
                    ShortDetailActionButton(label = "← Quay lại", isPrimary = true, onClick = onBack)
                }
            }
            else -> {
                val data = detail!!
                val item = data.item
                val posterUrl = if (!useFallback && item.posterUrl.isNotBlank()) item.posterUrl else item.posterFallbackUrl

                Column(modifier = Modifier.fillMaxSize()) {
                    ShortDetailActionButton(label = "← Quay lại", isPrimary = false, onClick = onBack)

                    Spacer(modifier = Modifier.height(18.dp))

                    Row(modifier = Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .width(190.dp)
                                .aspectRatio(2f / 3f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(TvSurfaceContainer)
                                .border(1.5.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
                        ) {
                            if (posterUrl.isNotBlank()) {
                                SubcomposeAsyncImage(
                                    model = posterUrl,
                                    contentDescription = item.name,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize(),
                                    onError = {
                                        if (!useFallback && item.posterFallbackUrl.isNotBlank()) {
                                            useFallback = true
                                        }
                                    }
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(28.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                BadgeChip(text = "SHORT PHIM", bg = CineVietRed)
                                BadgeChip(text = "1080p", bg = TvSurfaceHigh)
                                BadgeChip(text = "${data.episodes.size} tập", bg = TvSurfaceHigh)
                            }
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = item.name.ifBlank { slug },
                                color = Color.White,
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Black,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (item.description.isNotBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = item.description,
                                    color = TvOnSurfaceVariant,
                                    fontSize = 15.sp,
                                    lineHeight = 22.sp,
                                    maxLines = 4,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                ShortDetailActionButton(
                                    label = "▶ Xem Tập 1",
                                    isPrimary = true,
                                    onClick = { onPlayShort(slug, 1, preferFull) },
                                    modifier = Modifier.focusRequester(playBtnFocus)
                                )
                                ShortDetailActionButton(
                                    label = "⚡ Phát Bản Full",
                                    isPrimary = false,
                                    onClick = { onPlayShort(slug, 1, true) }
                                )
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                ShortDetailActionButton(
                                    label = if (!preferFull) "✓ Tập lẻ (Tự chuyển tập)" else "Tập lẻ (Tự chuyển tập)",
                                    isPrimary = !preferFull,
                                    onClick = { preferFull = false }
                                )
                                ShortDetailActionButton(
                                    label = if (preferFull) "✓ Bản Full (Gộp tất cả tập)" else "Bản Full (Gộp tất cả tập)",
                                    isPrimary = preferFull,
                                    onClick = { preferFull = true }
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(22.dp))

                    Text(
                        text = "Danh Sách Tập (${data.episodes.size})",
                        color = Color.White,
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    LazyVerticalGrid(
                        columns = GridCells.Fixed(8),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        items(data.episodes, key = { it.episode }) { ep ->
                            ShortDetailActionButton(
                                label = "Tập ${ep.episode}",
                                isPrimary = false,
                                onClick = { onPlayShort(slug, ep.episode, preferFull) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BadgeChip(text: String, bg: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(text = text, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ShortDetailActionButton(
    label: String,
    isPrimary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val bg = when {
        focused -> CineVietRed
        isPrimary -> CineVietRed.copy(alpha = 0.85f)
        else -> TvSurfaceContainer
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .border(1.5.dp, if (focused) Color.White else TvSurfaceHighest, RoundedCornerShape(10.dp))
            .focusable(interactionSource = source)
            .clickable(interactionSource = source, indication = null) { onClick() }
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}
