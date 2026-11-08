package live.cineviet.tv.ui.screens.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import kotlinx.coroutines.delay
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
                errorMessage = it.message ?: "Không thể tải dữ liệu CineViet"
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

    // DEDICATED CATEGORY SCREEN FOR "PHIM BỘ" OR "PHIM LẺ" (Full 5-column Grid)
    if (categoryFilter != null) {
        val (title, subtitle, moviesList) = when (categoryFilter) {
            "series" -> Triple(
                "🎬 Kho Phim Bộ Đang Hot · Tuyển Chọn",
                "Tuyển tập ${data.series.size} bộ phim truyền hình chất lượng cao cập nhật liên tục",
                data.series
            )
            "singles" -> Triple(
                "🍿 Kho Phim Lẻ Đặc Sắc · Chuẩn Điện Ảnh",
                "Tuyển tập ${data.singles.size} siêu phẩm điện ảnh đặc sắc chất lượng cao",
                data.singles
            )
            else -> Triple("Kho Phim CineViet", "", data.latest)
        }

        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 32.dp, top = 28.dp, end = 32.dp, bottom = 8.dp)
                ) {
                    Text(
                        text = title,
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black
                    )
                    if (subtitle.isNotBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = subtitle,
                            color = TvOnSurfaceVariant,
                            fontSize = 13.sp
                        )
                    }
                }
            }

            // 5-Column Grid Layout (Chunked by 5)
            val chunks = moviesList.chunked(5)
            items(chunks) { rowMovies ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 32.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    rowMovies.forEach { movie ->
                        TvMovieCard(
                            movie = movie,
                            onClick = { onMovieClick(movie.slug) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    // Fill remaining empty columns if last row has fewer items
                    repeat(5 - rowMovies.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        return
    }

    // MAIN EXPLORE / HOME FEED SCREEN
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp)
    ) {
        // 1. Featured Spotlight Carousel (Hero Banner - All 7 items with Mini Thumbnails)
        if (data.spotlights.isNotEmpty()) {
            item {
                TvSpotlightHero(
                    spotlights = data.spotlights,
                    onPlayClick = { slug, ep -> onPlayClick(slug, ep) },
                    onDetailClick = { slug -> onMovieClick(slug) }
                )
            }
        }

        // 2. BẢNG XẾP HẠNG / THỊNH HÀNH HÔM NAY (Real rankings 1..10 in Netflix-style poster cards)
        if (data.rankings.isNotEmpty()) {
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
        if (data.latest.isNotEmpty()) {
            item {
                TvMovieSection(title = "Phim Mới Cập Nhật") {
                    TvMovieRow(movies = data.latest, onMovieClick = onMovieClick)
                }
            }
        }

        if (data.cinema.isNotEmpty()) {
            item {
                TvMovieSection(title = "Phim Chiếu Rạp Đặc Sắc") {
                    TvMovieRow(movies = data.cinema, onMovieClick = onMovieClick)
                }
            }
        }

        if (data.series.isNotEmpty()) {
            item {
                TvMovieSection(title = "Phim Bộ Đang Hot") {
                    TvMovieRow(movies = data.series, onMovieClick = onMovieClick)
                }
            }
        }

        if (data.singles.isNotEmpty()) {
            item {
                TvMovieSection(title = "Phim Lẻ Chọn Lọc") {
                    TvMovieRow(movies = data.singles, onMovieClick = onMovieClick)
                }
            }
        }

        if (data.anime.isNotEmpty()) {
            item {
                TvMovieSection(title = "Hoạt Hình & Anime") {
                    TvMovieRow(movies = data.anime, onMovieClick = onMovieClick)
                }
            }
        }

        if (data.tvshows.isNotEmpty()) {
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

    // Auto-advance spotlight carousel every 8 seconds if neither button is focused
    LaunchedEffect(isPlayFocused, isDetailFocused, spotlights.size) {
        if (!isPlayFocused && !isDetailFocused && spotlights.size > 1) {
            while (true) {
                delay(8000)
                currentIndex = (currentIndex + 1) % spotlights.size
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(430.dp)
    ) {
        // Backdrop Image with fallback to Poster
        AsyncImage(
            model = currentMovie.displayBackdrop.ifBlank { currentMovie.displayPoster },
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
                            TvBackground.copy(alpha = 0.94f),
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
                .width(560.dp)
        ) {
            // Badges Row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .background(CineVietRed, RoundedCornerShape(4.dp))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "NỔI BẬT #${currentIndex + 1}",
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

        // Spotlight Carousel REAL Mini Poster Thumbnails on Bottom-Right
        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 36.dp, bottom = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            spotlights.forEachIndexed { index, movie ->
                val isSelected = index == currentIndex
                val thumbSource = remember { MutableInteractionSource() }
                val isThumbFocused by thumbSource.collectIsFocusedAsState()

                Box(
                    modifier = Modifier
                        .width(if (isSelected) 48.dp else 38.dp)
                        .height(if (isSelected) 68.dp else 54.dp)
                        .background(TvSurface, RoundedCornerShape(6.dp))
                        .border(
                            width = if (isThumbFocused || isSelected) 2.5.dp else 1.dp,
                            color = if (isThumbFocused) Color.White else if (isSelected) CineVietRed else Color.White.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(6.dp)
                        )
                        .clip(RoundedCornerShape(6.dp))
                        .focusable(interactionSource = thumbSource)
                        .clickable(interactionSource = thumbSource, indication = null) {
                            currentIndex = index
                        }
                ) {
                    AsyncImage(
                        model = movie.displayPoster,
                        contentDescription = movie.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
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
    onMovieClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
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
