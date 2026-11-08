package live.cineviet.tv.ui.screens.player

import android.annotation.SuppressLint
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import live.cineviet.tv.data.models.EpisodeItem
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class AudioTrackItem(
    val groupIndex: Int,
    val trackIndex: Int,
    val name: String,
    val language: String,
    val isSelected: Boolean,
    val directUrl: String? = null
)

enum class PlayerDrawerType {
    NONE,
    AUDIO_SUBTITLE,
    EPISODES,
    SERVERS
}

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

    var detailData by remember { mutableStateOf<MovieDetailData?>(null) }
    var currentEpisode by remember { mutableStateOf<EpisodeItem?>(null) }
    var selectedServerIndex by remember { mutableStateOf(serverIndex) }
    var isLoadingMovie by remember { mutableStateOf(true) }

    // Stream playback mode: Native ExoPlayer vs Embed WebView (for NguonC)
    var isEmbedMode by remember { mutableStateOf(false) }
    var activeEmbedUrl by remember { mutableStateOf("") }
    var webViewInstance by remember { mutableStateOf<WebView?>(null) }

    // ExoPlayer state
    var isPlaying by remember { mutableStateOf(true) }
    var isBuffering by remember { mutableStateOf(true) }
    var currentPosition by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var bufferedPosition by remember { mutableStateOf(0L) }

    // Real audio tracks
    var availableAudioTracks by remember { mutableStateOf<List<AudioTrackItem>>(emptyList()) }
    var selectedAudioTrackName by remember { mutableStateOf("Audio Gốc") }

    // Active Drawer and Controls Visibility
    var showControls by remember { mutableStateOf(true) }
    var activeDrawer by remember { mutableStateOf(PlayerDrawerType.NONE) }

    // Fast-Forward & Rewind state (continuous seek on key hold)
    var isSeekingContinuous by remember { mutableStateOf(false) }
    var continuousSeekDelta by remember { mutableStateOf(0L) }

    // Current clock time string
    var currentTimeString by remember {
        mutableStateOf(SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date()))
    }

    val playerFocusRequester = remember { FocusRequester() }

    // Native ExoPlayer instance
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

                override fun onTracksChanged(tracks: Tracks) {
                    val tracksList = mutableListOf<AudioTrackItem>()
                    for (gIndex in 0 until tracks.groups.size) {
                        val group = tracks.groups[gIndex]
                        if (group.type == C.TRACK_TYPE_AUDIO) {
                            for (tIndex in 0 until group.length) {
                                val format = group.getTrackFormat(tIndex)
                                val label = format.label ?: format.language ?: "Audio ${tIndex + 1}"
                                val isSelected = group.isTrackSelected(tIndex)
                                if (isSelected) {
                                    selectedAudioTrackName = label
                                }
                                tracksList.add(
                                    AudioTrackItem(
                                        groupIndex = gIndex,
                                        trackIndex = tIndex,
                                        name = label,
                                        language = format.language ?: "vi",
                                        isSelected = isSelected
                                    )
                                )
                            }
                        }
                    }
                    if (tracksList.isNotEmpty()) {
                        availableAudioTracks = tracksList
                    }
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

        // Check if embed query parameter contains direct m3u8 link
        if (embed.contains(".m3u8")) {
            val regex = Regex("(?:url|file)=([^&]+)")
            val match = regex.find(embed)?.groupValues?.get(1)
            if (!match.isNullOrBlank()) {
                val decoded = java.net.URLDecoder.decode(match, "UTF-8")
                return Pair(decoded, null)
            }
        }

        // Fallback to embed WebView (NguonC / iframe)
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

            // Prepare default ViCDN multi-audio tracks if this is a ViCDN stream
            if (hlsStream.contains("/api/stream/vicdn/")) {
                val videoId = Regex("vicdn/([^/?#]+)/master").find(hlsStream)?.groupValues?.get(1)
                if (!videoId.isNullOrBlank()) {
                    availableAudioTracks = listOf(
                        AudioTrackItem(
                            groupIndex = 0,
                            trackIndex = 0,
                            name = "Audio Gốc",
                            language = "original",
                            isSelected = true,
                            directUrl = "https://cineviet.live/api/stream/vicdn/$videoId/original.m3u8"
                        ),
                        AudioTrackItem(
                            groupIndex = 0,
                            trackIndex = 1,
                            name = "Thuyết Minh Nữ",
                            language = "female",
                            isSelected = false,
                            directUrl = "https://cineviet.live/api/stream/vicdn/$videoId/female.m3u8"
                        ),
                        AudioTrackItem(
                            groupIndex = 0,
                            trackIndex = 2,
                            name = "Thuyết Minh Nam",
                            language = "male",
                            isSelected = false,
                            directUrl = "https://cineviet.live/api/stream/vicdn/$videoId/male.m3u8"
                        )
                    )
                }
            }
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

    // Function to switch audio track on ExoPlayer
    fun selectAudioTrack(track: AudioTrackItem) {
        selectedAudioTrackName = track.name
        availableAudioTracks = availableAudioTracks.map {
            it.copy(isSelected = it.name == track.name)
        }

        try {
            if (track.groupIndex < exoPlayer.currentTracks.groups.size) {
                val group = exoPlayer.currentTracks.groups[track.groupIndex]
                val override = TrackSelectionOverride(group.mediaTrackGroup, listOf(track.trackIndex))
                exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                    .buildUpon()
                    .setOverrideForType(override)
                    .build()
            } else if (!track.directUrl.isNullOrBlank()) {
                val savedPos = exoPlayer.currentPosition
                val mediaItem = MediaItem.fromUri(track.directUrl)
                exoPlayer.setMediaItem(mediaItem)
                exoPlayer.prepare()
                exoPlayer.seekTo(savedPos)
                exoPlayer.play()
            }
        } catch (_: Exception) {}
    }

    // Load Movie Details & choose initial episode
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

    // Periodic time tracker & clock update (every 500ms)
    LaunchedEffect(exoPlayer, isEmbedMode) {
        while (!isEmbedMode) {
            if (exoPlayer.isPlaying) {
                currentPosition = exoPlayer.currentPosition.coerceAtLeast(0L)
                duration = exoPlayer.duration.coerceAtLeast(0L)
                bufferedPosition = exoPlayer.bufferedPosition.coerceAtLeast(0L)
            }
            currentTimeString = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            delay(500)
        }
    }

    // Auto-hide controls after 4 seconds of inactivity if no drawer is active
    LaunchedEffect(showControls, isPlaying, isEmbedMode, activeDrawer) {
        if (showControls && activeDrawer == PlayerDrawerType.NONE && !isSeekingContinuous) {
            delay(4000)
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

    // Determine current episodes list & next episode
    val currentEpisodes = detailData?.episodes?.getOrNull(selectedServerIndex)?.serverData ?: emptyList()
    val currentEpIndex = currentEpisodes.indexOfFirst { it.slug == currentEpisode?.slug }
    val nextEpisode = if (currentEpIndex != -1 && currentEpIndex + 1 < currentEpisodes.size) {
        currentEpisodes[currentEpIndex + 1]
    } else null

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
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
                            activeDrawer = if (activeDrawer == PlayerDrawerType.EPISODES) PlayerDrawerType.NONE else PlayerDrawerType.EPISODES
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_UP -> {
                            showControls = true
                            activeDrawer = if (activeDrawer == PlayerDrawerType.AUDIO_SUBTITLE) PlayerDrawerType.NONE else PlayerDrawerType.AUDIO_SUBTITLE
                            return@onKeyEvent true
                        }

                        KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                            if (!isEmbedMode && activeDrawer == PlayerDrawerType.NONE) {
                                showControls = true
                                isSeekingContinuous = true
                                continuousSeekDelta += 10L
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                            if (!isEmbedMode && activeDrawer == PlayerDrawerType.NONE) {
                                showControls = true
                                isSeekingContinuous = true
                                continuousSeekDelta -= 10L
                                return@onKeyEvent true
                            }
                        }

                        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> {
                            if (activeDrawer != PlayerDrawerType.NONE) {
                                activeDrawer = PlayerDrawerType.NONE
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
        // 1. VIDEO VIEW CANVAS (Native ExoPlayer vs Android WebView for NguonC)
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
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
                        settings.userAgentString = "Mozilla/5.0 (Linux; Android 12; SMART TV Build/STV.2023) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

                        // Enable Third-party Cookies for Cloudflare / StreamC embeds
                        val cookieManager = CookieManager.getInstance()
                        cookieManager.setAcceptCookie(true)
                        cookieManager.setAcceptThirdPartyCookies(this, true)

                        webChromeClient = WebChromeClient()
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                return false
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                // Autoplay and audio unmuting helper for embed players
                                view?.evaluateJavascript(
                                    """
                                    (function() {
                                        function tryPlay() {
                                            var v = document.querySelector('video');
                                            if (v) {
                                                v.muted = false;
                                                v.play().catch(function(){});
                                            }
                                            var btn = document.querySelector('.jw-display-icon-display') || 
                                                      document.querySelector('button[aria-label="Play"]') || 
                                                      document.querySelector('.play-btn');
                                            if (btn) btn.click();
                                        }
                                        setTimeout(tryPlay, 600);
                                        setTimeout(tryPlay, 1800);
                                    })();
                                    """.trimIndent(),
                                    null
                                )
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

        // Buffering Spinner with Nocturne Cinema Glow
        if (isBuffering && !isEmbedMode) {
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
                    TvLoadingSpinner(color = CyberCyan)
                    Spacer(modifier = Modifier.height(14.dp))
                    Text(
                        text = "Đang đệm luồng phát Media3...",
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
                    .border(1.5.dp, CyberCyan.copy(alpha = 0.6f), RoundedCornerShape(20.dp))
                    .padding(horizontal = 36.dp, vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = if (isFwd) Icons.Default.FastForward else Icons.Default.FastRewind,
                        contentDescription = "Tua",
                        tint = CyberCyan,
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

        // 2. NOCTURNE CINEMA TV PLAYER HUD OVERLAY (Auto-hides after 4s)
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
                                .background(if (isBackFocused) ElectricViolet else TvSurfaceHigh.copy(alpha = 0.8f))
                                .border(
                                    width = if (isBackFocused) 2.5.dp else 1.dp,
                                    color = if (isBackFocused) CyberCyan else Color.White.copy(alpha = 0.2f),
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
                                        .background(ElectricViolet.copy(alpha = 0.35f))
                                        .padding(horizontal = 8.dp, vertical = 3.dp)
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(
                                            modifier = Modifier
                                                .size(6.dp)
                                                .clip(CircleShape)
                                                .background(CyberCyan)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = if (isEmbedMode) "WEB EMBED • NGUONC" else "MEDIA3 • EXOPLAYER LIVE",
                                            color = CyberCyan,
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
                                val sName = detailData?.episodes?.getOrNull(selectedServerIndex)?.serverName ?: "Server Chính"
                                Box(
                                    modifier = Modifier
                                        .background(TvSurfaceHighest.copy(alpha = 0.7f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 7.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = sName,
                                        color = CyberCyan,
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
                                        color = CyberCyan,
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
                                        text = "DOLBY ATMOS",
                                        color = ElectricViolet,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    // Right: Telemetry & Ambient Clock
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
                                    tint = CyberCyan,
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
                                    text = if (isEmbedMode) "NHÚNG WEB" else "TRỰC TIẾP",
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
                    if (!isEmbedMode) {
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

                        // 2. Nocturne Scrubber Timeline with Cyan/Violet Glow
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
                                            listOf(ElectricViolet, CyberCyan)
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
                                        .border(3.dp, CyberCyan, CircleShape)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))
                    }

                    // 3. Command Action Bar (Nocturne Cinema Pods)
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
                                    .background(if (isRewindFocused) ElectricViolet else TvSurfaceHigh.copy(alpha = 0.7f))
                                    .border(
                                        width = if (isRewindFocused) 2.5.dp else 1.dp,
                                        color = if (isRewindFocused) CyberCyan else Color.White.copy(alpha = 0.15f),
                                        shape = CircleShape
                                    )
                                    .focusable(interactionSource = rewindSource)
                                    .clickable(interactionSource = rewindSource, indication = null) {
                                        if (!isEmbedMode) {
                                            exoPlayer.seekTo((exoPlayer.currentPosition - 10000L).coerceAtLeast(0L))
                                        }
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
                            val playScale by androidx.compose.animation.core.animateFloatAsState(
                                targetValue = if (isPlayFocused) 1.10f else 1.0f,
                                animationSpec = androidx.compose.animation.core.tween(160),
                                label = "playBtnScale"
                            )

                            Box(
                                modifier = Modifier
                                    .scale(playScale)
                                    .height(56.dp)
                                    .clip(RoundedCornerShape(28.dp))
                                    .background(
                                        if (isPlayFocused) {
                                            Brush.horizontalGradient(listOf(ElectricViolet, CyberCyan))
                                        } else {
                                            Brush.horizontalGradient(listOf(CineVietRed, ElectricViolet))
                                        }
                                    )
                                    .border(
                                        width = if (isPlayFocused) 3.dp else 0.dp,
                                        color = if (isPlayFocused) Color.White else Color.Transparent,
                                        shape = RoundedCornerShape(28.dp)
                                    )
                                    .padding(horizontal = 24.dp)
                                    .focusable(interactionSource = playSource)
                                    .clickable(interactionSource = playSource, indication = null) {
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
                                    .background(if (isFwdFocused) ElectricViolet else TvSurfaceHigh.copy(alpha = 0.7f))
                                    .border(
                                        width = if (isFwdFocused) 2.5.dp else 1.dp,
                                        color = if (isFwdFocused) CyberCyan else Color.White.copy(alpha = 0.15f),
                                        shape = CircleShape
                                    )
                                    .focusable(interactionSource = fwdSource)
                                    .clickable(interactionSource = fwdSource, indication = null) {
                                        if (!isEmbedMode) {
                                            exoPlayer.seekTo((exoPlayer.currentPosition + 10000L).coerceAtMost(duration))
                                        }
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
                                        .background(if (isNextFocused) ElectricViolet else TvSurfaceHigh.copy(alpha = 0.7f))
                                        .border(
                                            width = if (isNextFocused) 2.dp else 1.dp,
                                            color = if (isNextFocused) CyberCyan else Color.White.copy(alpha = 0.15f),
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

                        // Right Auxiliary Controls Pod
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Audio & Subtitles Drawer Toggle
                            val audioSource = remember { MutableInteractionSource() }
                            val isAudioFocused by audioSource.collectIsFocusedAsState()
                            val isAudioActive = activeDrawer == PlayerDrawerType.AUDIO_SUBTITLE

                            Box(
                                modifier = Modifier
                                    .height(48.dp)
                                    .clip(RoundedCornerShape(24.dp))
                                    .background(
                                        when {
                                            isAudioFocused -> ElectricViolet
                                            isAudioActive -> TvSurfaceHighest
                                            else -> TvSurfaceHigh.copy(alpha = 0.7f)
                                        }
                                    )
                                    .border(
                                        width = if (isAudioFocused || isAudioActive) 2.dp else 1.dp,
                                        color = if (isAudioFocused || isAudioActive) CyberCyan else Color.White.copy(alpha = 0.15f),
                                        shape = RoundedCornerShape(24.dp)
                                    )
                                    .padding(horizontal = 16.dp)
                                    .focusable(interactionSource = audioSource)
                                    .clickable(interactionSource = audioSource, indication = null) {
                                        activeDrawer = if (isAudioActive) PlayerDrawerType.NONE else PlayerDrawerType.AUDIO_SUBTITLE
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Subtitles,
                                        contentDescription = "Âm thanh & Phụ đề",
                                        tint = if (isAudioActive) CyberCyan else Color.White,
                                        modifier = Modifier.size(19.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = selectedAudioTrackName,
                                        color = if (isAudioActive) CyberCyan else Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .size(7.dp)
                                            .clip(CircleShape)
                                            .background(CyberCyan)
                                    )
                                }
                            }

                            // Episodes Picker Drawer Toggle
                            val epsSource = remember { MutableInteractionSource() }
                            val isEpsFocused by epsSource.collectIsFocusedAsState()
                            val isEpsActive = activeDrawer == PlayerDrawerType.EPISODES

                            Box(
                                modifier = Modifier
                                    .height(48.dp)
                                    .clip(RoundedCornerShape(24.dp))
                                    .background(
                                        when {
                                            isEpsFocused -> ElectricViolet
                                            isEpsActive -> TvSurfaceHighest
                                            else -> TvSurfaceHigh.copy(alpha = 0.7f)
                                        }
                                    )
                                    .border(
                                        width = if (isEpsFocused || isEpsActive) 2.dp else 1.dp,
                                        color = if (isEpsFocused || isEpsActive) CyberCyan else Color.White.copy(alpha = 0.15f),
                                        shape = RoundedCornerShape(24.dp)
                                    )
                                    .padding(horizontal = 16.dp)
                                    .focusable(interactionSource = epsSource)
                                    .clickable(interactionSource = epsSource, indication = null) {
                                        activeDrawer = if (isEpsActive) PlayerDrawerType.NONE else PlayerDrawerType.EPISODES
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.ViewAgenda,
                                        contentDescription = "Danh sách tập",
                                        tint = if (isEpsActive) CyberCyan else Color.White,
                                        modifier = Modifier.size(19.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "Tập phim",
                                        color = if (isEpsActive) CyberCyan else Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            // Servers Picker Toggle
                            val serversCount = detailData?.episodes?.size ?: 0
                            if (serversCount > 1) {
                                val srvSource = remember { MutableInteractionSource() }
                                val isSrvFocused by srvSource.collectIsFocusedAsState()
                                val isSrvActive = activeDrawer == PlayerDrawerType.SERVERS

                                Box(
                                    modifier = Modifier
                                        .height(48.dp)
                                        .clip(RoundedCornerShape(24.dp))
                                        .background(
                                            when {
                                                isSrvFocused -> ElectricViolet
                                                isSrvActive -> TvSurfaceHighest
                                                else -> TvSurfaceHigh.copy(alpha = 0.7f)
                                            }
                                        )
                                        .border(
                                            width = if (isSrvFocused || isSrvActive) 2.dp else 1.dp,
                                            color = if (isSrvFocused || isSrvActive) CyberCyan else Color.White.copy(alpha = 0.15f),
                                            shape = RoundedCornerShape(24.dp)
                                        )
                                        .padding(horizontal = 16.dp)
                                        .focusable(interactionSource = srvSource)
                                        .clickable(interactionSource = srvSource, indication = null) {
                                            activeDrawer = if (isSrvActive) PlayerDrawerType.NONE else PlayerDrawerType.SERVERS
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.Dns,
                                            contentDescription = "Đổi nguồn phát",
                                            tint = if (isSrvActive) CyberCyan else Color.White,
                                            modifier = Modifier.size(19.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "Đổi Server",
                                            color = if (isSrvActive) CyberCyan else Color.White,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // 4. TV Living Room D-Pad Remote Legend / Key Navigation Hint
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
                                text = "▲ Âm thanh",
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
                                text = "Độ trễ thấp",
                                color = CyberCyan,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }
            }
        }

        // 3. CENTER-RIGHT DRAWER MODAL (Audio & Subtitles / Episodes / Servers)
        AnimatedVisibility(
            visible = activeDrawer != PlayerDrawerType.NONE,
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
                    .background(TvSurfaceContainer.copy(alpha = 0.95f))
                    .border(1.5.dp, CyberCyan.copy(alpha = 0.35f), RoundedCornerShape(24.dp))
                    .padding(24.dp)
            ) {
                when (activeDrawer) {
                    PlayerDrawerType.AUDIO_SUBTITLE -> {
                        Column(modifier = Modifier.fillMaxSize()) {
                            // Header
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.GraphicEq,
                                        contentDescription = "Âm thanh",
                                        tint = CyberCyan,
                                        modifier = Modifier.size(24.dp)
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Text(
                                        text = "Âm Thanh & Giọng Đọc",
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
                                        .background(if (isCloseFocused) ElectricViolet else TvSurfaceHigh)
                                        .focusable(interactionSource = closeSource)
                                        .clickable(interactionSource = closeSource, indication = null) {
                                            activeDrawer = PlayerDrawerType.NONE
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

                            Spacer(modifier = Modifier.height(18.dp))

                            Text(
                                text = "KÊNH ÂM THANH HIỆN CÓ (${availableAudioTracks.size})",
                                color = CyberCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            if (availableAudioTracks.isEmpty()) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 24.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = "Nguồn phát đang dùng âm thanh mặc định của luồng.",
                                        color = TvOnSurfaceVariant,
                                        fontSize = 13.sp
                                    )
                                }
                            } else {
                                LazyColumn(
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    items(availableAudioTracks) { track ->
                                        val trackSource = remember { MutableInteractionSource() }
                                        val isTrackFocused by trackSource.collectIsFocusedAsState()

                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(14.dp))
                                                .background(
                                                    when {
                                                        track.isSelected -> ElectricViolet
                                                        isTrackFocused -> TvSurfaceHighest
                                                        else -> TvSurfaceHigh.copy(alpha = 0.6f)
                                                    }
                                                )
                                                .border(
                                                    width = if (isTrackFocused) 2.5.dp else if (track.isSelected) 1.5.dp else 1.dp,
                                                    color = if (isTrackFocused || track.isSelected) CyberCyan else Color.White.copy(alpha = 0.1f),
                                                    shape = RoundedCornerShape(14.dp)
                                                )
                                                .padding(horizontal = 16.dp, vertical = 14.dp)
                                                .focusable(interactionSource = trackSource)
                                                .clickable(interactionSource = trackSource, indication = null) {
                                                    selectAudioTrack(track)
                                                }
                                        ) {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column {
                                                    Text(
                                                        text = track.name,
                                                        color = Color.White,
                                                        fontSize = 15.sp,
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                    Spacer(modifier = Modifier.height(3.dp))
                                                    Text(
                                                        text = if (track.language == "vi" || track.language == "female" || track.language == "male") "Thuyết minh Tiếng Việt chuẩn rạp" else "Bản gốc Studio Master",
                                                        color = if (track.isSelected) Color.White.copy(alpha = 0.85f) else TvOnSurfaceVariant,
                                                        fontSize = 11.sp
                                                    )
                                                }

                                                if (track.isSelected) {
                                                    Icon(
                                                        imageVector = Icons.Default.CheckCircle,
                                                        contentDescription = "Đã chọn",
                                                        tint = CyberCyan,
                                                        modifier = Modifier.size(22.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))
                            Text(
                                text = "Phím D-PAD để chọn • BACK để đóng menu",
                                color = TvOnSurfaceVariant,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }

                    PlayerDrawerType.EPISODES -> {
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
                                        tint = CyberCyan,
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
                                        .background(if (isCloseFocused) ElectricViolet else TvSurfaceHigh)
                                        .focusable(interactionSource = closeSource)
                                        .clickable(interactionSource = closeSource, indication = null) {
                                            activeDrawer = PlayerDrawerType.NONE
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

                            // Server selector pills in drawer
                            val servers = detailData?.episodes ?: emptyList()
                            if (servers.size > 1) {
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    itemsIndexed(servers) { idx, srv ->
                                        val isSelected = idx == selectedServerIndex
                                        val srvPillSource = remember { MutableInteractionSource() }
                                        val isSrvPillFocused by srvPillSource.collectIsFocusedAsState()

                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(
                                                    when {
                                                        isSelected -> ElectricViolet
                                                        isSrvPillFocused -> TvSurfaceHighest
                                                        else -> TvSurfaceHigh.copy(alpha = 0.7f)
                                                    }
                                                )
                                                .border(
                                                    width = if (isSrvPillFocused || isSelected) 2.dp else 1.dp,
                                                    color = if (isSrvPillFocused || isSelected) CyberCyan else Color.White.copy(alpha = 0.15f),
                                                    shape = RoundedCornerShape(10.dp)
                                                )
                                                .padding(horizontal = 14.dp, vertical = 8.dp)
                                                .focusable(interactionSource = srvPillSource)
                                                .clickable(interactionSource = srvPillSource, indication = null) {
                                                    selectedServerIndex = idx
                                                }
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

                            Text(
                                text = "TỔNG CỘNG: ${currentEpisodes.size} TẬP",
                                color = CyberCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            // Episodes Column
                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                items(currentEpisodes) { ep ->
                                    val isCurrent = ep.slug == currentEpisode?.slug
                                    val epSource = remember { MutableInteractionSource() }
                                    val isEpFocused by epSource.collectIsFocusedAsState()

                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(
                                                when {
                                                    isEpFocused -> TvSurfaceHighest
                                                    isCurrent -> ElectricViolet.copy(alpha = 0.8f)
                                                    else -> TvSurfaceHigh.copy(alpha = 0.6f)
                                                }
                                            )
                                            .border(
                                                width = if (isEpFocused) 2.5.dp else if (isCurrent) 1.5.dp else 1.dp,
                                                color = if (isEpFocused || isCurrent) CyberCyan else Color.White.copy(alpha = 0.1f),
                                                shape = RoundedCornerShape(14.dp)
                                            )
                                            .padding(horizontal = 16.dp, vertical = 12.dp)
                                            .focusable(interactionSource = epSource)
                                            .clickable(interactionSource = epSource, indication = null) {
                                                playEpisode(ep)
                                                activeDrawer = PlayerDrawerType.NONE
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
                                                                .background(CyberCyan.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                                                .padding(horizontal = 6.dp, vertical = 2.dp)
                                                        ) {
                                                            Text(
                                                                text = "ĐANG PHÁT",
                                                                color = CyberCyan,
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
                                                tint = if (isCurrent) CyberCyan else Color.White.copy(alpha = 0.6f),
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

                    PlayerDrawerType.SERVERS -> {
                        Column(modifier = Modifier.fillMaxSize()) {
                            // Header
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Dns,
                                        contentDescription = "Server",
                                        tint = CyberCyan,
                                        modifier = Modifier.size(24.dp)
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Text(
                                        text = "Chọn Server Phát",
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
                                        .background(if (isCloseFocused) ElectricViolet else TvSurfaceHigh)
                                        .focusable(interactionSource = closeSource)
                                        .clickable(interactionSource = closeSource, indication = null) {
                                            activeDrawer = PlayerDrawerType.NONE
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

                            Spacer(modifier = Modifier.height(18.dp))

                            val servers = detailData?.episodes ?: emptyList()
                            LazyColumn(
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                itemsIndexed(servers) { idx, srv ->
                                    val isSelected = idx == selectedServerIndex
                                    val srvCardSource = remember { MutableInteractionSource() }
                                    val isSrvCardFocused by srvCardSource.collectIsFocusedAsState()

                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(
                                                when {
                                                    isSelected -> ElectricViolet
                                                    isSrvCardFocused -> TvSurfaceHighest
                                                    else -> TvSurfaceHigh.copy(alpha = 0.6f)
                                                }
                                            )
                                            .border(
                                                width = if (isSrvCardFocused) 2.5.dp else if (isSelected) 1.5.dp else 1.dp,
                                                color = if (isSrvCardFocused || isSelected) CyberCyan else Color.White.copy(alpha = 0.1f),
                                                shape = RoundedCornerShape(14.dp)
                                            )
                                            .padding(16.dp)
                                            .focusable(interactionSource = srvCardSource)
                                            .clickable(interactionSource = srvCardSource, indication = null) {
                                                selectedServerIndex = idx
                                                val targetEp = srv.serverData.firstOrNull()
                                                if (targetEp != null) {
                                                    playEpisode(targetEp)
                                                }
                                                activeDrawer = PlayerDrawerType.NONE
                                            }
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column {
                                                Text(
                                                    text = srv.serverName,
                                                    color = Color.White,
                                                    fontSize = 15.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Spacer(modifier = Modifier.height(4.dp))
                                                val srvDesc = when {
                                                    srv.serverName.contains("Song Ngữ", ignoreCase = true) -> "Đa luồng Audio Gốc & Thuyết minh (ViCDN HLS)"
                                                    srv.serverName.contains("NC", ignoreCase = true) -> "Nguồn dự phòng NguonC (Web Embed)"
                                                    else -> "Nguồn KKPhim HLS tốc độ cao chuẩn rạp"
                                                }
                                                Text(
                                                    text = srvDesc,
                                                    color = if (isSelected) Color.White.copy(alpha = 0.85f) else TvOnSurfaceVariant,
                                                    fontSize = 11.sp
                                                )
                                            }

                                            if (isSelected) {
                                                Icon(
                                                    imageVector = Icons.Default.CheckCircle,
                                                    contentDescription = "Đang chọn",
                                                    tint = CyberCyan,
                                                    modifier = Modifier.size(22.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    PlayerDrawerType.NONE -> {}
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
