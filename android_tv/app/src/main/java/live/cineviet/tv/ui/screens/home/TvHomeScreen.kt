package live.cineviet.tv.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
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
import kotlinx.coroutines.launch
import live.cineviet.tv.data.models.HomeData
import live.cineviet.tv.data.models.MovieItem
import live.cineviet.tv.data.models.SpotlightMovie
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.components.TvMovieCard
import live.cineviet.tv.ui.components.TvRankingCard
import live.cineviet.tv.ui.theme.*

@Composable
fun TvHomeScreen(
    categoryFilter: String?,
    onMovieClick: (String) -> Unit,
    onPlayClick: (String, String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()

    var homeData by remember { mutableStateOf<HomeData?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun loadData() {
        isLoading = true
        errorMessage = null
        scope.launch {
            val result = repository.getHome()
            result.onSuccess {
                homeData = it
                isLoading = false
            }.onFailure {
                errorMessage = it.message ?: "Không thể kết nối đến máy chủ CineViet"
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadData()
    }

    if (isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                TvLoadingSpinner(color = CineVietRed)
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Đang tải kho phim CineViet...",
                    color = TvOnSurfaceVariant,
                    fontSize = 14.sp
                )
            }
        }
        return
    }

    if (errorMessage != null || homeData == null) {
        val retrySource = remember { MutableInteractionSource() }
        val isRetryFocused by retrySource.collectIsFocusedAsState()

        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = errorMessage ?: "Lỗi tải dữ liệu",
                    color = Color(0xFFFF5252),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isRetryFocused) CineVietRed else TvSurfaceHigh)
                        .border(2.dp, if (isRetryFocused) Color.White else Color.Transparent, RoundedCornerShape(8.dp))
                        .focusable(interactionSource = retrySource)
                        .clickable(interactionSource = retrySource, indication = null) { loadData() }
                        .padding(horizontal = 24.dp, vertical = 12.dp)
                ) {
                    Text(
                        text = "Thử lại",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
        return
    }

    val data = homeData!!

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp)
    ) {
        // 1. Featured Spotlight Carousel (Hero Banner - All 7 items)
        if (categoryFilter == null && data.spotlights.isNotEmpty()) {
            item {
                TvSpotlightHero(
                    spotlights = data.spotlights,
                    onPlayClick = { slug, ep -> onPlayClick(slug, ep) },
                    onDetailClick = { slug -> onMovieClick(slug) }
                )
            }
        }

        // 2. BẢNG XẾP HẠNG / THỊNH HÀNH HÔM NAY (Real rankings 1..10)
        if (categoryFilter == null && data.rankings.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "🔥 Bảng Xếp Hạng · Thịnh Hành Hôm Nay",
                    subtitle = "Top 10 phim được xem nhiều nhất trên hệ thống CineViet"
                ) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        contentPadding = PaddingValues(horizontal = 32.dp)
                    ) {
                        itemsIndexed(data.rankings) { index, movie ->
                            TvRankingCard(
                                movie = movie,
                                rank = index + 1,
                                onClick = { onMovieClick(movie.slug) }
                            )
                        }
                    }
                }
            }
        }

        // 3. Category Swimlanes
        if (categoryFilter == null || categoryFilter == "latest") {
            if (data.latest.isNotEmpty()) {
                item {
                    TvMovieSection(title = "Phim Mới Cập Nhật") {
                        TvMovieRow(movies = data.latest, onMovieClick = onMovieClick)
                    }
                }
            }
        }

        if (categoryFilter == null || categoryFilter == "cinema") {
            if (data.cinema.isNotEmpty()) {
                item {
                    TvMovieSection(title = "Phim Chiếu Rạp Đặc Sắc") {
                        TvMovieRow(movies = data.cinema, onMovieClick = onMovieClick)
                    }
                }
            }
        }

        if (categoryFilter == null || categoryFilter == "series") {
            if (data.series.isNotEmpty()) {
                item {
                    TvMovieSection(title = "Phim Bộ Đang Hot") {
                        TvMovieRow(movies = data.series, onMovieClick = onMovieClick)
                    }
                }
            }
        }

        if (categoryFilter == null || categoryFilter == "singles") {
            if (data.singles.isNotEmpty()) {
                item {
                    TvMovieSection(title = "Phim Lẻ Chọn Lọc") {
                        TvMovieRow(movies = data.singles, onMovieClick = onMovieClick)
                    }
                }
            }
        }

        if (categoryFilter == null || categoryFilter == "anime") {
            if (data.anime.isNotEmpty()) {
                item {
                    TvMovieSection(title = "Hoạt Hình & Anime") {
                        TvMovieRow(movies = data.anime, onMovieClick = onMovieClick)
                    }
                }
            }
        }

        if (categoryFilter == null && data.tvshows.isNotEmpty()) {
            item {
                TvMovieSection(title = "Chương Trình TV Shows") {
                    TvMovieRow(movies = data.tvshows, onMovieClick = onMovieClick)
                }
            }
        }
    }
}

