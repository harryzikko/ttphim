package live.cineviet.tv.ui.screens.detail

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
import androidx.compose.material.icons.filled.ArrowBack
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
import live.cineviet.tv.data.models.EpisodeItem
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

    LaunchedEffect(slug) {
        isLoading = true
        errorMessage = null
        val result = repository.getMovieDetail(slug)
        result.onSuccess {
            detailData = it
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

    val backSource = remember { MutableInteractionSource() }
    val isBackFocused by backSource.collectIsFocusedAsState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
    ) {
        // Backdrop Image
        AsyncImage(
            model = movie.getBackdrop(),
            contentDescription = movie.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(450.dp)
        )

        // Gradient layers
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            TvBackground.copy(alpha = 0.5f),
                            TvBackground.copy(alpha = 0.85f),
                            TvBackground
                        ),
                        startY = 50f,
                        endY = 450f
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            TvBackground.copy(alpha = 0.95f),
                            TvBackground.copy(alpha = 0.7f),
                            Color.Transparent
                        ),
                        startX = 0f,
                        endX = 900f
                    )
                )
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 48.dp),
            contentPadding = PaddingValues(top = 28.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            // Header Info & Buttons
            item {
                Column(modifier = Modifier.fillMaxWidth()) {
                    // Top Back Button
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isBackFocused) CineVietRed else TvSurfaceHigh.copy(alpha = 0.85f))
                            .border(1.5.dp, if (isBackFocused) Color.White else Color.White.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                            .focusable(interactionSource = backSource)
                            .clickable(interactionSource = backSource, indication = null) { onBack() }
                            .padding(horizontal = 14.dp, vertical = 8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.ArrowBack,
                                contentDescription = "Quay lại",
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Quay lại", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // Title
                    Text(
                        text = movie.name,
                        color = Color.White,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black
                    )

                    if (!movie.originName.isNullOrBlank()) {
                        Text(
                            text = movie.originName,
                            color = TvOnSurfaceVariant,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Meta Tags (Year, Duration, Quality, Rating)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        movie.quality?.let { q ->
                            Box(
                                modifier = Modifier
                                    .background(CineVietRed, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(q, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        movie.episodeCurrent?.let { ep ->
                            Box(
                                modifier = Modifier
                                    .background(TvSurfaceHigh, RoundedCornerShape(4.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(ep, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        movie.year?.let { y ->
                            Text(y.toString(), color = TvOnSurfaceVariant, fontSize = 12.sp)
                        }

                        movie.time?.let { t ->
                            Text("· $t", color = TvOnSurfaceVariant, fontSize = 12.sp)
                        }

                        movie.category?.let { cats ->
                            if (cats.isNotEmpty()) {
                                Text("· " + cats.take(3).joinToString(", ") { it.name }, color = TvOnSurfaceVariant, fontSize = 12.sp)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Synopsis
                    if (!movie.content.isNullOrBlank()) {
                        Text(
                            text = movie.content,
                            color = TvOnSurface,
                            fontSize = 13.sp,
                            lineHeight = 20.sp,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 760.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // Play Button
                    val firstEp = episodes.getOrNull(selectedServerIndex)?.serverData?.firstOrNull()
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isPlayFocused) Color.White else CineVietRed)
                            .border(2.dp, if (isPlayFocused) CineVietRed else Color.Transparent, RoundedCornerShape(10.dp))
                            .shadow(if (isPlayFocused) 18.dp else 6.dp, RoundedCornerShape(10.dp), spotColor = CineVietRed)
                            .focusable(interactionSource = playSource)
                            .clickable(interactionSource = playSource, indication = null) {
                                onPlayEpisode(movie.slug, firstEp?.slug, selectedServerIndex)
                            }
                            .padding(horizontal = 28.dp, vertical = 12.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Xem ngay",
                                tint = if (isPlayFocused) CineVietRed else Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Xem Phim Ngay",
                                color = if (isPlayFocused) CineVietRed else Color.White,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // 2. SERVER & EPISODES SELECTION
            if (episodes.isNotEmpty()) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Text(
                            text = "Danh Sách Tập Phim",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        // Server Tabs
                        if (episodes.size > 1) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                itemsIndexed(episodes) { index, server ->
                                    val isServerSelected = index == selectedServerIndex
                                    val serverSource = remember { MutableInteractionSource() }
                                    val isServerFocused by serverSource.collectIsFocusedAsState()

                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(
                                                when {
                                                    isServerFocused -> Color.White
                                                    isServerSelected -> CineVietRed
                                                    else -> TvSurfaceHigh
                                                }
                                            )
                                            .border(
                                                1.5.dp,
                                                if (isServerFocused) CineVietRed else Color.Transparent,
                                                RoundedCornerShape(8.dp)
                                            )
                                            .focusable(interactionSource = serverSource)
                                            .clickable(interactionSource = serverSource, indication = null) {
                                                selectedServerIndex = index
                                            }
                                            .padding(horizontal = 16.dp, vertical = 8.dp)
                                    ) {
                                        Text(
                                            text = server.serverName,
                                            color = if (isServerFocused) Color.Black else Color.White,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(14.dp))
                        }

                        // Episode Grid / Row
                        val currentServerEpisodes = episodes.getOrNull(selectedServerIndex)?.serverData ?: emptyList()
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            contentPadding = PaddingValues(vertical = 4.dp)
                        ) {
                            items(currentServerEpisodes) { ep ->
                                val epSource = remember { MutableInteractionSource() }
                                val isEpFocused by epSource.collectIsFocusedAsState()

                                Box(
                                    modifier = Modifier
                                        .width(100.dp)
                                        .height(48.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isEpFocused) CineVietRed else TvSurfaceHigh)
                                        .border(
                                            2.dp,
                                            if (isEpFocused) Color.White else Color.White.copy(alpha = 0.1f),
                                            RoundedCornerShape(8.dp)
                                        )
                                        .shadow(if (isEpFocused) 10.dp else 0.dp, RoundedCornerShape(8.dp), spotColor = CineVietRed)
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
                                        fontWeight = if (isEpFocused) FontWeight.Bold else FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 3. DIỄN VIÊN & ĐẠO DIỄN (Clean Director & Cast Portraits Section)
            val castList = if (!movie.tmdbCast.isNullOrEmpty()) {
                movie.tmdbCast
            } else {
                movie.actor?.map { actorName ->
                    live.cineviet.tv.data.models.TmdbCast(
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
                    live.cineviet.tv.data.models.TmdbDirector(
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
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            contentPadding = PaddingValues(vertical = 4.dp)
                        ) {
                            // Directors first
                            items(directorList) { director ->
                                TvPersonCard(
                                    name = director.name,
                                    role = director.job ?: "Đạo diễn",
                                    imageUrl = director.portraitUrl
                                )
                            }

                            // Cast members
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

    Column(
        modifier = Modifier
            .width(110.dp)
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
                    color = if (isPersonFocused) CineVietRed else Color.White.copy(alpha = 0.15f),
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
