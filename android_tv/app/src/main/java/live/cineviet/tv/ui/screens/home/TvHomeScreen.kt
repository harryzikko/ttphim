package live.cineviet.tv.ui.screens.home

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.relocation.BringIntoViewResponder
import androidx.compose.foundation.relocation.bringIntoViewResponder
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
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
import androidx.compose.ui.platform.LocalContext
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    onPlayClick: (String, String?, Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()

    val context = LocalContext.current
    val cachedHome = remember { sessionManager?.getCachedHome() }
    var homeData by remember { mutableStateOf<HomeData?>(cachedHome) }
    var isLoading by remember { mutableStateOf(cachedHome == null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // User Continue Watching list
    var continueWatchingList by remember { mutableStateOf<List<WatchHistoryItem>>(emptyList()) }
    var selectedContinueItem by remember { mutableStateOf<WatchHistoryItem?>(null) }
    val listState = rememberLazyListState()

    // Full 40-movie catalog for Phim bộ & Phim lẻ tabs
    var catalogMovies by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isCatalogLoading by remember { mutableStateOf(false) }

    fun loadData() {
        if (homeData == null) {
            isLoading = true
        }
        errorMessage = null
        scope.launch {
            val result = repository.getHome()
            result.onSuccess {
                homeData = it
                isLoading = false
                sessionManager?.saveCachedHome(Gson().toJson(it))
            }.onFailure {
                if (homeData == null) {
                    errorMessage = it.message ?: "Không thể kết nối đến máy chủ CineViet"
                }
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadData()
    }

    // Warm Coil disk & memory cache immediately when homeData is loaded
    LaunchedEffect(homeData) {
        val data = homeData ?: return@LaunchedEffect
        withContext(Dispatchers.IO) {
            val loader = context.imageLoader
            // Preload top 3 spotlight backdrops & posters
            data.spotlights.take(3).forEach { spot ->
                val bg = spot.displayBackdrop.ifBlank { spot.backdropFallback }
                if (bg.isNotBlank()) {
                    loader.enqueue(ImageRequest.Builder(context).data(bg).build())
                }
                if (spot.displayPoster.isNotBlank()) {
                    loader.enqueue(ImageRequest.Builder(context).data(spot.displayPoster).build())
                }
            }
            // Preload top 5 posters of cinema & latest movies
            (data.cinema.take(5) + data.latest.take(5)).forEach { m ->
                val poster = m.displayPoster
                if (poster.isNotBlank()) {
                    loader.enqueue(ImageRequest.Builder(context).data(poster).build())
                }
            }
        }
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
    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier
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
                        onPlayClick = { slug, ep, pos -> onPlayClick(slug, ep, pos) },
                        onDetailClick = { slug -> onMovieClick(slug) },
                        onFocused = {
                            scope.launch {
                                listState.scrollToItem(0, 0)
                            }
                        }
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
                                    onClick = { selectedContinueItem = item }
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

    BackHandler(enabled = selectedContinueItem != null) {
        selectedContinueItem = null
    }

    if (selectedContinueItem != null) {
        val continueItem = selectedContinueItem!!
        TvContinueActionDialog(
            item = continueItem,
            onResume = {
                val slug = continueItem.movieSlug
                val ep = continueItem.episodeSlug?.takeIf { it.isNotBlank() }
                val startMs = continueItem.currentTimeMs
                selectedContinueItem = null
                onPlayClick(slug, ep, startMs)
            },
            onDelete = {
                val slug = continueItem.movieSlug
                continueWatchingList = continueWatchingList.filter { it.movieSlug != slug }
                selectedContinueItem = null
                scope.launch {
                    repository.removeFromHistory(slug)
                }
            },
            onDismiss = {
                selectedContinueItem = null
            }
        )
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
        val remain = item.formattedRemainingOrTime
        val subText = if (remain.isNotBlank()) "$epText • $remain" else epText
        Text(
            text = subText,
            color = TvOnSurfaceVariant,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
private class HeroBringIntoViewResponder : BringIntoViewResponder {
    override fun calculateRectForParent(localRect: Rect): Rect = Rect.Zero
    override suspend fun bringChildIntoView(localRect: () -> Rect?) {}
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TvSpotlightHero(
    spotlights: List<SpotlightMovie>,
    onPlayClick: (String, String?, Long) -> Unit,
    onDetailClick: (String) -> Unit,
    onFocused: () -> Unit = {}
) {
    var currentIndex by remember { mutableStateOf(0) }
    val currentMovie = spotlights.getOrNull(currentIndex) ?: return
    val heroResponder = remember { HeroBringIntoViewResponder() }

    val playSource = remember { MutableInteractionSource() }
    val isPlayFocused by playSource.collectIsFocusedAsState()

    val detailSource = remember { MutableInteractionSource() }
    val isDetailFocused by detailSource.collectIsFocusedAsState()

    LaunchedEffect(isPlayFocused, isDetailFocused) {
        if (isPlayFocused || isDetailFocused) {
            onFocused()
        }
    }

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
            .bringIntoViewResponder(heroResponder)
    ) {
        // Layer 1: Fast direct CDN fallback backdrop (Never black, loads instantly)
        if (currentMovie.backdropFallback.isNotBlank()) {
            AsyncImage(
                model = currentMovie.backdropFallback,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        }

        // Layer 2: High-res Backdrop Image (Smooth crossfade on top)
        AsyncImage(
            model = currentMovie.displayBackdrop.ifBlank { currentMovie.backdropFallback },
            contentDescription = currentMovie.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
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
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Main Title
            Text(
                text = currentMovie.displayName,
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
            if (currentMovie.displayContent.isNotBlank()) {
                Text(
                    text = currentMovie.displayContent,
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
                            onPlayClick(currentMovie.slug, currentMovie.firstEpisodeSlug, 0L)
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

                LaunchedEffect(isThumbFocused) {
                    if (isThumbFocused) {
                        onFocused()
                    }
                }

                Box(
                    modifier = Modifier
                        .size(width = 44.dp, height = 62.dp)
                        .scale(if (isThumbFocused) 1.12f else if (isSelected) 1.05f else 1.0f)
                        .background(TvSurfaceContainer, RoundedCornerShape(6.dp))
                        .border(
                            width = if (isThumbFocused || isSelected) 2.5.dp else 1.dp,
                            color = if (isThumbFocused || isSelected) CineVietRed else Color.White.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(6.dp)
                        )
                        .clip(RoundedCornerShape(6.dp))
                        .focusable(interactionSource = thumbSource)
                        .onKeyEvent { keyEvent ->
                            if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                                (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                                currentIndex = index
                                onFocused()
                                true
                            } else false
                        }
                        .clickable(interactionSource = thumbSource, indication = null) {
                            currentIndex = index
                            onFocused()
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

@Composable
fun TvContinueActionDialog(
    item: WatchHistoryItem,
    onResume: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit
) {
    val resumeSource = remember { MutableInteractionSource() }
    val isResumeFocused by resumeSource.collectIsFocusedAsState()

    val deleteSource = remember { MutableInteractionSource() }
    val isDeleteFocused by deleteSource.collectIsFocusedAsState()

    val dismissSource = remember { MutableInteractionSource() }
    val isDismissFocused by dismissSource.collectIsFocusedAsState()

    val resumeRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        delay(120)
        try { resumeRequester.requestFocus() } catch (_: Exception) {}
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.85f))
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) { onDismiss() },
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .width(480.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(TvSurfaceContainer)
                    .border(1.5.dp, CineVietRed.copy(alpha = 0.7f), RoundedCornerShape(20.dp))
                    .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {}
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = item.movieName.ifBlank { item.movieSlug },
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(8.dp))

                val epInfo = item.episodeName?.takeIf { it.isNotBlank() }?.let { "Đang xem: $it" } ?: "Đang xem dở dang"
                val remainOrTime = item.formattedRemainingOrTime
                val subText = if (remainOrTime.isNotBlank()) "$epInfo • $remainOrTime" else epInfo
                Text(
                    text = subText,
                    color = TvOnSurfaceVariant,
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )

                Spacer(modifier = Modifier.height(28.dp))

                // Action 1: Resume Playing
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .focusRequester(resumeRequester)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isResumeFocused) CineVietRed else TvSurfaceHigh)
                        .border(2.dp, if (isResumeFocused) Color.White else Color.Transparent, RoundedCornerShape(12.dp))
                        .focusable(interactionSource = resumeSource)
                        .onKeyEvent { keyEvent ->
                            if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                                (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                                onResume()
                                true
                            } else false
                        }
                        .clickable(interactionSource = resumeSource, indication = null) { onResume() },
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Xem Tiếp",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Action 2: Delete from Continue Watching
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isDeleteFocused) Color(0xFF93000A) else TvSurfaceHigh)
                        .border(2.dp, if (isDeleteFocused) Color.White else Color.Transparent, RoundedCornerShape(12.dp))
                        .focusable(interactionSource = deleteSource)
                        .onKeyEvent { keyEvent ->
                            if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                                (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                                onDelete()
                                true
                            } else false
                        }
                        .clickable(interactionSource = deleteSource, indication = null) { onDelete() },
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Xóa Khỏi Danh Sách Tiếp Tục Xem",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Action 3: Cancel / Dismiss
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isDismissFocused) TvSurfaceHighest else Color.Transparent)
                        .border(1.dp, if (isDismissFocused) Color.White else Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                        .focusable(interactionSource = dismissSource)
                        .onKeyEvent { keyEvent ->
                            if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                                (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                                 keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                                onDismiss()
                                true
                            } else false
                        }
                        .clickable(interactionSource = dismissSource, indication = null) { onDismiss() },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Đóng",
                        color = TvOnSurfaceVariant,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
