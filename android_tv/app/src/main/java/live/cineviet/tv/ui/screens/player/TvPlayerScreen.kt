package live.cineviet.tv.ui.screens.player

import android.view.KeyEvent
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.*
import kotlinx.coroutines.delay
import live.cineviet.tv.data.models.EpisodeItem
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(UnstableApi::class)
@Composable
fun TvPlayerScreen(
    slug: String,
    initialEpisodeSlug: String?,
    serverIndex: Int,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()

    var detailData by remember { mutableStateOf<MovieDetailData?>(null) }
    var currentEpisode by remember { mutableStateOf<EpisodeItem?>(null) }
    var isLoadingMovie by remember { mutableStateOf(true) }

    // ExoPlayer state
    var isPlaying by remember { mutableStateOf(true) }
    var isBuffering by remember { mutableStateOf(true) }
    var currentPosition by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var bufferedPosition by remember { mutableStateOf(0L) }

    // Controls and Episode Drawer Visibility
    var showControls by remember { mutableStateOf(true) }
    var showEpisodeDrawer by remember { mutableStateOf(false) }

    // Continuous seek state
    var isSeekingContinuous by remember { mutableStateOf(false) }
    var continuousSeekDelta by remember { mutableStateOf(0L) }

    // Current clock time string
    var currentTimeString by remember {
        mutableStateOf(SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date()))
    }

    val playerFocusRequester = remember { FocusRequester() }
    val playFocusRequester = remember { FocusRequester() }
    val drawerFocusRequester = remember { FocusRequester() }

    // Native Media3 ExoPlayer instance
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
            repeatMode = Player.REPEAT_MODE_OFF
            addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    isBuffering = (state == Player.STATE_BUFFERING)
                    if (state == Player.STATE_READY) {
                        duration = this@apply.duration.coerceAtLeast(0L)
                    }
                }

                override fun onIsPlayingChanged(playing: Boolean) {
                    isPlaying = playing
                }
            })
        }
    }

    DisposableEffect(exoPlayer) {
        onDispose {
            val curr = exoPlayer.currentPosition / 1000L
            val dur = exoPlayer.duration.coerceAtLeast(0L) / 1000L
            val ep = currentEpisode
            val detail = detailData
            if (dur > 0 && curr > 0 && detail != null && ep != null) {
                kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                    repository.saveHistory(
                        movieSlug = slug,
                        movieName = detail.movie.name,
                        posterUrl = detail.movie.getPoster(),
                        thumbUrl = detail.movie.getBackdrop(),
                        episodeName = ep.name,
                        episodeSlug = ep.slug,
                        currentTime = curr,
                        duration = dur
                    )
                }
            }
            exoPlayer.release()
        }
    }

    // Periodic history progress tracking every 12 seconds
    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (true) {
                delay(12000)
                if (duration > 0 && currentPosition > 0 && detailData != null && currentEpisode != null) {
                    repository.saveHistory(
                        movieSlug = slug,
                        movieName = detailData!!.movie.name,
                        posterUrl = detailData!!.movie.getPoster(),
                        thumbUrl = detailData!!.movie.getBackdrop(),
                        episodeName = currentEpisode!!.name,
                        episodeSlug = currentEpisode!!.slug,
                        currentTime = currentPosition / 1000L,
                        duration = duration / 1000L
                    )
                }
            }
        }
    }

    // Function to play episode directly with KKPhim HLS
    fun playEpisode(ep: EpisodeItem) {
        currentEpisode = ep
        val m3u8 = ep.linkM3u8?.trim() ?: ""
        if (m3u8.isNotBlank()) {
            val mediaItem = MediaItem.fromUri(m3u8)
            exoPlayer.setMediaItem(mediaItem)
            exoPlayer.prepare()
            exoPlayer.play()
        } else {
            // If link_m3u8 is empty, check embed url for embedded m3u8 param
            val embed = ep.linkEmbed?.trim() ?: ""
            val regex = Regex("(?:url|file)=([^&]+)")
            val match = regex.find(embed)?.groupValues?.get(1)
            val streamUrl = if (!match.isNullOrBlank()) {
                java.net.URLDecoder.decode(match, "UTF-8")
            } else ""

            if (streamUrl.isNotBlank()) {
                val mediaItem = MediaItem.fromUri(streamUrl)
                exoPlayer.setMediaItem(mediaItem)
                exoPlayer.prepare()
                exoPlayer.play()
            }
        }
    }

    // Load movie details & pick KKPhim episode
    LaunchedEffect(slug) {
        isLoadingMovie = true
        val result = repository.getMovieDetail(slug)
        result.onSuccess { data ->
            detailData = data
            isLoadingMovie = false

            // Filter ONLY KKPhim server
            val rawEpisodes = data.episodes
            val kkphimServers = rawEpisodes.filter { srv ->
                val name = srv.serverName.lowercase()
                !name.contains("nc") && !name.contains("nguonc") && !name.contains("song ngữ") && !name.contains("vicdn")
            }.ifEmpty {
                rawEpisodes.filter { srv -> srv.serverData.any { !it.linkM3u8.isNullOrBlank() } }
            }.ifEmpty {
                rawEpisodes
            }

            val targetServer = kkphimServers.getOrNull(serverIndex) ?: kkphimServers.firstOrNull()
            val ep = if (!initialEpisodeSlug.isNullOrBlank()) {
                targetServer?.serverData?.find { it.slug == initialEpisodeSlug } ?: targetServer?.serverData?.firstOrNull()
            } else {
                targetServer?.serverData?.firstOrNull()
            }

            if (ep != null) {
                playEpisode(ep)
            }
        }.onFailure {
            isLoadingMovie = false
        }
    }

    // Periodic time tracker & clock update (every 500ms)
    LaunchedEffect(exoPlayer) {
        while (true) {
            if (exoPlayer.isPlaying) {
                currentPosition = exoPlayer.currentPosition.coerceAtLeast(0L)
                duration = exoPlayer.duration.coerceAtLeast(0L)
                bufferedPosition = exoPlayer.bufferedPosition.coerceAtLeast(0L)
            }
            currentTimeString = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            delay(500)
        }
    }

    // Auto-hide controls after 4 seconds of inactivity if drawer is not open
    LaunchedEffect(showControls, isPlaying, showEpisodeDrawer) {
        if (showControls && !showEpisodeDrawer && !isSeekingContinuous) {
            delay(4000)
            showControls = false
        }
    }

    // Handle TV remote focus transitions
    LaunchedEffect(showControls, showEpisodeDrawer) {
        if (showEpisodeDrawer) {
            delay(150)
            try { drawerFocusRequester.requestFocus() } catch (_: Exception) {}
        } else if (showControls) {
            delay(100)
            try { playFocusRequester.requestFocus() } catch (_: Exception) {}
        } else {
            try { playerFocusRequester.requestFocus() } catch (_: Exception) {}
        }
    }

    // Auto-focus player view to capture TV remote D-pad events
    LaunchedEffect(Unit) {
        delay(200)
        try {
            playerFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    // Filter KKPhim server episodes for next episode and drawer
    val rawEpisodes = detailData?.episodes ?: emptyList()
    val kkphimServer = rawEpisodes.filter { srv ->
        val name = srv.serverName.lowercase()
        !name.contains("nc") && !name.contains("nguonc") && !name.contains("song ngữ") && !name.contains("vicdn")
    }.ifEmpty {
        rawEpisodes.filter { srv -> srv.serverData.any { !it.linkM3u8.isNullOrBlank() } }
    }.firstOrNull() ?: rawEpisodes.firstOrNull()

    val currentEpisodes = kkphimServer?.serverData ?: emptyList()
    val currentEpIndex = currentEpisodes.indexOfFirst { it.slug == currentEpisode?.slug }
    val nextEpisode = if (currentEpIndex != -1 && currentEpIndex + 1 < currentEpisodes.size) {
        currentEpisodes[currentEpIndex + 1]
    } else null

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(playerFocusRequester)
            .focusable()
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                            if (showEpisodeDrawer) {
                                showEpisodeDrawer = false
                                playFocusRequester.requestFocus()
                                return@onKeyEvent true
                            }
                            if (showControls) {
                                showControls = false
                                return@onKeyEvent true
                            }
                            onBack()
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            if (!showEpisodeDrawer) {
                                showControls = true
                                showEpisodeDrawer = true
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                            if (!showControls && !showEpisodeDrawer) {
                                showControls = true
                                playFocusRequester.requestFocus()
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                            if (!showControls && !showEpisodeDrawer) {
                                showControls = true
                                isSeekingContinuous = true
                                continuousSeekDelta += 10L
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            if (!showControls && !showEpisodeDrawer) {
                                showControls = true
                                isSeekingContinuous = true
                                continuousSeekDelta -= 10L
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_DPAD_UP -> {
                            if (!showControls && !showEpisodeDrawer) {
                                showControls = true
                                playFocusRequester.requestFocus()
                                return@onKeyEvent true
                            }
                        }
                    }
                } else if (keyEvent.type == KeyEventType.KeyUp) {
                    if (isSeekingContinuous && continuousSeekDelta != 0L) {
                        val target = (currentPosition + continuousSeekDelta * 1000L).coerceIn(0L, duration)
                        exoPlayer.seekTo(target)
                        isSeekingContinuous = false
                        continuousSeekDelta = 0L
                        return@onKeyEvent true
                    }
                }
                false
            }
    ) {
        // 1. NATIVE EXOPLAYER VIDEO CANVAS
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                    layoutParams = FrameLayout.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Buffering Spinner with CineViet Red Theme
        if (isBuffering) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .background(TvBackground.copy(alpha = 0.85f), RoundedCornerShape(16.dp))
                        .padding(horizontal = 28.dp, vertical = 20.dp)
                ) {
                    TvLoadingSpinner(color = CineVietRed)
                    Spacer(modifier = Modifier.height(14.dp))
                    Text(
                        text = "Đang tải luồng phát chuẩn rạp...",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Continuous Seek Feedback Overlay (holding left/right D-pad)
        if (continuousSeekDelta != 0L) {
            val isFwd = continuousSeekDelta > 0
            val targetTime = (currentPosition + continuousSeekDelta * 1000L).coerceIn(0L, duration)
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(TvBackground.copy(alpha = 0.92f), RoundedCornerShape(20.dp))
                    .border(1.5.dp, CineVietRed.copy(alpha = 0.6f), RoundedCornerShape(20.dp))
                    .padding(horizontal = 36.dp, vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = if (isFwd) Icons.Default.FastForward else Icons.Default.FastRewind,
                        contentDescription = "Tua",
                        tint = CineVietRedLight,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "${if (isFwd) "+" else ""}${continuousSeekDelta}s",
                        color = Color.White,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.Black
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Chuyển đến: ${formatPlayerTime(targetTime)}",
                        color = TvOnSurfaceVariant,
                        fontSize = 14.sp
                    )
                }
            }
        }

        // 2. NOCTURNE CINEMA TV PLAYER HUD OVERLAY (Unified CineViet Red Theme)
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                TvBackground.copy(alpha = 0.92f),
                                TvBackground.copy(alpha = 0.40f),
                                Color.Transparent,
                                TvBackground.copy(alpha = 0.60f),
                                TvBackground.copy(alpha = 0.96f)
                            )
                        )
                    )
                    .padding(start = 48.dp, end = 48.dp, top = 36.dp, bottom = 28.dp)
            ) {
                // TOP BAR: Metadata & Hardware Stream Diagnostics
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    // Left: Back button & Title block
                    Row(verticalAlignment = Alignment.Top) {
                        val backSource = remember { MutableInteractionSource() }
                        val isBackFocused by backSource.collectIsFocusedAsState()

                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(if (isBackFocused) CineVietRed else TvSurfaceHigh.copy(alpha = 0.8f))
                                .border(
                                    width = if (isBackFocused) 2.dp else 1.dp,
                                    color = if (isBackFocused) Color.White else Color.White.copy(alpha = 0.2f),
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
                                modifier = Modifier.size(24.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(20.dp))

                        Column {
                            // Engine badge & Episode tag
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(CineVietRed.copy(alpha = 0.25f))
                                        .padding(horizontal = 8.dp, vertical = 3.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(
                                            modifier = Modifier
                                                .size(6.dp)
                                                .clip(CircleShape)
                                                .background(CineVietRedLight)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "MEDIA3 • EXOPLAYER LIVE",
                                            color = CineVietRedLight,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            letterSpacing = 1.sp
                                        )
                                    }
                                }

                                val currentEpName = currentEpisode?.name ?: ""
                                if (currentEpName.isNotBlank()) {
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Text(
                                        text = currentEpName,
                                        color = TvOnSurfaceVariant,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(6.dp))

                            // Main Title
                            Text(
                                text = detailData?.movie?.name ?: "Đang phát...",
                                color = Color.White,
                                fontSize = 26.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            // Tech Badges Strip
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .background(CineVietRed.copy(alpha = 0.9f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "KKPhim VIP",
                                        color = Color.White,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .background(TvSurfaceHighest.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = detailData?.movie?.quality ?: "4K UHD",
                                        color = Color.White,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .background(TvSurfaceHighest.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "HDR10+",
                                        color = Color.White,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Box(
                                    modifier = Modifier
                                        .background(TvSurfaceHighest.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "DOLBY AUDIO",
                                        color = TvGold,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Right: Clock & Stream Status
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .background(TvSurfaceHigh.copy(alpha = 0.7f), RoundedCornerShape(20.dp))
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Schedule,
                                    contentDescription = "Giờ",
                                    tint = CineVietRedLight,
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = currentTimeString,
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        Box(
                            modifier = Modifier
                                .background(TvSurfaceHigh.copy(alpha = 0.7f), RoundedCornerShape(20.dp))
                                .padding(horizontal = 14.dp, vertical = 6.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF10B981))
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "TRỰC TIẾP",
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                // BOTTOM SECTION: Scrubber Bar & Media3 Command Bar
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                ) {
                    // 1. Time markers row
                    val remainingMs = (duration - currentPosition).coerceAtLeast(0L)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = formatPlayerTime(currentPosition),
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = " / ",
                                color = TvOnSurfaceVariant,
                                fontSize = 15.sp
                            )
                            Text(
                                text = formatPlayerTime(duration),
                                color = TvOnSurfaceVariant,
                                fontSize = 15.sp
                            )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.HourglassEmpty,
                                contentDescription = "Thời gian còn lại",
                                tint = TvOnSurfaceVariant,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "-${formatPlayerTime(remainingMs)} còn lại",
                                color = TvOnSurfaceVariant,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // 2. Scrubber Timeline with CineViet Red Gradient
                    val playheadFraction = if (duration > 0) (currentPosition.toFloat() / duration).coerceIn(0f, 1f) else 0f
                    val bufferFraction = if (duration > 0) (bufferedPosition.toFloat() / duration).coerceIn(0f, 1f) else 0f

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(16.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        // Inactive track
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(TvSurfaceHighest.copy(alpha = 0.8f))
                        )

                        // Buffered track
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(bufferFraction)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color.White.copy(alpha = 0.25f))
                        )

                        // Active Playhead Gradient
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(playheadFraction)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(CineVietRed, CineVietRedLight)
                                    )
                                )
                        )

                        // Glowing Pin Pointer
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(playheadFraction)
                                .wrapContentWidth(Alignment.End)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(16.dp)
                                    .clip(CircleShape)
                                    .background(Color.White)
                                    .border(3.dp, CineVietRed, CircleShape)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // 3. Command Action Bar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Left Control Pod
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            // Replay 10s
                            val rewindSource = remember { MutableInteractionSource() }
                            val isRewindFocused by rewindSource.collectIsFocusedAsState()
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .background(if (isRewindFocused) CineVietRed else TvSurfaceHigh.copy(alpha = 0.7f))
                                    .border(
                                        width = if (isRewindFocused) 2.5.dp else 1.dp,
                                        color = if (isRewindFocused) Color.White else Color.White.copy(alpha = 0.15f),
                                        shape = CircleShape
                                    )
                                    .focusable(interactionSource = rewindSource)
                                    .clickable(interactionSource = rewindSource, indication = null) {
                                        exoPlayer.seekTo((exoPlayer.currentPosition - 10000L).coerceAtLeast(0L))
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Replay10,
                                    contentDescription = "Lùi 10s",
                                    tint = Color.White,
                                    modifier = Modifier.size(24.dp)
                                )
                            }

                            // PRIMARY FOCUSED PLAY/PAUSE PILL
                            val playSource = remember { MutableInteractionSource() }
                            val isPlayFocused by playSource.collectIsFocusedAsState()
                            val playScale by animateFloatAsState(
                                targetValue = if (isPlayFocused) 1.10f else 1.0f,
                                animationSpec = tween(150),
                                label = "playBtnScale"
                            )

                            Box(
                                modifier = Modifier
                                    .focusRequester(playFocusRequester)
                                    .scale(playScale)
                                    .height(56.dp)
                                    .clip(RoundedCornerShape(28.dp))
                                    .background(
                                        if (isPlayFocused) {
                                            Brush.horizontalGradient(listOf(CineVietRed, CineVietRedLight))
                                        } else {
                                            Brush.horizontalGradient(listOf(CineVietRedDark, CineVietRed))
                                        }
                                    )
                                    .border(
                                        width = if (isPlayFocused) 2.5.dp else 0.dp,
                                        color = if (isPlayFocused) Color.White else Color.Transparent,
                                        shape = RoundedCornerShape(28.dp)
                                    )
                                    .padding(horizontal = 26.dp)
                                    .focusable(interactionSource = playSource)
                                    .clickable(interactionSource = playSource, indication = null) {
                                        if (isPlaying) exoPlayer.pause() else exoPlayer.play()
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                        contentDescription = "Play/Pause",
                                        tint = Color.White,
                                        modifier = Modifier.size(26.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = if (isPlaying) "TẠM DỪNG" else "TIẾP TỤC",
                                        color = Color.White,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 1.sp
                                    )
                                }
                            }

                            // Forward 10s
                            val fwdSource = remember { MutableInteractionSource() }
                            val isFwdFocused by fwdSource.collectIsFocusedAsState()
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(CircleShape)
                                    .background(if (isFwdFocused) CineVietRed else TvSurfaceHigh.copy(alpha = 0.7f))
                                    .border(
                                        width = if (isFwdFocused) 2.5.dp else 1.dp,
                                        color = if (isFwdFocused) Color.White else Color.White.copy(alpha = 0.15f),
                                        shape = CircleShape
                                    )
                                    .focusable(interactionSource = fwdSource)
                                    .clickable(interactionSource = fwdSource, indication = null) {
                                        exoPlayer.seekTo((exoPlayer.currentPosition + 10000L).coerceAtMost(duration))
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Forward10,
                                    contentDescription = "Tua 10s",
                                    tint = Color.White,
                                    modifier = Modifier.size(24.dp)
                                )
                            }

                            // Next Episode Button (if available)
                            if (nextEpisode != null) {
                                val nextSource = remember { MutableInteractionSource() }
                                val isNextFocused by nextSource.collectIsFocusedAsState()

                                Box(
                                    modifier = Modifier
                                        .height(48.dp)
                                        .clip(RoundedCornerShape(24.dp))
                                        .background(if (isNextFocused) CineVietRed else TvSurfaceHigh.copy(alpha = 0.7f))
                                        .border(
                                            width = if (isNextFocused) 2.dp else 1.dp,
                                            color = if (isNextFocused) Color.White else Color.White.copy(alpha = 0.15f),
                                            shape = RoundedCornerShape(24.dp)
                                        )
                                        .padding(horizontal = 18.dp)
                                        .focusable(interactionSource = nextSource)
                                        .clickable(interactionSource = nextSource, indication = null) {
                                            playEpisode(nextEpisode)
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.SkipNext,
                                            contentDescription = "Tập kế tiếp",
                                            tint = Color.White,
                                            modifier = Modifier.size(20.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "Tập tiếp: ${nextEpisode.name}",
                                            color = Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }
                        }

                        // Right Auxiliary Controls Pod: Episodes Drawer Toggle
                        val epsSource = remember { MutableInteractionSource() }
                        val isEpsFocused by epsSource.collectIsFocusedAsState()

                        Box(
                            modifier = Modifier
                                .height(48.dp)
                                .clip(RoundedCornerShape(24.dp))
                                .background(
                                    when {
                                        isEpsFocused -> CineVietRed
                                        showEpisodeDrawer -> TvSurfaceHighest
                                        else -> TvSurfaceHigh.copy(alpha = 0.7f)
                                    }
                                )
                                .border(
                                    width = if (isEpsFocused || showEpisodeDrawer) 2.dp else 1.dp,
                                    color = if (isEpsFocused || showEpisodeDrawer) CineVietRedLight else Color.White.copy(alpha = 0.15f),
                                    shape = RoundedCornerShape(24.dp)
                                )
                                .padding(horizontal = 18.dp)
                                .focusable(interactionSource = epsSource)
                                .clickable(interactionSource = epsSource, indication = null) {
                                    showEpisodeDrawer = !showEpisodeDrawer
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.ViewAgenda,
                                    contentDescription = "Danh sách tập",
                                    tint = if (showEpisodeDrawer) CineVietRedLight else Color.White,
                                    modifier = Modifier.size(19.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Danh Sách Tập (Nhấn ↓)",
                                    color = if (showEpisodeDrawer) CineVietRedLight else Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // 4. TV Living Room D-Pad Remote Legend
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(20.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "◀ / ▶ Tua ±10s",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "OK Tạm dừng / Phát",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "▼ Danh sách tập",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "BACK Thu gọn",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = "Media3 ExoPlayer v1.5",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                            Text(
                                text = "•",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp
                            )
                            Text(
                                text = "KKPhim Direct HLS",
                                color = CineVietRedLight,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            }
        }

        // 3. CENTER-RIGHT EPISODES DRAWER MODAL (Opens on DPAD_DOWN or Episodes click)
        AnimatedVisibility(
            visible = showEpisodeDrawer,
            enter = fadeIn() + slideInHorizontally { it / 2 },
            exit = fadeOut() + slideOutHorizontally { it / 2 },
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .fillMaxHeight()
                .width(420.dp)
                .padding(top = 28.dp, bottom = 28.dp, end = 32.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(24.dp))
                    .background(TvSurfaceContainer.copy(alpha = 0.96f))
                    .border(1.5.dp, CineVietRed.copy(alpha = 0.4f), RoundedCornerShape(24.dp))
                    .padding(24.dp)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.ViewAgenda,
                                contentDescription = "Tập phim",
                                tint = CineVietRedLight,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(
                                text = "Danh Sách Tập Phim",
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        val closeSource = remember { MutableInteractionSource() }
                        val isCloseFocused by closeSource.collectIsFocusedAsState()
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(if (isCloseFocused) CineVietRed else TvSurfaceHigh)
                                .focusable(interactionSource = closeSource)
                                .clickable(interactionSource = closeSource, indication = null) {
                                    showEpisodeDrawer = false
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Đóng",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "TỔNG CỘNG: ${currentEpisodes.size} TẬP · NGUỒN KKPHIM",
                        color = CineVietRedLight,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Episodes Column
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        items(currentEpisodes) { ep ->
                            val isCurrent = ep.slug == currentEpisode?.slug
                            val isInitialFocusTarget = isCurrent || (currentEpisode == null && ep == currentEpisodes.firstOrNull())
                            val epSource = remember { MutableInteractionSource() }
                            val isEpFocused by epSource.collectIsFocusedAsState()

                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .then(if (isInitialFocusTarget) Modifier.focusRequester(drawerFocusRequester) else Modifier)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(
                                        when {
                                            isEpFocused -> CineVietRed
                                            isCurrent -> CineVietRed.copy(alpha = 0.35f)
                                            else -> TvSurfaceHigh.copy(alpha = 0.6f)
                                        }
                                    )
                                    .border(
                                        width = if (isEpFocused) 2.5.dp else if (isCurrent) 1.5.dp else 1.dp,
                                        color = if (isEpFocused || isCurrent) CineVietRedLight else Color.White.copy(alpha = 0.08f),
                                        shape = RoundedCornerShape(14.dp)
                                    )
                                    .padding(horizontal = 16.dp, vertical = 12.dp)
                                    .focusable(interactionSource = epSource)
                                    .onKeyEvent { event ->
                                        if (event.type == androidx.compose.ui.input.key.KeyEventType.KeyDown) {
                                            if (event.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                                                event.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_BACK) {
                                                showEpisodeDrawer = false
                                                playFocusRequester.requestFocus()
                                                true
                                            } else false
                                        } else false
                                    }
                                    .clickable(interactionSource = epSource, indication = null) {
                                        playEpisode(ep)
                                        showEpisodeDrawer = false
                                        playFocusRequester.requestFocus()
                                    }
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = ep.name,
                                                color = Color.White,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                            if (isCurrent) {
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Box(
                                                    modifier = Modifier
                                                        .background(CineVietRed, RoundedCornerShape(4.dp))
                                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                                ) {
                                                    Text(
                                                        text = "ĐANG PHÁT",
                                                        color = Color.White,
                                                        fontSize = 9.sp,
                                                        fontWeight = FontWeight.Black
                                                    )
                                                }
                                            }
                                        }

                                        val filename = ep.filename ?: ""
                                        if (filename.isNotBlank()) {
                                            Spacer(modifier = Modifier.height(2.dp))
                                            Text(
                                                text = filename,
                                                color = TvOnSurfaceVariant,
                                                fontSize = 11.sp,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }

                                    Icon(
                                        imageVector = if (isCurrent) Icons.Default.GraphicEq else Icons.Default.PlayCircle,
                                        contentDescription = null,
                                        tint = if (isCurrent) CineVietRedLight else Color.White.copy(alpha = 0.6f),
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))
                    Text(
                        text = "Phím D-PAD để chọn tập • BACK để đóng",
                        color = TvOnSurfaceVariant,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}

private fun formatPlayerTime(timeMs: Long): String {
    val totalSeconds = (timeMs / 1000).coerceAtLeast(0L)
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
        String.format("%02d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format("%02d:%02d", minutes, seconds)
    }
}
