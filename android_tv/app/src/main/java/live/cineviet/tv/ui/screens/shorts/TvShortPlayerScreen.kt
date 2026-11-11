package live.cineviet.tv.ui.screens.shorts

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.view.KeyEvent
import android.view.WindowManager
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import live.cineviet.tv.data.models.ShortDramaItem
import live.cineviet.tv.data.models.ShortEpisodeItem
import live.cineviet.tv.data.models.ShortStreamServer
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*

@OptIn(UnstableApi::class)
@Composable
fun TvShortPlayerScreen(
    slug: String,
    initialEpisode: Int = 1,
    initialPreferFull: Boolean = false,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repository = remember { MovieRepository() }

    var item by remember { mutableStateOf(ShortDramaItem(slug = slug, name = slug)) }
    var episodes by remember { mutableStateOf<List<ShortEpisodeItem>>(emptyList()) }
    var servers by remember { mutableStateOf<List<ShortStreamServer>>(emptyList()) }
    var activeEpisode by remember { mutableStateOf(initialEpisode.coerceAtLeast(1)) }
    var preferFull by remember { mutableStateOf(initialPreferFull) }
    var subtitleEnabled by remember { mutableStateOf(true) }

    var isPlaying by remember { mutableStateOf(true) }
    var isBuffering by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var currentPos by remember { mutableStateOf(0L) }
    var duration by remember { mutableStateOf(0L) }
    var showControls by remember { mutableStateOf(true) }
    var showEpDrawer by remember { mutableStateOf(false) }

    val playFocus = remember { FocusRequester() }
    val drawerFocus = remember { FocusRequester() }
    var activeServer by remember { mutableStateOf<ShortStreamServer?>(null) }
    var candidateUrls by remember { mutableStateOf<List<String>>(emptyList()) }
    var candidateIdx by remember { mutableStateOf(0) }

    val exoPlayer = remember {
        val httpFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .setDefaultRequestProperties(mapOf("Referer" to "https://cineviet.live/"))
            .setAllowCrossProtocolRedirects(true)
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()
            .apply {
                playWhenReady = true
                repeatMode = Player.REPEAT_MODE_OFF
                setWakeMode(C.WAKE_MODE_NETWORK)
            }
    }

    fun playCandidateUrl(url: String, srv: ShortStreamServer?) {
        errorMsg = null
        isBuffering = true
        val builder = MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMimeType(MimeTypes.APPLICATION_M3U8)
        val subUrl = srv?.subtitles?.firstOrNull()?.resolvedUrl.orEmpty()
        if (subUrl.isNotBlank()) {
            val subConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                .setMimeType(MimeTypes.TEXT_VTT)
                .setLanguage("vi")
                .setLabel("Tiếng Việt")
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build()
            builder.setSubtitleConfigurations(listOf(subConfig))
        }
        exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
            .buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subtitleEnabled)
            .build()
        exoPlayer.setMediaItem(builder.build())
        exoPlayer.prepare()
        exoPlayer.play()
    }

    fun applyMediaServer(srv: ShortStreamServer) {
        val urls = srv.resolvedCandidateUrls
        if (urls.isEmpty()) {
            errorMsg = "Không tìm thấy đường dẫn phát"
            isBuffering = false
            return
        }
        activeServer = srv
        candidateUrls = urls
        candidateIdx = 0
        playCandidateUrl(urls.first(), srv)
    }

    LaunchedEffect(slug) {
        repository.getShortDetail(slug).onSuccess { detail ->
            item = detail.item
            episodes = detail.episodes.ifEmpty {
                listOf(ShortEpisodeItem(episode = 1, title = "Tập 1"))
            }
        }
    }

    LaunchedEffect(slug, activeEpisode) {
        isBuffering = true
        errorMsg = null
        repository.getShortStream(slug, activeEpisode).onSuccess { streamData ->
            servers = streamData.servers
            val chosen = streamData.servers.firstOrNull { it.isFull == preferFull }
                ?: streamData.servers.firstOrNull()
            if (chosen != null) {
                preferFull = chosen.isFull
                applyMediaServer(chosen)
            } else {
                isBuffering = false
                errorMsg = "Chưa có luồng phát khả dụng cho tập này"
            }
        }.onFailure { err ->
            isBuffering = false
            errorMsg = err.message ?: "Lỗi tải luồng phát"
        }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                isBuffering = (state == Player.STATE_BUFFERING)
                if (state == Player.STATE_READY) {
                    duration = exoPlayer.duration.coerceAtLeast(0L)
                }
                if (state == Player.STATE_ENDED && !preferFull && activeEpisode < episodes.size) {
                    activeEpisode += 1
                }
            }

            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlayerError(error: PlaybackException) {
                val nextIdx = candidateIdx + 1
                if (nextIdx < candidateUrls.size) {
                    candidateIdx = nextIdx
                    playCandidateUrl(candidateUrls[nextIdx], activeServer)
                    return
                }
                isBuffering = false
                errorMsg = "Lỗi phát HLS: ${error.localizedMessage ?: "Không xác định"}"
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    // Keep TV screen awake
    val activity = remember(context) { context.findShortTvActivity() }
    DisposableEffect(activity, isPlaying, isBuffering) {
        val win = activity?.window
        if (isPlaying || isBuffering) {
            win?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            win?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose {
            win?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    LaunchedEffect(exoPlayer) {
        while (true) {
            currentPos = exoPlayer.currentPosition.coerceAtLeast(0L)
            if (exoPlayer.duration > 0L) duration = exoPlayer.duration
            delay(500)
        }
    }

    LaunchedEffect(showControls, isPlaying, showEpDrawer) {
        if (showControls && !showEpDrawer && isPlaying) {
            delay(4500)
            showControls = false
        }
    }

    LaunchedEffect(showControls, showEpDrawer) {
        if (showEpDrawer) {
            delay(120)
            try { drawerFocus.requestFocus() } catch (_: Exception) {}
        } else if (showControls) {
            delay(100)
            try { playFocus.requestFocus() } catch (_: Exception) {}
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .onKeyEvent { keyEvent ->
                if (keyEvent.type == KeyEventType.KeyDown) {
                    val code = keyEvent.nativeKeyEvent.keyCode
                    if (code == KeyEvent.KEYCODE_BACK) {
                        if (showEpDrawer) {
                            showEpDrawer = false
                            return@onKeyEvent true
                        }
                        if (showControls) {
                            showControls = false
                            return@onKeyEvent true
                        }
                        onBack()
                        return@onKeyEvent true
                    }
                    if (!showControls && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_DPAD_UP || code == KeyEvent.KEYCODE_DPAD_DOWN)) {
                        showControls = true
                        return@onKeyEvent true
                    }
                    if (!showEpDrawer && code == KeyEvent.KEYCODE_DPAD_LEFT) {
                        showControls = true
                        exoPlayer.seekTo((exoPlayer.currentPosition - 10_000L).coerceAtLeast(0L))
                        return@onKeyEvent true
                    }
                    if (!showEpDrawer && code == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        showControls = true
                        val target = (exoPlayer.currentPosition + 10_000L).coerceAtMost(duration.coerceAtLeast(0L))
                        exoPlayer.seekTo(target)
                        return@onKeyEvent true
                    }
                }
                false
            }
    ) {
        // 9:16 Vertical Theatre Stage centered on 16:9 TV screen
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .aspectRatio(9f / 16f)
                .align(Alignment.Center)
                .background(Color.Black)
        ) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        layoutParams = FrameLayout.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }

        if (isBuffering) {
            TvLoadingSpinner(modifier = Modifier.align(Alignment.Center))
        } else if (errorMsg != null) {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(TvSurface.copy(alpha = 0.92f), RoundedCornerShape(16.dp))
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(text = errorMsg!!, color = CineVietRedLight, fontSize = 16.sp)
                Spacer(modifier = Modifier.height(12.dp))
                ShortPlayerBtn(label = "← Quay lại", isPrimary = true, onClick = onBack)
            }
        }

        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(
                                Color.Black.copy(alpha = 0.85f),
                                Color.Transparent,
                                Color.Black.copy(alpha = 0.92f)
                            )
                        )
                    )
                    .padding(32.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top Bar
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ShortPlayerBtn(
                        label = "← Thoát",
                        isPrimary = false,
                        onClick = onBack
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text(
                            text = item.name.ifBlank { slug },
                            color = Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = if (preferFull) "Bản Full (Gộp tất cả tập)" else "Tập $activeEpisode / ${episodes.size.coerceAtLeast(1)}",
                            color = TvGold,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                // Bottom Controls
                Column {
                    val progress = if (duration > 0L) (currentPos.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color.White.copy(alpha = 0.22f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(progress)
                                .background(CineVietRed)
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            ShortPlayerBtn(
                                label = if (isPlaying) "❚❚ Tạm dừng" else "▶ Phát",
                                isPrimary = true,
                                modifier = Modifier.focusRequester(playFocus),
                                onClick = {
                                    if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
                                }
                            )
                            ShortPlayerBtn(
                                label = "↺ -10s",
                                isPrimary = false,
                                onClick = { exoPlayer.seekTo((exoPlayer.currentPosition - 10_000L).coerceAtLeast(0L)) }
                            )
                            ShortPlayerBtn(
                                label = "+10s ↻",
                                isPrimary = false,
                                onClick = {
                                    val target = (exoPlayer.currentPosition + 10_000L).coerceAtMost(duration.coerceAtLeast(0L))
                                    exoPlayer.seekTo(target)
                                }
                            )
                            if (activeEpisode > 1) {
                                ShortPlayerBtn(
                                    label = "⏮ Tập trước",
                                    isPrimary = false,
                                    onClick = { activeEpisode -= 1 }
                                )
                            }
                            if (activeEpisode < episodes.size) {
                                ShortPlayerBtn(
                                    label = "Tập sau ⏭",
                                    isPrimary = false,
                                    onClick = { activeEpisode += 1 }
                                )
                            }
                            Text(
                                text = "${formatShortMs(currentPos)} / ${formatShortMs(duration)}",
                                color = TvOnSurface,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ShortPlayerBtn(
                                label = if (subtitleEnabled) "Phụ đề: Bật" else "Phụ đề: Tắt",
                                isPrimary = false,
                                onClick = {
                                    subtitleEnabled = !subtitleEnabled
                                    exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                                        .buildUpon()
                                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subtitleEnabled)
                                        .build()
                                }
                            )
                            if (servers.size > 1) {
                                ShortPlayerBtn(
                                    label = if (preferFull) "Chuyển Tập lẻ" else "Xem Bản Full",
                                    isPrimary = false,
                                    onClick = {
                                        val nextFull = !preferFull
                                        val nextSrv = servers.firstOrNull { it.isFull == nextFull }
                                        if (nextSrv != null) {
                                            preferFull = nextFull
                                            applyMediaServer(nextSrv)
                                        }
                                    }
                                )
                            }
                            ShortPlayerBtn(
                                label = "Tập (${episodes.size})",
                                isPrimary = false,
                                onClick = { showEpDrawer = true }
                            )
                        }
                    }
                }
            }
        }

        if (showEpDrawer) {
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .width(340.dp)
                    .fillMaxHeight()
                    .background(TvSurface.copy(alpha = 0.96f))
                    .padding(22.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "Danh sách tập", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    ShortPlayerBtn(
                        label = "Đóng",
                        isPrimary = false,
                        modifier = Modifier.focusRequester(drawerFocus),
                        onClick = { showEpDrawer = false }
                    )
                }
                Spacer(modifier = Modifier.height(14.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(episodes, key = { it.episode }) { ep ->
                        ShortPlayerBtn(
                            label = "Tập ${ep.episode}",
                            isPrimary = ep.episode == activeEpisode,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                showEpDrawer = false
                                activeEpisode = ep.episode
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ShortPlayerBtn(
    label: String,
    isPrimary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val bg = when {
        focused -> CineVietRed
        isPrimary -> CineVietRed.copy(alpha = 0.85f)
        else -> TvSurfaceHigh.copy(alpha = 0.92f)
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .border(1.5.dp, if (focused) Color.White else TvSurfaceHighest, RoundedCornerShape(10.dp))
            .focusable(interactionSource = source)
            .clickable(interactionSource = source, indication = null) { onClick() }
            .padding(horizontal = 14.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text = label, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

private fun formatShortMs(ms: Long): String {
    val totalSec = (ms / 1000L).coerceAtLeast(0L)
    val min = totalSec / 60L
    val sec = totalSec % 60L
    return "%02d:%02d".format(min, sec)
}

private tailrec fun Context.findShortTvActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findShortTvActivity()
    else -> null
}
