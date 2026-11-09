package live.cineviet.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import kotlinx.coroutines.launch
import live.cineviet.tv.BuildConfig
import live.cineviet.tv.data.models.AppUpdateData
import live.cineviet.tv.data.updater.TvUpdateManager
import live.cineviet.tv.ui.theme.*

@Composable
fun TvUpdateDialog(
    updateData: AppUpdateData,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var isDownloading by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableStateOf(0f) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val updateFocusRequester = remember { FocusRequester() }
    val dismissFocusRequester = remember { FocusRequester() }

    val updateSource = remember { MutableInteractionSource() }
    val isUpdateFocused by updateSource.collectIsFocusedAsState()

    val dismissSource = remember { MutableInteractionSource() }
    val isDismissFocused by dismissSource.collectIsFocusedAsState()

    val updateScale by animateFloatAsState(
        targetValue = if (isUpdateFocused) 1.05f else 1.0f,
        animationSpec = tween(120),
        label = "updateScale"
    )

    val dismissScale by animateFloatAsState(
        targetValue = if (isDismissFocused) 1.05f else 1.0f,
        animationSpec = tween(120),
        label = "dismissScale"
    )

    LaunchedEffect(Unit) {
        try {
            updateFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.85f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .width(580.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xFF131722))
                .border(1.5.dp, TvSurfaceHigh, RoundedCornerShape(20.dp))
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 1. Badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(CineVietRed.copy(alpha = 0.2f))
                    .border(1.dp, CineVietRed.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "BẢN CẬP NHẬT MỚI",
                    color = CineVietRed,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 2. Title
            Text(
                text = updateData.title.ifBlank { "Cập Nhật Ứng Dụng CineViet TV" },
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            // 3. Version info
            Text(
                text = "Phiên bản: v${updateData.latestVersion} (Build ${updateData.latestBuild})  •  Hiện tại: v${BuildConfig.VERSION_NAME}",
                color = TvOnSurfaceVariant,
                fontSize = 13.sp,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(20.dp))

            // 4. Release Notes
            if (updateData.releaseNotes.isNotBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFF1B202E))
                        .border(1.dp, Color(0xFF2A3144), RoundedCornerShape(12.dp))
                        .padding(16.dp)
                ) {
                    Column {
                        Text(
                            text = "Nội dung cập nhật:",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = updateData.releaseNotes,
                            color = TvOnSurfaceVariant,
                            fontSize = 13.sp,
                            lineHeight = 18.sp
                        )
                    }
                }
                Spacer(modifier = Modifier.height(20.dp))
            }

            // 5. Download Progress Bar (When downloading)
            if (isDownloading) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(Color(0xFF232738))
                    ) {
                        if (downloadProgress >= 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(downloadProgress.coerceIn(0f, 1f))
                                    .fillMaxHeight()
                                    .clip(RoundedCornerShape(5.dp))
                                    .background(
                                        Brush.horizontalGradient(
                                            listOf(CineVietRed, Color(0xFFFF5252))
                                        )
                                    )
                            )
                        } else {
                            // Indeterminate
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .fillMaxHeight()
                                    .background(CineVietRed.copy(alpha = 0.5f))
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    val percentText = if (downloadProgress >= 0) {
                        "${(downloadProgress * 100).toInt()}%"
                    } else {
                        "Đang tải..."
                    }
                    Text(
                        text = "Đang tải bản cập nhật: $percentText (Hệ thống sẽ tự động cài đè)",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
                Spacer(modifier = Modifier.height(24.dp))
            }

            // 6. Error text
            if (errorMessage != null) {
                Text(
                    text = errorMessage!!,
                    color = Color(0xFFFF5252),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }

            // 7. Action Buttons
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Update Button
                Box(
                    modifier = Modifier
                        .scale(updateScale)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isUpdateFocused) CineVietRed else TvSurfaceHigh)
                        .border(2.dp, if (isUpdateFocused) Color.White else Color.Transparent, RoundedCornerShape(12.dp))
                        .focusRequester(updateFocusRequester)
                        .focusable(interactionSource = updateSource)
                        .clickable(interactionSource = updateSource, indication = null) {
                            if (!isDownloading) {
                                isDownloading = true
                                errorMessage = null
                                coroutineScope.launch {
                                    val downloadUrl = updateData.apkTvUrl.ifBlank { updateData.apkMobileUrl }
                                    TvUpdateManager.downloadAndInstall(
                                        context = context,
                                        downloadUrl = downloadUrl,
                                        onProgress = { p -> downloadProgress = p },
                                        onError = { err ->
                                            isDownloading = false
                                            errorMessage = err
                                        }
                                    )
                                }
                            }
                        }
                        .padding(horizontal = 28.dp, vertical = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isDownloading) "Đang tải bản cập nhật..." else if (errorMessage != null) "Thử tải lại" else "Cập nhật ngay",
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                // Dismiss Button (Hide if forced update)
                if (!updateData.forceUpdate && !isDownloading) {
                    Box(
                        modifier = Modifier
                            .scale(dismissScale)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isDismissFocused) TvSurfaceHigh.copy(alpha = 0.9f) else Color.Transparent)
                            .border(1.5.dp, if (isDismissFocused) Color.White else TvSurfaceHigh, RoundedCornerShape(12.dp))
                        .focusRequester(dismissFocusRequester)
                        .focusable(interactionSource = dismissSource)
                        .clickable(interactionSource = dismissSource, indication = null) {
                            onDismiss()
                        }
                        .padding(horizontal = 24.dp, vertical = 14.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Để sau",
                            color = TvOnSurfaceVariant,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}
