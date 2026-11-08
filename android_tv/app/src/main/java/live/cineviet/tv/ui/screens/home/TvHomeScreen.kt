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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.cineviet.tv.data.local.TvSessionManager
import live.cineviet.tv.data.models.*
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.components.TvMovieCard
import live.cineviet.tv.ui.components.TvRankingCard
import live.cineviet.tv.ui.theme.*

@Composable
fun TvHomeScreen(
    categoryFilter: String?,
    sessionManager: TvSessionManager? = null,
    onMovieClick: (String) -> Unit,
    onPlayClick: (String, String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()

    var homeData by remember { mutableStateOf<HomeData?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // User Continue Watching list
    var continueWatchingList by remember { mutableStateOf<List<WatchHistoryItem>>(emptyList()) }

    // Full 40-movie catalog for Phim bộ & Phim lẻ tabs
    var catalogMovies by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isCatalogLoading by remember { mutableStateOf(false) }

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

    // Load continue watching when user is logged in
    LaunchedEffect(sessionManager?.isLoggedIn()) {
        if (sessionManager?.isLoggedIn() == true) {
            val libResult = repository.getUserLibrary()
            libResult.onSuccess { lib ->
                continueWatchingList = lib.continueWatching
            }
        }
    }

    // Fetch full 40-item catalog when switching to Phim bộ or Phim lẻ tab
    LaunchedEffect(categoryFilter) {
        if (categoryFilter != null) {
            isCatalogLoading = true
            val catalogType = if (categoryFilter == "series") "phim-bo" else "phim-le"
            val result = repository.getCatalog(type = catalogType, page = 1, limit = 40)
            result.onSuccess { items ->
                catalogMovies = items
                isCatalogLoading = false
            }.onFailure {
                isCatalogLoading = false
            }
        }
    }

    if (isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(TvBackground),
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
            modifier = modifier
                .fillMaxSize()
                .background(TvBackground),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = errorMessage ?: "Lỗi tải dữ liệu",
                    color = CineVietRedLight,
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

    // DEDICATED FULL SCREEN GRID FOR PHIM BỘ / PHIM LẺ (Full 40-Movie Catalog Grid)
    if (categoryFilter != null) {
        val (title, defaultSubtitle, fallbackMovies) = when (categoryFilter) {
            "series" -> Triple(
                "Kho Phim Bộ Đang Hot",
                "Tuyển chọn 40+ bộ phim truyền hình hấp dẫn chất lượng cao",
                data.series
            )
            "singles" -> Triple(
                "Kho Phim Lẻ Đặc Sắc",
                "Tuyển tập 40+ siêu phẩm điện ảnh đặc sắc chuẩn rạp",
                data.singles
            )
            else -> Triple("Kho Phim CineViet", "", data.latest)
        }

        val effectiveMovies = if (catalogMovies.isNotEmpty()) catalogMovies else fallbackMovies

        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .background(TvBackground)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 36.dp, top = 28.dp, end = 36.dp, bottom = 4.dp)
                ) {
                    Text(
                        text = title,
                        color = Color.White,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Black
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (effectiveMovies.isNotEmpty()) "${effectiveMovies.size} phim được tuyển chọn cập nhật liên tục" else defaultSubtitle,
                        color = TvOnSurfaceVariant,
                        fontSize = 13.sp
                    )
                }
            }

            // 5-Column Grid Layout displaying all movies
            val chunks = effectiveMovies.chunked(5)
            items(chunks) { rowMovies ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 36.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    rowMovies.forEach { movie ->
                        TvMovieCard(
                            movie = movie,
                            onClick = { onMovieClick(movie.slug) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    repeat(5 - rowMovies.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        return
    }

    // MAIN EXPLORE HOME FEED (Nocturne Cinema Layout + CineViet Red Theme)
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
            .padding(bottom = 36.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        // 1. IMMERSIVE HERO BILLBOARD BANNER
        if (data.spotlights.isNotEmpty()) {
            item {
                TvSpotlightHero(
                    spotlights = data.spotlights,
                    onPlayClick = { slug, ep -> onPlayClick(slug, ep) },
                    onDetailClick = { slug -> onMovieClick(slug) }
                )
            }
        }

        // 2. TIẾP TỤC XEM (CONTINUE WATCHING) ROW
        if (continueWatchingList.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Tiếp Tục Xem",
                    subtitle = "XEM TIẾP DỞ DANG"
                ) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        contentPadding = PaddingValues(horizontal = 36.dp)
                    ) {
                        items(continueWatchingList) { item ->
                            TvContinueWatchingCard(
                                item = item,
                                onClick = { onPlayClick(item.movieSlug, item.episodeSlug) }
                            )
                        }
                    }
                }
            }
        }

        // 3. TOP TRENDING TODAY / BẢNG XẾP HẠNG (Netflix Style Poster Rail with Big Rank Overlay)
        if (data.rankings.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Bảng Xếp Hạng Hôm Nay",
                    subtitle = "TOP THỊNH HÀNH"
                ) {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        contentPadding = PaddingValues(horizontal = 36.dp)
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

        // 4. PHIM MỚI CẬP NHẬT
        if (data.latest.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Phim Mới Cập Nhật",
                    subtitle = "MỚI NHẤT"
                ) {
                    TvMovieRow(movies = data.latest, onMovieClick = onMovieClick)
                }
            }
        }

        // 5. PHIM CHIẾU RẠP ĐẶC SẮC
        if (data.cinema.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Phim Chiếu Rạp",
                    subtitle = "BẢN ĐẸP CHUẨN RẠP"
                ) {
                    TvMovieRow(movies = data.cinema, onMovieClick = onMovieClick)
                }
            }
        }

        // 6. PHIM BỘ ĐANG HOT
        if (data.series.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Phim Bộ Hot",
                    subtitle = "TRUYỀN HÌNH ĐẶC SẮC"
                ) {
                    TvMovieRow(movies = data.series, onMovieClick = onMovieClick)
                }
            }
        }

        // 7. PHIM LẺ CHỌN LỌC
        if (data.singles.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Phim Lẻ Hay Nhất",
                    subtitle = "ĐIỆN ẢNH TUYỂN CHỌN"
                ) {
                    TvMovieRow(movies = data.singles, onMovieClick = onMovieClick)
                }
            }
        }

        // 8. HOẠT HÌNH & ANIME
        if (data.anime.isNotEmpty()) {
            item {
                TvMovieSection(
                    title = "Hoạt Hình & Anime",
                    subtitle = "THẾ GIỚI HOẠT HỌA"
                ) {
                    TvMovieRow(movies = data.anime, onMovieClick = onMovieClick)
                }
            }
        }
    }
}

