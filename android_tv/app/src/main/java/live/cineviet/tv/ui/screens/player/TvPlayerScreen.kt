package live.cineviet.tv.ui.screens.player

import android.annotation.SuppressLint
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.cineviet.tv.data.models.EpisodeItem
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*

@SuppressLint("SetJavaScriptEnabled")
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
    var selectedServerIndex by remember { mutableStateOf(serverIndex) }
    var isLoadingMovie by remember { mutableStateOf(true) }

    // Stream playback mode: Native ExoPlayer vs Embed WebView (for NguonC streamc)
    var isEmbedMode by remember { mutableStateOf(false) }
    var activeEmbedUrl by remember { mutableStateOf("") }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    // ExoPlayer state
    var isPlaying by remember { mutableStateOf(true) }
    var isBuffering by remember { mutableStateOf(true) }
    var currentPosition by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }

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
            webViewInstance?.apply {
                loadUrl("about:blank")
                stopLoading()
                destroy()
            }
        }
    }

    // Resolve direct HLS stream or embed URL
    fun resolveStream(ep: EpisodeItem): Pair<String?, String?> {
        val m3u8 = ep.linkM3u8?.trim() ?: ""
        if (m3u8.isNotBlank() && (m3u8.contains(".m3u8") || m3u8.startsWith("http"))) {
            return Pair(m3u8, null)
        }

        val embed = ep.linkEmbed?.trim() ?: ""

        // Check Song Ngữ ViCDN: /embed/vicdn/tv-307478-1-1
        if (embed.contains("vicdn")) {
            val videoId = Regex("vicdn/([^/?#]+)").find(embed)?.groupValues?.get(1)
            if (!videoId.isNullOrBlank()) {
                val directHls = "https://cineviet.live/api/stream/vicdn/$videoId/master.m3u8"
                return Pair(directHls, null)
            }
        }

        // Check if embed query parameter points to m3u8
        if (embed.contains(".m3u8")) {
            val regex = Regex("(?:url|file)=([^&]+)")
            val match = regex.find(embed)?.groupValues?.get(1)
            if (!match.isNullOrBlank()) {
                val decoded = java.net.URLDecoder.decode(match, "UTF-8")
                return Pair(decoded, null)
            }
        }

        // Otherwise: Fallback to embed WebView (NguonC / iframe)
        val finalEmbed = if (embed.startsWith("/")) "https://cineviet.live$embed" else embed
        return Pair(null, finalEmbed)
    }

    // Function to play episode
    fun playEpisode(ep: EpisodeItem) {
        currentEpisode = ep
        val (hlsStream, embedUrl) = resolveStream(ep)

        if (!hlsStream.isNullOrBlank()) {
            isEmbedMode = false
            activeEmbedUrl = ""
            webViewInstance?.loadUrl("about:blank")

            val mediaItem = MediaItem.fromUri(hlsStream)
            exoPlayer.setMediaItem(mediaItem)
            exoPlayer.prepare()
            exoPlayer.play()
        } else if (!embedUrl.isNullOrBlank()) {
            isEmbedMode = true
            activeEmbedUrl = embedUrl
            exoPlayer.stop()
            isBuffering = false

            val headers = HashMap<String, String>()
            if (embedUrl.contains("streamc") || embedUrl.contains("nguonc")) {
                headers["Referer"] = "https://phim.nguonc.com/"
            } else {
                headers["Referer"] = "https://cineviet.live/"
            }
            webViewInstance?.loadUrl(embedUrl, headers)
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

    // Periodic time tracker (every 500ms) for ExoPlayer
    LaunchedEffect(exoPlayer, isEmbedMode) {
        while (!isEmbedMode) {
            if (exoPlayer.isPlaying) {
                currentPosition = exoPlayer.currentPosition.coerceAtLeast(0L)
                duration = exoPlayer.duration.coerceAtLeast(0L)
            }
            delay(500)
        }
    }

    // Auto-hide controls after 3 seconds of inactivity
    LaunchedEffect(showControls, isPlaying, isEmbedMode) {
        if (showControls && !showEpisodeDrawer && !isSeekingContinuous) {
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
                                if (isEmbedMode) {
                                    webViewInstance?.evaluateJavascript(
                                        "var v=document.querySelector('video'); if(v){if(v.paused) v.play(); else v.pause();}",
                                        null
                                    )
                                } else {
                                    if (isPlaying) exoPlayer.pause() else exoPlayer.play()
                                }
                            }
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_DOWN -> {
                            showControls = true
                            showEpisodeDrawer = !showEpisodeDrawer
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_UP -> {
                            showControls = true
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                            if (!isEmbedMode && !showEpisodeDrawer) {
                                showControls = true
                                isSeekingContinuous = true
                                continuousSeekDelta += 10L
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            if (!isEmbedMode && !showEpisodeDrawer) {
                                showControls = true
                                isSeekingContinuous = true
                                continuousSeekDelta -= 10L
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                            if (showEpisodeDrawer) {
                                showEpisodeDrawer = false
                                return@onKeyEvent true
                            }
                            onBack()
                            return@onKeyEvent true
                        }
                    }
                } else if (keyEvent.type == KeyEventType.KeyUp) {
                    when (keyEvent.nativeKeyEvent.keyCode) {
                        KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_LEFT,
                        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            if (!isEmbedMode && isSeekingContinuous && continuousSeekDelta != 0L) {
                                val target = (currentPosition + continuousSeekDelta * 1000L).coerceIn(0L, duration)
                                exoPlayer.seekTo(target)
                                continuousSeekDelta = 0L
                                isSeekingContinuous = false
                                return@onKeyEvent true
                            }
                        }
                    }
                }
                false
            }
    ) {
        // VIDEO PLAYER LAYER: Native ExoPlayer vs WebView Embed (for NguonC)
        if (isEmbedMode) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        settings.allowFileAccess = true
                        settings.databaseEnabled = true
                        settings.userAgentString = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                return false
                            }
                        }

                        webViewInstance = this

                        if (activeEmbedUrl.isNotBlank()) {
                            val headers = HashMap<String, String>()
                            if (activeEmbedUrl.contains("streamc") || activeEmbedUrl.contains("nguonc")) {
                                headers["Referer"] = "https://phim.nguonc.com/"
                            } else {
                                headers["Referer"] = "https://cineviet.live/"
                            }
                            loadUrl(activeEmbedUrl, headers)
                        }
                    }
                },
                update = { wv ->
                    if (activeEmbedUrl.isNotBlank() && wv.url != activeEmbedUrl) {
                        val headers = HashMap<String, String>()
                        if (activeEmbedUrl.contains("streamc") || activeEmbedUrl.contains("nguonc")) {
                            headers["Referer"] = "https://phim.nguonc.com/"
                        } else {
                            headers["Referer"] = "https://cineviet.live/"
                        }
                        wv.loadUrl(activeEmbedUrl, headers)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        } else {
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
        }

        // Buffering Spinner
        if (isBuffering && !isEmbedMode) {
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
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(if (isBackFocused) CineVietRed else Color.Black.copy(alpha = 0.6f))
                                .border(1.5.dp, if (isBackFocused) Color.White else Color.White.copy(alpha = 0.2f), CircleShape)
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

                        Column {
                            Text(
                                text = detailData?.movie?.name ?: "Đang tải...",
                                color = Color.White,
                                fontSize = 20.sp,
                                fontWeight = FontWeight.Bold
                            )
                            val epName = currentEpisode?.name ?: ""
                            val sName = detailData?.episodes?.getOrNull(selectedServerIndex)?.serverName ?: ""
                            Text(
                                text = listOfNotNull(
                                    sName.takeIf { it.isNotBlank() },
                                    epName.takeIf { it.isNotBlank() },
                                    if (isEmbedMode) "Nguồn Web Embed" else "HLS Chuẩn Rạp"
                                ).joinToString(" · "),
                                color = TvOnSurfaceVariant,
                                fontSize = 13.sp
                            )
                        }
                    }
                }

                // Bottom Gradient Controls Bar
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(130.dp)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color.Black.copy(alpha = 0.92f))
                            )
                        )
                        .padding(horizontal = 36.dp, vertical = 20.dp)
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.Bottom
                    ) {
                        // Playback Progress Bar (for ExoPlayer)
                        if (!isEmbedMode) {
                            val progress = if (duration > 0) (currentPosition.toFloat() / duration).coerceIn(0f, 1f) else 0f
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(5.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(Color.White.copy(alpha = 0.2f))
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(progress)
                                        .fillMaxHeight()
                                        .background(CineVietRed)
                                )
                            }

                            Spacer(modifier = Modifier.height(10.dp))
                        }

                        // Bottom Actions Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val playPauseSource = remember { MutableInteractionSource() }
                                val isPlayPauseFocused by playPauseSource.collectIsFocusedAsState()

                                Box(
                                    modifier = Modifier
                                        .size(40.dp)
                                        .clip(CircleShape)
                                        .background(if (isPlayPauseFocused) CineVietRed else Color.Black.copy(alpha = 0.6f))
                                        .border(1.5.dp, if (isPlayPauseFocused) Color.White else Color.White.copy(alpha = 0.2f), CircleShape)
                                        .focusable(interactionSource = playPauseSource)
                                        .clickable(interactionSource = playPauseSource, indication = null) {
                                            if (isEmbedMode) {
                                                webViewInstance?.evaluateJavascript(
                                                    "var v=document.querySelector('video'); if(v){if(v.paused) v.play(); else v.pause();}",
                                                    null
                                                )
                                            } else {
                                                if (isPlaying) exoPlayer.pause() else exoPlayer.play()
                                            }
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                        contentDescription = "Play/Pause",
                                        tint = Color.White,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }

                                Spacer(modifier = Modifier.width(16.dp))

                                if (!isEmbedMode) {
                                    Text(
                                        text = "${formatPlayerTime(currentPosition)} / ${formatPlayerTime(duration)}",
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                } else {
                                    Text(
                                        text = "Đang phát qua trình nhúng NguonC",
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }

                            // Quick Episode Switch Hint
                            val drawerSource = remember { MutableInteractionSource() }
                            val isDrawerFocused by drawerSource.collectIsFocusedAsState()

                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isDrawerFocused) CineVietRed else TvSurfaceHigh)
                                    .border(1.dp, if (isDrawerFocused) Color.White else Color.White.copy(alpha = 0.15f), RoundedCornerShape(8.dp))
                                    .focusable(interactionSource = drawerSource)
                                    .clickable(interactionSource = drawerSource, indication = null) {
                                        showEpisodeDrawer = !showEpisodeDrawer
                                    }
                                    .padding(horizontal = 14.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = "Danh Sách Tập (Nhấn ↓)",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }

        // QUICK EPISODE SELECTION DRAWER (Opens on DPAD_DOWN)
        AnimatedVisibility(
            visible = showEpisodeDrawer,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 20.dp)
        ) {
            val episodes = detailData?.episodes?.getOrNull(selectedServerIndex)?.serverData ?: emptyList()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 32.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF0F121C).copy(alpha = 0.96f))
                    .border(1.5.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(16.dp))
                    .padding(horizontal = 24.dp, vertical = 18.dp)
            ) {
                Column {
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
                            text = "Nhấn Phím Xuống/Quay lại để đóng",
                            color = TvOnSurfaceVariant,
                            fontSize = 11.sp
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        items(episodes) { ep ->
                            val isCurrent = ep.slug == currentEpisode?.slug
                            val epSource = remember { MutableInteractionSource() }
                            val isEpFocused by epSource.collectIsFocusedAsState()

                            Box(
                                modifier = Modifier
                                    .width(88.dp)
                                    .height(44.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        when {
                                            isEpFocused -> Color.White
                                            isCurrent -> CineVietRed
                                            else -> TvSurfaceHigh
                                        }
                                    )
                                    .border(
                                        width = if (isEpFocused) 2.dp else 1.dp,
                                        color = if (isEpFocused) CineVietRed else Color.Transparent,
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                    .focusable(interactionSource = epSource)
                                    .clickable(interactionSource = epSource, indication = null) {
                                        playEpisode(ep)
                                        showEpisodeDrawer = false
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = ep.name,
                                    color = if (isEpFocused) Color.Black else Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
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