@Composable
fun TvSpotlightHero(
    spotlights: List<SpotlightMovie>,
    onPlayClick: (String, String?) -> Unit,
    onDetailClick: (String) -> Unit
) {
    var currentIndex by remember { mutableStateOf(0) }
    val currentMovie = spotlights.getOrNull(currentIndex) ?: return

    val playSource = remember { MutableInteractionSource() }
    val isPlayFocused by playSource.collectIsFocusedAsState()

    val detailSource = remember { MutableInteractionSource() }
    val isDetailFocused by detailSource.collectIsFocusedAsState()

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(420.dp)
    ) {
        // Backdrop Image with Gradient Vignette
        AsyncImage(
            model = currentMovie.displayBackdrop,
            contentDescription = currentMovie.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        // Gradient Left to Right & Bottom to Top
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            TvBackground,
                            TvBackground.copy(alpha = 0.92f),
                            TvBackground.copy(alpha = 0.65f),
                            Color.Transparent
                        ),
                        startX = 0f,
                        endX = 1400f
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            TvBackground.copy(alpha = 0.8f),
                            TvBackground
                        ),
                        startY = 200f
                    )
                )
        )

        // Movie Info Content
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 36.dp, bottom = 28.dp)
                .width(540.dp)
        ) {
            // Badges Row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .background(CineVietRed, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "NỔI BẬT",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                }

                currentMovie.quality?.let { q ->
                    Box(
                        modifier = Modifier
                            .background(TvSurfaceHigh, RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = q,
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                currentMovie.year?.let { y ->
                    Text(
                        text = y.toString(),
                        color = TvOnSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Title
            Text(
                text = currentMovie.name,
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            // Original Title
            if (!currentMovie.originName.isNullOrBlank()) {
                Text(
                    text = currentMovie.originName,
                    color = TvOnSurfaceVariant,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Description
            if (!currentMovie.content.isNullOrBlank()) {
                Text(
                    text = currentMovie.content,
                    color = TvOnSurface.copy(alpha = 0.85f),
                    fontSize = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 18.sp
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            // ACTION BUTTONS: Xem phim & Chi tiết
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // "Xem phim" Button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isPlayFocused) Color.White else CineVietRed)
                        .border(2.dp, if (isPlayFocused) CineVietRed else Color.Transparent, RoundedCornerShape(8.dp))
                        .shadow(if (isPlayFocused) 16.dp else 4.dp, RoundedCornerShape(8.dp), spotColor = CineVietRed)
                        .focusable(interactionSource = playSource)
                        .clickable(interactionSource = playSource, indication = null) {
                            onPlayClick(currentMovie.slug, currentMovie.firstEpisodeSlug)
                        }
                        .padding(horizontal = 22.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Xem phim",
                            tint = if (isPlayFocused) CineVietRed else Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = currentMovie.ctaLabel ?: "Xem phim",
                            color = if (isPlayFocused) CineVietRed else Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                // "Chi tiết" Button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isDetailFocused) Color.White else TvSurfaceHigh.copy(alpha = 0.85f))
                        .border(2.dp, if (isDetailFocused) CineVietRed else Color.White.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                        .focusable(interactionSource = detailSource)
                        .clickable(interactionSource = detailSource, indication = null) {
                            onDetailClick(currentMovie.slug)
                        }
                        .padding(horizontal = 20.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = "Chi tiết",
                            tint = if (isDetailFocused) Color.Black else Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Chi tiết",
                            color = if (isDetailFocused) Color.Black else Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        // Spotlight Carousel Indicators / Mini Thumbnails on Right
        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 36.dp, bottom = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            spotlights.forEachIndexed { index, movie ->
                val isSelected = index == currentIndex
                val thumbSource = remember { MutableInteractionSource() }
                val isThumbFocused by thumbSource.collectIsFocusedAsState()

                Box(
                    modifier = Modifier
                        .size(if (isSelected) 36.dp else 28.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isSelected) CineVietRed else TvSurfaceHigh)
                        .border(
                            width = if (isThumbFocused || isSelected) 2.dp else 0.dp,
                            color = if (isThumbFocused) Color.White else if (isSelected) CineVietRed else Color.Transparent,
                            shape = RoundedCornerShape(6.dp)
                        )
                        .focusable(interactionSource = thumbSource)
                        .clickable(interactionSource = thumbSource, indication = null) {
                            currentIndex = index
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "${index + 1}",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                    )
                }
            }
        }
    }
}

@Composable
fun TvMovieSection(
    title: String,
    subtitle: String? = null,
    content: @Composable () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(horizontal = 32.dp, vertical = 6.dp)) {
            Text(
                text = title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    color = TvOnSurfaceVariant,
                    fontSize = 12.sp
                )
            }
        }
        Spacer(modifier = Modifier.height(10.dp))
        content()
    }
}

@Composable
fun TvMovieRow(
    movies: List<MovieItem>,
    onMovieClick: (String) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = PaddingValues(horizontal = 32.dp)
    ) {
        items(movies) { movie ->
            TvMovieCard(
                movie = movie,
                onClick = { onMovieClick(movie.slug) }
            )
        }
    }
}