@Composable
fun TvContinueWatchingCard(
    item: WatchHistoryItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.08f else 1.0f,
        animationSpec = tween(160),
        label = "continueScale"
    )

    Column(
        modifier = modifier
            .width(240.dp)
            .scale(scale)
            .focusable(interactionSource = interactionSource)
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(4.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(135.dp)
                .background(TvSurfaceContainer, RoundedCornerShape(10.dp))
                .border(
                    width = if (isFocused) 2.5.dp else 1.dp,
                    color = if (isFocused) CineVietRed else Color.White.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(10.dp)
                )
                .clip(RoundedCornerShape(10.dp))
        ) {
            SubcomposeAsyncImage(
                model = item.displayThumb,
                contentDescription = item.movieName,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                error = {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(TvSurfaceContainer),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White.copy(alpha = 0.3f),
                            modifier = Modifier.size(36.dp)
                        )
                    }
                }
            )

            // Center Play Icon Overlay when focused
            if (isFocused) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(CineVietRed.copy(alpha = 0.9f))
                        .align(Alignment.Center),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = "Xem tiếp",
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                }
            }

            // Bottom Progress Bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(Color.Black.copy(alpha = 0.6f))
                    .align(Alignment.BottomStart)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(fraction = item.progressRatio.coerceIn(0.05f, 1.0f))
                        .background(CineVietRed)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = item.movieName,
            color = if (isFocused) CineVietRedLight else Color.White,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        val epText = item.episodeName?.takeIf { it.isNotBlank() } ?: "Đang xem dở"
        Text(
            text = epText,
            color = TvOnSurfaceVariant,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
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

    // Auto-advance carousel every 7s if not interacting with action buttons
    LaunchedEffect(isPlayFocused, isDetailFocused, spotlights.size) {
        if (!isPlayFocused && !isDetailFocused && spotlights.size > 1) {
            while (true) {
                delay(7000)
                currentIndex = (currentIndex + 1) % spotlights.size
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(510.dp)
    ) {
        // Fullbleed Backdrop Image with SubcomposeAsyncImage & Fallback (NEVER RENDERS BLACK)
        SubcomposeAsyncImage(
            model = currentMovie.displayBackdrop.ifBlank { currentMovie.backdropFallback },
            contentDescription = currentMovie.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            loading = {
                AsyncImage(
                    model = currentMovie.backdropFallback,
                    contentDescription = currentMovie.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            },
            error = {
                AsyncImage(
                    model = currentMovie.backdropFallback.ifBlank { currentMovie.displayPoster },
                    contentDescription = currentMovie.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
        )

        // Directional Obsidian Scrims (Left to Right & Bottom to Top)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            TvBackground,
                            TvBackground.copy(alpha = 0.95f),
                            TvBackground.copy(alpha = 0.70f),
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
                            TvBackground.copy(alpha = 0.50f),
                            TvBackground
                        ),
                        startY = 180f
                    )
                )
        )

        // Hero Billboard Content
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 36.dp, bottom = 32.dp)
                .width(620.dp)
        ) {
            // Badges Row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // CineViet Red Spotlight Badge
                Box(
                    modifier = Modifier
                        .background(CineVietRed, RoundedCornerShape(20.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(Color.White)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "NỔI BẬT #${currentIndex + 1}",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.5.sp
                        )
                    }
                }

                currentMovie.quality?.let { q ->
                    Box(
                        modifier = Modifier
                            .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 7.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = q,
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                    ) {
                    Text(
                        text = "DOLBY AUDIO",
                        color = TvGold,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                currentMovie.year?.let { y ->
                    Box(
                        modifier = Modifier
                            .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 7.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = y.toString(),
                            color = TvOnSurfaceVariant,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Main Title
            Text(
                text = currentMovie.name,
                color = Color.White,
                fontSize = 36.sp,
                fontWeight = FontWeight.Black,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 44.sp
            )

            // Origin Name
            if (!currentMovie.originName.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = currentMovie.originName,
                    color = TvOnSurfaceVariant,
                    fontSize = 15.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Synopsis
            if (!currentMovie.content.isNullOrBlank()) {
                Text(
                    text = currentMovie.content,
                    color = TvOnSurface.copy(alpha = 0.85f),
                    fontSize = 13.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 19.sp
                )
            }

            Spacer(modifier = Modifier.height(22.dp))

            // ACTION BUTTONS (Nocturne Cinema Focus Pill with CineViet Red Theme)
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Primary Play Pill ("Xem ngay")
                val playScale by animateFloatAsState(
                    targetValue = if (isPlayFocused) 1.08f else 1.0f,
                    animationSpec = tween(150),
                    label = "heroPlayScale"
                )

                Box(
                    modifier = Modifier
                        .scale(playScale)
                        .clip(RoundedCornerShape(26.dp))
                        .background(
                            if (isPlayFocused) {
                                Brush.horizontalGradient(listOf(CineVietRed, CineVietRedLight))
                            } else {
                                SolidColor(CineVietRed)
                            }
                        )
                        .border(
                            width = if (isPlayFocused) 2.5.dp else 0.dp,
                            color = if (isPlayFocused) Color.White else Color.Transparent,
                            shape = RoundedCornerShape(26.dp)
                        )
                        .focusable(interactionSource = playSource)
                        .clickable(interactionSource = playSource, indication = null) {
                            onPlayClick(currentMovie.slug, currentMovie.firstEpisodeSlug)
                        }
                        .padding(horizontal = 24.dp, vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Xem ngay",
                            tint = Color.White,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = currentMovie.ctaLabel ?: "Xem ngay",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Box(
                            modifier = Modifier
                                .background(Color.White.copy(alpha = 0.25f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        ) {
                            Text(
                                text = "OK",
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black
                            )
                        }
                    }
                }

                // Secondary Detail Pill ("Chi tiết")
                val detailScale by animateFloatAsState(
                    targetValue = if (isDetailFocused) 1.08f else 1.0f,
                    animationSpec = tween(150),
                    label = "heroDetailScale"
                )

                Box(
                    modifier = Modifier
                        .scale(detailScale)
                        .clip(RoundedCornerShape(26.dp))
                        .background(if (isDetailFocused) TvSurfaceHighest else TvSurfaceHigh.copy(alpha = 0.75f))
                        .border(
                            width = if (isDetailFocused) 2.dp else 1.dp,
                            color = if (isDetailFocused) CineVietRed else Color.White.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(26.dp)
                        )
                        .focusable(interactionSource = detailSource)
                        .clickable(interactionSource = detailSource, indication = null) {
                            onDetailClick(currentMovie.slug)
                        }
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Info,
                            contentDescription = "Chi tiết",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Chi tiết",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        // Mini Spotlight Carousel Thumbnails on Bottom-Right
        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 36.dp, bottom = 32.dp),
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
                        .background(TvSurfaceContainer, RoundedCornerShape(6.dp))
                        .border(
                            width = if (isThumbFocused || isSelected) 2.5.dp else 1.dp,
                            color = if (isThumbFocused || isSelected) CineVietRed else Color.White.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(6.dp)
                        )
                        .clip(RoundedCornerShape(6.dp))
                        .focusable(interactionSource = thumbSource)
                        .clickable(interactionSource = thumbSource, indication = null) {
                            currentIndex = index
                        }
                ) {
                    SubcomposeAsyncImage(
                        model = movie.displayPoster,
                        contentDescription = movie.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                        error = {
                            AsyncImage(
                                model = movie.backdropFallback,
                                contentDescription = movie.name,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                        }
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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 36.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        text = subtitle.uppercase(),
                        color = CineVietRed,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                }
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = TvOnSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.size(18.dp)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))
        content()
    }
}

@Composable
fun TvMovieRow(
    movies: List<MovieItem>,
    onMovieClick: (String) -> Unit
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(horizontal = 36.dp)
    ) {
        items(movies) { movie ->
            TvMovieCard(
                movie = movie,
                onClick = { onMovieClick(movie.slug) }
            )
        }
    }
}
