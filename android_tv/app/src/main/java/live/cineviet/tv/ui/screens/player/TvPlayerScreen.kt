package live.cineviet.tv.ui.screens.player

import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FastForward
import androidx.compose.material.icons.filled.FastRewind
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import live.cineviet.tv.ui.components.TvLoadingSpinner
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.cineviet.tv.data.models.EpisodeItem
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.theme.*

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
    var currentPosition by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var isBuffering by remember { mutableStateOf(true) }

    // Controls visibility state (Auto hide after 3 seconds)
    var showControls by remember { mutableStateOf(true) }
    var showEpisodeDrawer by remember { mutableStateOf(false) }

    // Fast-Forward & Rewind state (continuous seek on key hold)
    var isSeekingContinuous by remember { mutableStateOf(false) }
    var continuousSeekDelta by remember { mutableStateOf(0L) } // in seconds

    val playerFocusRequester = remember { FocusRequester() }

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
            exoPlayer.release()
        }
    }

    // Function to play episode
    fun playEpisode(ep: EpisodeItem) {
        currentEpisode = ep
        val streamUrl = ep.linkM3u8 ?: ep.linkEmbed ?: ""
        if (streamUrl.isNotBlank()) {
            val mediaItem = MediaItem.fromUri(streamUrl)
            exoPlayer.setMediaItem(mediaItem)
            exoPlayer.prepare()
            exoPlayer.play()
        }
    }

    // Load Movie Details & choose episode
    LaunchedEffect(slug) {
        isLoadingMovie = true
        val result = repository.getMovieDetail(slug)
        result.onSuccess { data ->
            detailData = data
            isLoadingMovie = false

            val server = data.episodes.getOrNull(serverIndex) ?: data.episodes.firstOrNull()
            val ep = if (!initialEpisodeSlug.isNullOrBlank()) {
                server?.serverData?.find { it.slug == initialEpisodeSlug } ?: server?.serverData?.firstOrNull()
            } else {
                server?.serverData?.firstOrNull()
            }

            if (ep != null) {
                playEpisode(ep)
            }
        }.onFailure {
            isLoadingMovie = false
        }
    }

    // Periodic time tracker (every 500ms)
    LaunchedEffect(exoPlayer) {
        while (true) {
            if (exoPlayer.isPlaying) {
                currentPosition = exoPlayer.currentPosition.coerceAtLeast(0L)
                duration = exoPlayer.duration.coerceAtLeast(0L)
            }
            delay(500)
        }
    }

    // Auto-hide controls after 3 seconds of inactivity
    LaunchedEffect(showControls, isPlaying) {
        if (showControls && isPlaying && !showEpisodeDrawer && !isSeekingContinuous) {
            delay(3000)
            showControls = false
        }
    }

    // Auto-focus player view to capture TV remote D-pad events
    LaunchedEffect(Unit) {
        delay(200)
        try {
            playerFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(playerFocusRequester)
            .focusable()
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                            if (!showControls) {
                                showControls = true
                            } else {
                                if (isPlaying) exoPlayer.pause() else exoPlayer.play()
                            }
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            // Down arrow: Show episode list overlay
                            showControls = true
                            showEpisodeDrawer = !showEpisodeDrawer
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_UP -> {
                            showControls = true
                            showEpisodeDrawer = false
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_RIGHT -> {
                            showControls = true
                            val repeatCount = keyEvent.nativeKeyEvent.repeatCount
                            if (repeatCount > 0) {
                                // Continuous seek (Holding button)
                                isSeekingContinuous = true
                                continuousSeekDelta += (10L * (1 + repeatCount / 4))
                            } else {
                                // Single tap: +10s
                                continuousSeekDelta += 10L
                            }
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_LEFT -> {
                            showControls = true
                            val repeatCount = keyEvent.nativeKeyEvent.repeatCount
                            if (repeatCount > 0) {
                                // Continuous seek backwards (Holding button)
                                isSeekingContinuous = true
                                continuousSeekDelta -= (10L * (1 + repeatCount / 4))
                            } else {
                                // Single tap: -10s
                                continuousSeekDelta -= 10L
                            }
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_BACK -> {
                            if (showEpisodeDrawer) {
                                showEpisodeDrawer = false
                                return@onKeyEvent true
                            }
                            if (showControls) {
                                showControls = false
                                return@onKeyEvent true
                            }
                            onBack()
                            return@onKeyEvent true
                        }
                    }
                } else if (keyEvent.type == KeyEventType.KeyUp) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_LEFT -> {
                            // Released: apply target seek position
                            if (continuousSeekDelta != 0L) {
                                val target = (exoPlayer.currentPosition + continuousSeekDelta * 1000L)
                                    .coerceIn(0L, duration)
                                exoPlayer.seekTo(target)
                                currentPosition = target
                                continuousSeekDelta = 0L
                                isSeekingContinuous = false
                            }
                            return@onKeyEvent true
                        }
                    }
                }
                false
            }
    ) {
        // Native Media3 PlayerView
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Buffering Spinner
        if (isBuffering) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                TvLoadingSpinner(color = CineVietRed)
            }
        }

        // Continuous Seek Indicator Overlay (Holding button feedback)
        if (continuousSeekDelta != 0L) {
            val isFwd = continuousSeekDelta > 0
            val targetTime = (currentPosition + continuousSeekDelta * 1000L).coerceIn(0L, duration)
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(Color.Black.copy(alpha = 0.85f), RoundedCornerShape(16.dp))
                    .padding(horizontal = 28.dp, vertical = 20.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = if (isFwd) Icons.Default.FastForward else Icons.Default.FastRewind,
                        contentDescription = "Seek",
                        tint = CineVietRed,
                        modifier = Modifier.size(44.dp)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "${if (isFwd) "+" else ""}${continuousSeekDelta}s",
                        color = Color.White,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = "Nhảy đến: ${formatPlayerTime(targetTime)}",
                        color = TvOnSurfaceVariant,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // TV CONTROLS OVERLAY (Auto hides after 3 seconds)
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                // Top Gradient Bar
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp)
                        .align(Alignment.TopCenter)
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Black.copy(alpha = 0.9f), Color.Transparent)
                            )
                        )
                        .padding(horizontal = 36.dp, vertical = 24.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val backSource = remember { MutableInteractionSource() }
                        val isBackFocused by backSource.collectIsFocusedAsState()

                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(if (isBackFocused) CineVietRed else Color.Black.copy(alpha = 0.6f))
                                .border(1.5.dp, if (isBackFocused) Color.White else Color.White.copy(alpha = 0.2f), CircleShape)
                                .focusable(interactionSource = backSource)
                                .clickable(interactionSource = backSource, indication = null) { onBack() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.ArrowBack,
                                contentDescription = "Thoát",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(16.dp))

                        Column {
                            Text(
                                text = detailData?.movie?.name ?: "",
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                            currentEpisode?.let { ep ->
                                Text(
                                    text = "Đang phát: ${ep.name}",
                                    color = TvOnSurfaceVariant,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }
                }

                // Bottom Gradient Bar & Scrubber
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color.Black.copy(alpha = 0.95f))
                            )
                        )
                        .padding(horizontal = 36.dp, vertical = 24.dp)
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        // Time Scrubber Progress Bar
                        val progress = if (duration > 0) (currentPosition.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color.White.copy(alpha = 0.2f))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(fraction = progress)
                                    .fillMaxHeight()
                                    .background(CineVietRed)
                            )
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "${formatPlayerTime(currentPosition)} / ${formatPlayerTime(duration)}",
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )

                            Text(
                                text = "Bấm phím XUỐNG để chọn tập · GIỮ phím PHẢI/TRÁI để tua liên tục",
                                color = TvOnSurfaceVariant.copy(alpha = 0.8f),
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }

        // EPISODE SELECTION DRAWER OVERLAY (Activated by pressing DPAD_DOWN)
        AnimatedVisibility(
            visible = showEpisodeDrawer,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.Black.copy(alpha = 0.92f))
                    .padding(horizontal = 36.dp, vertical = 20.dp)
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Chọn Tập Phim",
                            color = Color.White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Bấm LÊN hoặc BACK để đóng danh sách",
                            color = TvOnSurfaceVariant,
                            fontSize = 11.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    val serverEps = detailData?.episodes?.getOrNull(serverIndex)?.serverData ?: emptyList()
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(serverEps) { ep ->
                            val isCurrent = ep.slug == currentEpisode?.slug
                            val itemSource = remember { MutableInteractionSource() }
                            val isFocused by itemSource.collectIsFocusedAsState()

                            Box(
                                modifier = Modifier
                                    .width(96.dp)
                                    .height(44.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        when {
                                            isFocused -> Color.White
                                            isCurrent -> CineVietRed
                                            else -> TvSurfaceHigh
                                        }
                                    )
                                    .border(
                                        1.5.dp,
                                        if (isFocused) CineVietRed else Color.Transparent,
                                        RoundedCornerShape(8.dp)
                                    )
                                    .focusable(interactionSource = itemSource)
                                    .clickable(interactionSource = itemSource, indication = null) {
                                        playEpisode(ep)
                                        showEpisodeDrawer = false
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = ep.name,
                                    color = if (isFocused) Color.Black else Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = if (isCurrent || isFocused) FontWeight.Bold else FontWeight.Normal
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatPlayerTime(millis: Long): String {
    val totalSeconds = (millis / 1000).coerceAtLeast(0)
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return if (h > 0) {
        String.format("%d:%02d:%02d", h, m, s)
    } else {
        String.format("%02d:%02d", m, s)
    }
}
