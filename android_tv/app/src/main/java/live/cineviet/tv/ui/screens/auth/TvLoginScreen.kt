package live.cineviet.tv.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.cineviet.tv.data.local.TvSessionManager
import live.cineviet.tv.data.models.TvSession
import live.cineviet.tv.data.repository.TvAuthRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.theme.*

@Composable
fun TvLoginScreen(
    sessionManager: TvSessionManager,
    onLoginSuccess: () -> Unit,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { TvAuthRepository(sessionManager) }
    val scope = rememberCoroutineScope()

    var session by remember { mutableStateOf<TvSession?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var remainingSeconds by remember { mutableStateOf(300) }
    var isApproved by remember { mutableStateOf(false) }

    fun loadNewCode() {
        isLoading = true
        errorMessage = null
        scope.launch {
            val result = repository.createSession()
            result.onSuccess { s ->
                session = s
                remainingSeconds = s.expiresIn
                isLoading = false
            }.onFailure {
                errorMessage = it.message ?: "Không thể tạo mã đăng nhập. Vui lòng thử lại."
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadNewCode()
    }

    // Countdown Timer (every 1s)
    LaunchedEffect(session) {
        if (session != null) {
            while (remainingSeconds > 0 && !isApproved) {
                delay(1000)
                remainingSeconds -= 1
            }
            if (remainingSeconds <= 0 && !isApproved) {
                // Auto refresh code when expired
                loadNewCode()
            }
        }
    }

    // Auto-polling status every 3 seconds
    LaunchedEffect(session) {
        val currentToken = session?.token
        if (!currentToken.isNullOrBlank()) {
            while (!isApproved) {
                delay(3000)
                val check = repository.checkStatus(currentToken)
                check.onSuccess { statusResp ->
                    if (statusResp.status == "approved") {
                        isApproved = true
                        delay(1200)
                        onLoginSuccess()
                    } else if (statusResp.status == "expired") {
                        loadNewCode()
                    }
                }
            }
        }
    }

    val refreshSource = remember { MutableInteractionSource() }
    val isRefreshFocused by refreshSource.collectIsFocusedAsState()

    val skipSource = remember { MutableInteractionSource() }
    val isSkipFocused by skipSource.collectIsFocusedAsState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground),
        contentAlignment = Alignment.Center
    ) {
        if (isApproved) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = "Success",
                    tint = EmeraldGreen,
                    modifier = Modifier.size(72.dp)
                )
                Spacer(modifier = Modifier.height(18.dp))
                Text(
                    text = "Đăng Nhập Thành Công!",
                    color = Color.White,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Màn hình TV đang tự động đồng bộ dữ liệu...",
                    color = TvOnSurfaceVariant,
                    fontSize = 15.sp
                )
            }
            return@Box
        }

        Column(
            modifier = Modifier
                .width(740.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(TvSurface)
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(20.dp))
                .padding(36.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Đăng Nhập Bằng Mã Kích Hoạt 6 Số",
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "Liên kết tài khoản CineViet của bạn chỉ trong vài giây",
                color = TvOnSurfaceVariant,
                fontSize = 13.sp
            )

            Spacer(modifier = Modifier.height(24.dp))

            // 6-DIGIT CODE DISPLAY
            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(84.dp),
                    contentAlignment = Alignment.Center
                ) {
                    TvLoadingSpinner(color = CineVietRed)
                }
            } else if (errorMessage != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF3B1E22), RoundedCornerShape(10.dp))
                        .border(1.dp, Color(0xFFE50914).copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                        .padding(14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = errorMessage ?: "",
                        color = Color(0xFFFF8A80),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            } else {
                val code = session?.code ?: "------"
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    code.forEachIndexed { index, char ->
                        if (index == 3) {
                            Spacer(modifier = Modifier.width(12.dp))
                        }
                        Box(
                            modifier = Modifier
                                .size(56.dp, 72.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0xFF151824))
                                .border(2.dp, CineVietRed, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = char.toString(),
                                color = Color.White,
                                fontSize = 34.sp,
                                fontWeight = FontWeight.Black,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                val mins = remainingSeconds / 60
                val secs = remainingSeconds % 60
                Text(
                    text = String.format("Mã có hiệu lực trong %02d:%02d", mins, secs),
                    color = TvOnSurfaceVariant,
                    fontSize = 12.sp
                )
            }

            Spacer(modifier = Modifier.height(22.dp))

            // 3-STEP INSTRUCTIONS
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TvSurfaceHigh.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TvStepItem(
                    step = "1",
                    title = "Truy cập website trên điện thoại/máy tính",
                    desc = "Mở trình duyệt vào cineviet.live/tv-auth hoặc vào mục Tài khoản trên App CineViet"
                )
                TvStepItem(
                    step = "2",
                    title = "Nhập mã kích hoạt 6 số ở trên",
                    desc = "Đăng nhập tài khoản của bạn và điền đúng 6 số vào ô xác thực"
                )
                TvStepItem(
                    step = "3",
                    title = "Hoàn tất liên kết ngay lập tức",
                    desc = "Bấm \"Xác Nhận Đăng Nhập TV\", màn hình TV sẽ tự động đồng bộ tài khoản!"
                )
            }

            Spacer(modifier = Modifier.height(26.dp))

            // ACTION BUTTONS: Làm mới mã 6 số & Bỏ qua
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isRefreshFocused) Color.White else TvSurfaceHigh)
                        .border(1.5.dp, if (isRefreshFocused) CineVietRed else Color.White.copy(alpha = 0.15f), RoundedCornerShape(10.dp))
                        .focusable(interactionSource = refreshSource)
                        .clickable(interactionSource = refreshSource, indication = null) {
                            loadNewCode()
                        }
                        .padding(horizontal = 24.dp, vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Làm mới",
                            tint = if (isRefreshFocused) CineVietRed else Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Làm Mới Mã 6 Số",
                            color = if (isRefreshFocused) CineVietRed else Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isSkipFocused) CineVietRed else Color.Transparent)
                        .border(1.5.dp, if (isSkipFocused) Color.White else Color.White.copy(alpha = 0.2f), RoundedCornerShape(10.dp))
                        .focusable(interactionSource = skipSource)
                        .clickable(interactionSource = skipSource, indication = null) {
                            onSkip()
                        }
                        .padding(horizontal = 24.dp, vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Bỏ Qua & Xem Ngay",
                        color = Color.White,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun TvStepItem(
    step: String,
    title: String,
    desc: String
) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(22.dp)
                .background(CineVietRed, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = step,
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Black
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column {
            Text(
                text = title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = desc,
                color = TvOnSurfaceVariant,
                fontSize = 11.sp,
                lineHeight = 16.sp
            )
        }
    }
}
