package live.cineviet.tv.ui.screens.detail

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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
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
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.launch
import live.cineviet.tv.data.models.EpisodeServer
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.models.TmdbCast
import live.cineviet.tv.data.models.TmdbDirector
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*

@Composable
fun TvDetailScreen(
    slug: String,
    onBack: () -> Unit,
    onPlayEpisode: (String, String?, Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()

    var detailData by remember { mutableStateOf<MovieDetailData?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var selectedServerIndex by remember { mutableStateOf(0) }
    var isBookmarked by remember { mutableStateOf(false) }

    LaunchedEffect(slug) {
        isLoading = true
        errorMessage = null
        val result = repository.getMovieDetail(slug)
        result.onSuccess {
            detailData = it
            isBookmarked = it.inWatchlist
            isLoading = false
            repository.trackView(slug)
        }.onFailure {
            errorMessage = it.message ?: "Không thể tải chi tiết phim"
            isLoading = false
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
                    text = "Đang tải thông tin phim...",
                    color = TvOnSurfaceVariant,
                    fontSize = 14.sp
                )
            }
        }
        return
    }

    if (errorMessage != null || detailData == null) {
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
                        .clickable(interactionSource = retrySource, indication = null) {
                            scope.launch {
                                isLoading = true
                                repository.getMovieDetail(slug).onSuccess {
                                    detailData = it
                                    isLoading = false
                                }.onFailure {
                                    errorMessage = it.message
                                    isLoading = false
                                }
                            }
                        }
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

    val movie = detailData!!.movie

    // FILTER ONLY KKPHIM SOURCES (Direct HLS - No NguonC, No ViCDN Song Ngu)
    val rawEpisodes = detailData!!.episodes
    val kkphimServers = rawEpisodes.filter { srv ->
        val name = srv.serverName.lowercase()
        !name.contains("nc") && !name.contains("nguonc") && !name.contains("song ngữ") && !name.contains("vicdn")
    }.ifEmpty {
        rawEpisodes.filter { srv -> srv.serverData.any { !it.linkM3u8.isNullOrBlank() } }
    }.ifEmpty {
        rawEpisodes
    }

    val activeServer = kkphimServers.getOrNull(selectedServerIndex) ?: kkphimServers.firstOrNull()
    // Map selected KKPhim server back to the raw index for playback
    val realServerIndex = rawEpisodes.indexOfFirst { it.serverName == activeServer?.serverName }.coerceAtLeast(0)

    val playSource = remember { MutableInteractionSource() }
    val isPlayFocused by playSource.collectIsFocusedAsState()

    val bookmarkSource = remember { MutableInteractionSource() }
    val isBookmarkFocused by bookmarkSource.collectIsFocusedAsState()

    val backSource = remember { MutableInteractionSource() }
    val isBackFocused by backSource.collectIsFocusedAsState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
    ) {
        // Fullbleed 16:9 Cinematic Backdrop
        AsyncImage(
            model = movie.getBackdrop().ifBlank { movie.getPoster() },
            contentDescription = movie.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(520.dp)
        )

        // Asymmetrical Ambient Obsidian Scrims (CineViet Dark Theme)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            TvBackground,
                            TvBackground.copy(alpha = 0.96f),
                            TvBackground.copy(alpha = 0.75f),
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
                            TvBackground.copy(alpha = 0.60f),
                            TvBackground
                        ),
                        startY = 180f
                    )
                )
        )

        // Main Scrollable Content
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 36.dp),
            contentPadding = PaddingValues(horizontal = 48.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            // Top Navigation & Movie Meta Info Section
            item {
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Back Button & Brand Micro-Tag
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(if (isBackFocused) CineVietRed else TvSurfaceHigh.copy(alpha = 0.8f))
                                .border(
                                    width = if (isBackFocused) 2.dp else 1.dp,
                                    color = if (isBackFocused) Color.White else Color.White.copy(alpha = 0.15f),
                                    shape = CircleShape
                                )
                                .focusable(interactionSource = backSource)
                                .clickable(interactionSource = backSource, indication = null) { onBack() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Quay lại",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        // CineViet Brand Badge
                        Box(
                            modifier = Modifier
                                .background(CineVietRed.copy(alpha = 0.18f), RoundedCornerShape(20.dp))
                                .border(1.dp, CineVietRed.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
                                .padding(horizontal = 12.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "CINEVIET CINEMA",
                                color = CineVietRedLight,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Movie Title
                    Text(
                        text = movie.name,
                        color = Color.White,
                        fontSize = 38.sp,
                        fontWeight = FontWeight.Black,
                        lineHeight = 46.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Original Title
                    if (!movie.originName.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = movie.originName,
                            color = TvOnSurfaceVariant,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Technical Badges Strip
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .background(CineVietRed, RoundedCornerShape(4.dp))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = movie.quality ?: "4K ULTRA HD",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Box(
                            modifier = Modifier
                                .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = "DOLBY AUDIO",
                                color = TvGold,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        movie.year?.let { y ->
                            Box(
                                modifier = Modifier
                                    .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Text(
                                    text = y.toString(),
                                    color = TvOnSurface,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        val epCurr = movie.episodeCurrent
                        if (!epCurr.isNullOrBlank()) {
                            Box(
                                modifier = Modifier
                                    .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Text(
                                    text = epCurr,
                                    color = TvOnSurface,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        movie.time?.let { t ->
                            Text(
                                text = t,
                                color = TvOnSurfaceVariant,
                                fontSize = 12.sp
                            )
                        }

                        val ratingVal = (movie.view?.toString()?.toDoubleOrNull() ?: 8.5).coerceIn(1.0, 10.0)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .background(TvSurfaceHighest.copy(alpha = 0.85f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 7.dp, vertical = 3.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Star,
                                contentDescription = "Rating",
                                tint = TvGold,
                                modifier = Modifier.size(13.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = String.format("%.1f", ratingVal),
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Synopsis
                    if (!movie.content.isNullOrBlank()) {
                        val cleanContent = movie.content
                            .replace(Regex("<[^>]*>"), "")
                            .replace("&nbsp;", " ")
                        Text(
                            text = cleanContent,
                            color = TvOnSurface.copy(alpha = 0.88f),
                            fontSize = 13.sp,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                            lineHeight = 20.sp,
                            modifier = Modifier.widthIn(max = 750.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Meta Row: Cast, Director, Categories
                    val castNames = movie.actor?.take(4)?.joinToString(", ")
                    val dirName = movie.director?.firstOrNull()
                    val catNames = movie.category?.joinToString(", ") { it.name }

                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (!castNames.isNullOrBlank()) {
                            Text(
                                text = "Diễn viên: $castNames",
                                color = TvOnSurfaceVariant,
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        if (!dirName.isNullOrBlank()) {
                            Text(
                                text = "Đạo diễn: $dirName",
                                color = TvOnSurfaceVariant,
                                fontSize = 12.sp
                            )
                        }
                        if (!catNames.isNullOrBlank()) {
                            Text(
                                text = "Thể loại: $catNames",
                                color = CineVietRedLight,
                                fontSize = 12.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Primary Action Bar (Xem Phim + Yêu Thích)
                    val firstEpSlug = activeServer?.serverData?.firstOrNull()?.slug
                    val firstEpName = activeServer?.serverData?.firstOrNull()?.name ?: "Tập 1"

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Play Pill Button
                        val playScale by animateFloatAsState(
                            targetValue = if (isPlayFocused) 1.08f else 1.0f,
                            animationSpec = tween(150),
                            label = "playScale"
                        )
                        Box(
                            modifier = Modifier
                                .scale(playScale)
                                .clip(RoundedCornerShape(28.dp))
                                .background(
                                    if (isPlayFocused) {
                                        Brush.horizontalGradient(listOf(CineVietRed, CineVietRedLight))
                                    } else {
                                        androidx.compose.ui.graphics.SolidColor(CineVietRed)
                                    }
                                )
                                .border(
                                    width = if (isPlayFocused) 2.5.dp else 0.dp,
                                    color = if (isPlayFocused) Color.White else Color.Transparent,
                                    shape = RoundedCornerShape(28.dp)
                                )
                                .focusable(interactionSource = playSource)
                                .clickable(interactionSource = playSource, indication = null) {
                                    onPlayEpisode(movie.slug, firstEpSlug, realServerIndex)
                                }
                                .padding(horizontal = 28.dp, vertical = 14.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.PlayArrow,
                                    contentDescription = "Xem ngay",
                                    tint = Color.White,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Xem Ngay ($firstEpName)",
                                    color = Color.White,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Black,
                                    letterSpacing = 0.5.sp
                                )
                            }
                        }

                        // Favorite / Watchlist Button (Heart Icon)
                        val bookmarkScale by animateFloatAsState(
                            targetValue = if (isBookmarkFocused) 1.08f else 1.0f,
                            animationSpec = tween(150),
                            label = "bmScale"
                        )
                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .scale(bookmarkScale)
                                .clip(CircleShape)
                                .background(if (isBookmarkFocused) TvSurfaceHighest else TvSurfaceHigh.copy(alpha = 0.7f))
                                .border(
                                    width = if (isBookmarkFocused) 2.dp else 1.dp,
                                    color = if (isBookmarkFocused) CineVietRed else Color.White.copy(alpha = 0.15f),
                                    shape = CircleShape
                                )
                                .focusable(interactionSource = bookmarkSource)
                                .clickable(interactionSource = bookmarkSource, indication = null) {
                                    isBookmarked = !isBookmarked
                                    scope.launch {
                                        repository.toggleWatchlist(
                                            movieSlug = movie.slug,
                                            movieName = movie.name,
                                            posterUrl = movie.getPoster(),
                                            originName = movie.originName
                                        )
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (isBookmarked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                contentDescription = "Yêu thích",
                                tint = if (isBookmarked) CineVietRed else Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }
            }

            // KKPhim Episodes Rail
            if (activeServer != null && activeServer.serverData.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        // Server Switcher Header (if KKPhim has multiple variants like Vietsub / Thuyết minh)
                        if (kkphimServers.size > 1) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    text = "Phiên Bản:",
                                    color = TvOnSurfaceVariant,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )

                                kkphimServers.forEachIndexed { index, srv ->
                                    val isSelected = index == selectedServerIndex
                                    val srvSource = remember { MutableInteractionSource() }
                                    val isSrvFocused by srvSource.collectIsFocusedAsState()

                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(
                                                when {
                                                    isSrvFocused -> CineVietRedLight
                                                    isSelected -> CineVietRed
                                                    else -> TvSurfaceHigh
                                                }
                                            )
                                            .border(
                                                width = if (isSrvFocused) 2.dp else 1.dp,
                                                color = if (isSrvFocused) Color.White else Color.Transparent,
                                                shape = RoundedCornerShape(8.dp)
                                            )
                                            .focusable(interactionSource = srvSource)
                                            .clickable(interactionSource = srvSource, indication = null) {
                                                selectedServerIndex = index
                                            }
                                            .padding(horizontal = 14.dp, vertical = 7.dp)
                                    ) {
                                        Text(
                                            text = srv.serverName,
                                            color = Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))
                        }

                        // Episodes Header
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = "Danh Sách Tập Phim",
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "(${activeServer.serverData.size} tập · Chuẩn rạp HLS)",
                                color = TvOnSurfaceVariant,
                                fontSize = 13.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Horizontal Episodes Rail
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            contentPadding = PaddingValues(vertical = 4.dp)
                        ) {
                            itemsIndexed(activeServer.serverData) { _, ep ->
                                val epSource = remember { MutableInteractionSource() }
                                val isEpFocused by epSource.collectIsFocusedAsState()

                                val epScale by animateFloatAsState(
                                    targetValue = if (isEpFocused) 1.08f else 1.0f,
                                    animationSpec = tween(150),
                                    label = "epScale"
                                )

                                Box(
                                    modifier = Modifier
                                        .scale(epScale)
                                        .width(96.dp)
                                        .height(48.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(
                                            when {
                                                isEpFocused -> CineVietRed
                                                else -> TvSurfaceContainer
                                            }
                                        )
                                        .border(
                                            width = if (isEpFocused) 2.dp else 1.dp,
                                            color = if (isEpFocused) Color.White else Color.White.copy(alpha = 0.08f),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .focusable(interactionSource = epSource)
                                        .clickable(interactionSource = epSource, indication = null) {
                                            onPlayEpisode(movie.slug, ep.slug, realServerIndex)
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = ep.name,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Real TMDb Cast & Director Section (Circular Avatars)
            val castList = movie.allCast.ifEmpty {
                movie.actor?.map { actorName ->
                    TmdbCast(
                        name = actorName,
                        character = "Diễn viên"
                    )
                } ?: emptyList()
            }

            val directorList = movie.allDirectors.ifEmpty {
                movie.director?.map { dirName ->
                    TmdbDirector(
                        name = dirName,
                        job = "Đạo diễn"
                    )
                } ?: emptyList()
            }

            if (castList.isNotEmpty() || directorList.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "Đạo Diễn & Diễn Viên",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(modifier = Modifier.height(14.dp))

                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(18.dp),
                            contentPadding = PaddingValues(vertical = 4.dp)
                        ) {
                            items(directorList) { director ->
                                TvPersonCard(
                                    name = director.name,
                                    role = director.job ?: "Đạo diễn",
                                    imageUrl = director.portraitUrl,
                                    isDirector = true
                                )
                            }
                            items(castList) { cast ->
                                TvPersonCard(
                                    name = cast.name,
                                    role = cast.character ?: "Diễn viên",
                                    imageUrl = cast.portraitUrl,
                                    isDirector = false
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TvPersonCard(
    name: String,
    role: String,
    imageUrl: String,
    isDirector: Boolean = false
) {
    val personSource = remember { MutableInteractionSource() }
    val isPersonFocused by personSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPersonFocused) 1.10f else 1.0f,
        animationSpec = tween(150),
        label = "personScale"
    )

    val initial = name.trim().take(1).uppercase()
    val fallbackUrl = "https://ui-avatars.com/api/?name=${try { java.net.URLEncoder.encode(name, "UTF-8") } catch (_: Exception) { name }}&background=1d1f29&color=${if (isDirector) "f59e0b" else "e50914"}&size=256&bold=true"
    val effectiveUrl = if (imageUrl.isBlank() || imageUrl.contains("/api/person/avatar")) fallbackUrl else imageUrl

    Column(
        modifier = Modifier
            .width(110.dp)
            .scale(scale)
            .focusable(interactionSource = personSource)
            .clickable(interactionSource = personSource, indication = null) {},
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(76.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        listOf(TvSurfaceContainerHighest, TvSurfaceContainer)
                    )
                )
                .border(
                    width = if (isPersonFocused) 2.5.dp else 1.dp,
                    color = if (isPersonFocused) CineVietRed else if (isDirector) CineVietGold.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.12f),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            SubcomposeAsyncImage(
                model = effectiveUrl,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initial,
                            color = if (isDirector) CineVietGold else CineVietRedLight,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                },
                error = {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    listOf(
                                        if (isDirector) Color(0xFF332505) else Color(0xFF2A1015),
                                        TvSurfaceContainer
                                    )
                                )
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initial,
                            color = if (isDirector) CineVietGold else CineVietRedLight,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Black
                        )
                    }
                }
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = name,
            color = if (isPersonFocused) CineVietRedLight else Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Text(
            text = role,
            color = TvOnSurfaceVariant,
            fontSize = 10.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
