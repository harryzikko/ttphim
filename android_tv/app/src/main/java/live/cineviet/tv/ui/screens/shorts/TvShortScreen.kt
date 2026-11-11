package live.cineviet.tv.ui.screens.shorts

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
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
import coil.compose.SubcomposeAsyncImage
import live.cineviet.tv.data.models.ShortDramaItem
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*

@Composable
fun TvShortScreen(
    onShortClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    var selectedGenre by remember { mutableStateOf("all") }
    var page by remember { mutableStateOf(1) }
    var hasMore by remember { mutableStateOf(false) }
    var items by remember { mutableStateOf<List<ShortDramaItem>>(emptyList()) }
    var genres by remember {
        mutableStateOf(
            listOf("Tổng tài", "Lồng tiếng", "Cổ đại", "Ngôn tình", "Xuyên không", "Trọng sinh", "Báo thù", "Hài hước")
        )
    }
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(selectedGenre, page, reloadKey) {
        isLoading = true
        errorMsg = null
        val res = repository.getShortCatalog(page = page, genre = selectedGenre, limit = 25)
        res.onSuccess { data ->
            items = data.items
            if (data.genres.isNotEmpty()) genres = data.genres
            hasMore = data.pagination.hasMore
            isLoading = false
        }.onFailure { err ->
            errorMsg = err.message ?: "Không tải được Short Phim"
            isLoading = false
        }
    }

    val chipList = remember(genres) { listOf("all") + genres.take(15) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
            .padding(horizontal = 32.dp, vertical = 22.dp)
    ) {
        // Header + Page Navigation
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Bolt,
                        contentDescription = null,
                        tint = TvGold,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Short Phim (Phim Ngắn Dọc 9:16)",
                        color = Color.White,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Black
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "1080p Vietsub & Lồng tiếng · Chọn Tập lẻ hoặc Bản Full gộp tất cả tập",
                    color = TvOnSurfaceVariant,
                    fontSize = 13.sp
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                TvPillButton(
                    label = "← Trang trước",
                    enabled = page > 1,
                    isActive = false,
                    onClick = { if (page > 1) page -= 1 }
                )
                Text(
                    text = "Trang $page",
                    color = TvOnSurface,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                TvPillButton(
                    label = "Trang sau →",
                    enabled = hasMore,
                    isActive = false,
                    onClick = { if (hasMore) page += 1 }
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Genre Chips
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 4.dp)
        ) {
            items(chipList) { g ->
                val isSelected = selectedGenre == g
                TvPillButton(
                    label = if (g == "all") "Tất cả" else g,
                    enabled = true,
                    isActive = isSelected,
                    onClick = {
                        selectedGenre = g
                        page = 1
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when {
            isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    TvLoadingSpinner()
                }
            }
            errorMsg != null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = errorMsg!!, color = CineVietRedLight, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        TvPillButton(
                            label = "Thử lại",
                            enabled = true,
                            isActive = true,
                            onClick = { reloadKey++ }
                        )
                    }
                }
            }
            items.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = "Chưa có Short Phim trong thể loại này.", color = TvOnSurfaceVariant, fontSize = 16.sp)
                }
            }
            else -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(5),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                    horizontalArrangement = Arrangement.spacedBy(18.dp),
                    contentPadding = PaddingValues(bottom = 28.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(items, key = { it.slug }) { item ->
                        TvShortCard(
                            item = item,
                            onClick = { onShortClick(item.slug) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TvPillButton(
    label: String,
    enabled: Boolean,
    isActive: Boolean,
    onClick: () -> Unit
) {
    val source = remember { MutableInteractionSource() }
    val isFocused by source.collectIsFocusedAsState()

    val bg = when {
        !enabled -> TvSurface.copy(alpha = 0.45f)
        isFocused -> CineVietRed
        isActive -> CineVietRed.copy(alpha = 0.85f)
        else -> TvSurfaceHigh
    }
    val border = if (isFocused) Color.White else if (isActive) CineVietRedLight else TvSurfaceHighest

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .border(1.5.dp, border, RoundedCornerShape(20.dp))
            .focusable(enabled = enabled, interactionSource = source)
            .clickable(enabled = enabled, interactionSource = source, indication = null) { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = if (enabled) Color.White else TvOnSurfaceMuted,
            fontSize = 13.sp,
            fontWeight = if (isActive || isFocused) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1
        )
    }
}

@Composable
private fun TvShortCard(
    item: ShortDramaItem,
    onClick: () -> Unit
) {
    val source = remember { MutableInteractionSource() }
    val isFocused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.07f else 1.0f,
        animationSpec = tween(150),
        label = "shortCardScale"
    )
    var useFallback by remember(item.slug) { mutableStateOf(false) }
    val modelUrl = remember(item.posterUrl, item.posterFallbackUrl, useFallback) {
        if (!useFallback && item.posterUrl.isNotBlank()) item.posterUrl else item.posterFallbackUrl
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale)
            .focusable(interactionSource = source)
            .clickable(interactionSource = source, indication = null) { onClick() }
            .padding(4.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(10.dp))
                .background(TvSurfaceContainer)
                .border(
                    width = if (isFocused) 2.5.dp else 1.dp,
                    color = if (isFocused) CineVietRed else Color.White.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(10.dp)
                )
        ) {
            if (modelUrl.isNotBlank()) {
                SubcomposeAsyncImage(
                    model = modelUrl,
                    contentDescription = item.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    onError = {
                        if (!useFallback && item.posterFallbackUrl.isNotBlank() && modelUrl != item.posterFallbackUrl) {
                            useFallback = true
                        }
                    },
                    error = {
                        ShortFallbackCover(title = item.name)
                    }
                )
            } else {
                ShortFallbackCover(title = item.name)
            }

            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .background(CineVietRed.copy(alpha = 0.95f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = if (item.episodeCountHint != null) "SHORT · ${item.episodeCountHint} tập" else "SHORT",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .align(Alignment.BottomCenter)
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))))
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = item.name,
            color = if (isFocused) Color.White else TvOnSurface,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun ShortFallbackCover(title: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(TvSurfaceHigh)
            .padding(10.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.Bolt, contentDescription = null, tint = TvGold, modifier = Modifier.size(30.dp))
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = title,
                color = TvOnSurface,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
