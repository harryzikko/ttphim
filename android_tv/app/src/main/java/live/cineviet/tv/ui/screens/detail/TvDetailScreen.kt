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
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
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
import kotlinx.coroutines.launch
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
            errorMessage = it.message ?: "Lỗi tải thông tin phim"
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
            TvLoadingSpinner(color = CineVietRed)
        }
        return
    }

    if (errorMessage != null || detailData == null) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(TvBackground),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = errorMessage ?: "Không tìm thấy phim",
                    color = Color(0xFFFF5252),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(16.dp))
                val backSource = remember { MutableInteractionSource() }
                val isBackFocused by backSource.collectIsFocusedAsState()
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isBackFocused) CineVietRed else TvSurfaceHigh)
                        .focusable(interactionSource = backSource)
                        .clickable(interactionSource = backSource, indication = null) { onBack() }
                        .padding(horizontal = 24.dp, vertical = 10.dp)
                ) {
                    Text("Quay lại", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
        return
    }

    val data = detailData!!
    val movie = data.movie
    val episodes = data.episodes

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

        // Asymmetrical Ambient Obsidian Scrims (from stitch_android_tv_media_player)
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
                        endX = 1450f
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
                            TvBackground.copy(alpha = 0.85f),
                            TvBackground
                        ),
                        startY = 200f
                    )
                )
        )

        // Main Scrollable Content
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 36.dp),
            contentPadding = PaddingValues(horizontal = 48.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            // Top Bar with Back Button & Brand Tag
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(if (isBackFocused) CineVietRed else TvSurfaceLow.copy(alpha = 0.8f))
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
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(18.dp))

                    // Brand Micro-Tag
                    val franchiseTag = if (movie.type == "series") "CINEVIET PHIM BỘ • CHUẨN RẠP" else "CINEVIET PHIM LẺ • CHUẨN ĐIỆN ẢNH"
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF8A3FFC).copy(alpha = 0.25f), RoundedCornerShape(4.dp))
                            .border(1.dp, Color(0xFF00EEFC).copy(alpha = 0.35f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = franchiseTag,
                            color = CyberCyan,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp
                        )
                    }
                }
            }

            // Hero Details & Primary Actions
            item {
                Column(modifier = Modifier.fillMaxWidth(0.68f)) {
                    // Movie Title
                    Text(
                        text = movie.name,
                        color = Color.White,
                        fontSize = 38.sp,
                        fontWeight = FontWeight.Black,
                        lineHeight = 44.sp
                    )

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
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Rating
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Star,
                                contentDescription = "Rating",
                                tint = GoldRating,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "9.4",
                                color = GoldRating,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Text(text = "•", color = TvOnSurfaceVariant)

                        movie.year?.let { y ->
                            Text(text = y.toString(), color = Color.White, fontSize = 13.sp)
                            Text(text = "•", color = TvOnSurfaceVariant)
                        }

                        // Duration / Episode Current
                        val dur = movie.time?.takeIf { it.isNotBlank() && it != "N/A" } ?: movie.episodeCurrent
                        if (!dur.isNullOrBlank()) {
                            Text(text = dur, color = Color.White, fontSize = 13.sp)
                            Text(text = "•", color = TvOnSurfaceVariant)
                        }

                        // Hardware Micro Capsules (4K UHD, Dolby Vision, Atmos)
                        Box(
                            modifier = Modifier
                                .background(TvSurfaceHigh.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = movie.quality?.takeIf { it.isNotBlank() } ?: "4K ULTRA HD",
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Box(
                            modifier = Modifier
                                .background(TvSurfaceHigh.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                                .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "DOLBY ATMOS",
                                color = CyberCyan,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Description (Synopsis)
                    if (!movie.content.isNullOrBlank()) {
                        Text(
                            text = movie.content,
                            color = TvOnSurface.copy(alpha = 0.88f),
                            fontSize = 14.sp,
                            lineHeight = 22.sp,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Meta: Starring & Director & Category
                    val castNames = movie.actor?.take(4)?.joinToString(", ")
                    val dirName = movie.director?.firstOrNull()
                    val catNames = movie.category?.take(3)?.map { it.name }?.joinToString(", ")

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
                                color = CyberCyan.copy(alpha = 0.85f),
                                fontSize = 12.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Primary Action Bar (Play Pill + Server Switches + Watchlist)
                    val firstEpSlug = episodes.getOrNull(selectedServerIndex)?.serverData?.firstOrNull()?.slug
                    val firstEpName = episodes.getOrNull(selectedServerIndex)?.serverData?.firstOrNull()?.name ?: "Tập 1"

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // Play/Resume Primary Pill Button (Luminous High Contrast)
                        val playScale by animateFloatAsState(
                            targetValue = if (isPlayFocused) 1.08f else 1.0f,
                            animationSpec = tween(180),
                            label = "playScale"
                        )
                        Box(
                            modifier = Modifier
                                .scale(playScale)
                                .clip(RoundedCornerShape(32.dp))
                                .background(
                                    if (isPlayFocused) FocusGradientRedViolet else Brush.horizontalGradient(
                                        listOf(CineVietRed, Color(0xFFB8000A))
                                    )
                                )
                                .border(
                                    width = if (isPlayFocused) 2.5.dp else 0.dp,
                                    color = if (isPlayFocused) CyberCyan else Color.Transparent,
                                    shape = RoundedCornerShape(32.dp)
                                )
                                .focusable(interactionSource = playSource)
                                .clickable(interactionSource = playSource, indication = null) {
                                    onPlayEpisode(movie.slug, firstEpSlug, selectedServerIndex)
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
                                    fontWeight = FontWeight.Black
                                )
                            }
                        }

                        // Bookmark / Watchlist Button
                        val bookmarkScale by animateFloatAsState(
                            targetValue = if (isBookmarkFocused) 1.12f else 1.0f,
                            animationSpec = tween(180),
                            label = "bmScale"
                        )
                        Box(
                            modifier = Modifier
                                .size(50.dp)
                                .scale(bookmarkScale)
                                .clip(CircleShape)
                                .background(if (isBookmarkFocused) TvSurfaceHighest else TvSurfaceHigh.copy(alpha = 0.8f))
                                .border(
                                    width = if (isBookmarkFocused) 2.dp else 1.dp,
                                    color = if (isBookmarkFocused) CyberCyan else Color.White.copy(alpha = 0.15f),
                                    shape = CircleShape
                                )
                                .focusable(interactionSource = bookmarkSource)
                                .clickable(interactionSource = bookmarkSource, indication = null) {
                                    isBookmarked = !isBookmarked
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (isBookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                                contentDescription = "Yêu thích",
                                tint = if (isBookmarked) CyberCyan else Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }
            }

            // Server Selection & Horizontal Episode Rail
            if (episodes.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        // Server Switcher Header
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = "Nguồn Phát (Server):",
                                color = TvOnSurfaceVariant,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )

                            episodes.forEachIndexed { index, server ->
                                val isSelected = index == selectedServerIndex
                                val serverSource = remember { MutableInteractionSource() }
                                val isServerFocused by serverSource.collectIsFocusedAsState()

                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            when {
                                                isServerFocused -> Color.White
                                                isSelected -> CineVietRed
                                                else -> TvSurfaceHigh
                                            }
                                        )
                                        .border(
                                            width = if (isServerFocused) 2.dp else 1.dp,
                                            color = if (isServerFocused) CyberCyan else Color.Transparent,
                                            shape = RoundedCornerShape(8.dp)
                                        )
                                        .focusable(interactionSource = serverSource)
                                        .clickable(interactionSource = serverSource, indication = null) {
                                            selectedServerIndex = index
                                        }
                                        .padding(horizontal = 14.dp, vertical = 7.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        if (isSelected) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = "Selected",
                                                tint = if (isServerFocused) Color.Black else Color.White,
                                                modifier = Modifier.size(14.dp)
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                        }
                                        Text(
                                            text = server.serverName,
                                            color = if (isServerFocused) Color.Black else Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Horizontal Episodes Rail
                        val currentServerEpisodes = episodes.getOrNull(selectedServerIndex)?.serverData ?: emptyList()
                        Text(
                            text = "Danh Sách Tập Phim (${currentServerEpisodes.size} tập)",
                            color = Color.White,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            contentPadding = PaddingValues(vertical = 4.dp)
                        ) {
                            items(currentServerEpisodes) { ep ->
                                val epSource = remember { MutableInteractionSource() }
                                val isEpFocused by epSource.collectIsFocusedAsState()

                                val epScale by animateFloatAsState(
                                    targetValue = if (isEpFocused) 1.10f else 1.0f,
                                    animationSpec = tween(180),
                                    label = "epScale"
                                )

                                Box(
                                    modifier = Modifier
                                        .width(115.dp)
                                        .height(56.dp)
                                        .scale(epScale)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(if (isEpFocused) CineVietRed else TvSurfaceHigh)
                                        .border(
                                            width = if (isEpFocused) 2.dp else 1.dp,
                                            color = if (isEpFocused) Color.White else Color.White.copy(alpha = 0.1f),
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .focusable(interactionSource = epSource)
                                        .clickable(interactionSource = epSource, indication = null) {
                                            onPlayEpisode(movie.slug, ep.slug, selectedServerIndex)
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = ep.name,
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = if (isEpFocused) FontWeight.Black else FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Real Cast & Director Section (with TMDb Avatars)
            val castList = if (!movie.tmdbCast.isNullOrEmpty()) {
                movie.tmdbCast
            } else {
                movie.actor?.map { actorName ->
                    TmdbCast(
                        name = actorName,
                        character = "Diễn viên",
                        avatar = "https://cineviet.live/api/person/avatar/" + java.net.URLEncoder.encode(actorName, "UTF-8")
                    )
                } ?: emptyList()
            }

            val directorList = if (!movie.tmdbDirectors.isNullOrEmpty()) {
                movie.tmdbDirectors
            } else {
                movie.director?.map { dirName ->
                    TmdbDirector(
                        name = dirName,
                        job = "Đạo diễn",
                        avatar = "https://cineviet.live/api/person/avatar/" + java.net.URLEncoder.encode(dirName, "UTF-8")
                    )
                } ?: emptyList()
            }

            if (castList.isNotEmpty() || directorList.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "Đạo Diễn & Diễn Viên",
                            color = Color.White,
                            fontSize = 20.sp,
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
                                    imageUrl = director.portraitUrl
                                )
                            }
                            items(castList) { cast ->
                                TvPersonCard(
                                    name = cast.name,
                                    role = cast.character ?: "Diễn viên",
                                    imageUrl = cast.portraitUrl
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
    imageUrl: String
) {
    val personSource = remember { MutableInteractionSource() }
    val isPersonFocused by personSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPersonFocused) 1.12f else 1.0f,
        animationSpec = tween(180),
        label = "personScale"
    )

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
                .background(TvSurfaceHigh)
                .border(
                    width = if (isPersonFocused) 2.5.dp else 1.dp,
                    color = if (isPersonFocused) CyberCyan else Color.White.copy(alpha = 0.15f),
                    shape = CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            if (imageUrl.isNotBlank()) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Text(
                    text = (name.firstOrNull() ?: '?').toString().uppercase(),
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = name,
            color = if (isPersonFocused) Color.White else TvOnSurface,
            fontSize = 12.sp,
            fontWeight = if (isPersonFocused) FontWeight.Bold else FontWeight.SemiBold,
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
