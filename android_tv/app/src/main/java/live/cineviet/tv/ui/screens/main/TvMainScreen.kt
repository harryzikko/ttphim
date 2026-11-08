package live.cineviet.tv.ui.screens.main

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import live.cineviet.tv.data.local.TvSessionManager
import live.cineviet.tv.ui.navigation.TvScreen
import live.cineviet.tv.ui.screens.auth.TvLoginScreen
import live.cineviet.tv.ui.screens.home.TvHomeScreen
import live.cineviet.tv.ui.screens.search.TvSearchScreen
import live.cineviet.tv.ui.theme.*

enum class TvNavTab(val title: String, val selectedIcon: ImageVector, val unselectedIcon: ImageVector) {
    HOME("Khám phá", Icons.Filled.Home, Icons.Outlined.Home),
    SERIES("Phim bộ", Icons.Filled.Tv, Icons.Outlined.Tv),
    SINGLES("Phim lẻ", Icons.Filled.Movie, Icons.Outlined.Movie),
    SEARCH("Tìm kiếm", Icons.Filled.Search, Icons.Outlined.Search),
    ACCOUNT("Tài khoản", Icons.Filled.Person, Icons.Outlined.Person)
}

@Composable
fun TvMainScreen(
    sessionManager: TvSessionManager,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToPlayer: (String, String?) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableStateOf(TvNavTab.HOME) }
    var isDrawerFocused by remember { mutableStateOf(false) }

    val drawerWidth by animateDpAsState(
        targetValue = if (isDrawerFocused) 220.dp else 76.dp,
        label = "drawerWidth"
    )

    Row(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
    ) {
        // Collapsible / Expandable TV Sidebar Drawer
        Box(
            modifier = Modifier
                .width(drawerWidth)
                .fillMaxHeight()
                .background(
                    Brush.horizontalGradient(
                        listOf(TvSurfaceHigh.copy(alpha = 0.95f), TvSurface.copy(alpha = 0.85f))
                    )
                )
                .padding(vertical = 24.dp, horizontal = 12.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = if (isDrawerFocused) Alignment.Start else Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Top Logo / Brand
                Column(
                    horizontalAlignment = if (isDrawerFocused) Alignment.Start else Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isDrawerFocused) {
                        // Expanded: Exactly "CineViet" text like website (Cine in White, Viet in Red)
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(start = 12.dp, bottom = 28.dp)
                        ) {
                            Text(
                                text = "Cine",
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                text = "Viet",
                                color = CineVietRed,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black
                            )
                        }
                    } else {
                        // Collapsed: Red "C" Favicon Badge
                        Box(
                            modifier = Modifier
                                .padding(bottom = 28.dp)
                                .size(38.dp)
                                .background(CineVietRed, RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "C",
                                color = Color.White,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Black
                            )
                        }
                    }

                    // Navigation Items
                    TvNavTab.values().forEach { tab ->
                        val isSelected = selectedTab == tab
                        val interactionSource = remember { MutableInteractionSource() }
                        val isItemFocused by interactionSource.collectIsFocusedAsState()

                        LaunchedEffect(isItemFocused) {
                            if (isItemFocused) {
                                isDrawerFocused = true
                            }
                        }

                        val bgColor by animateColorAsState(
                            targetValue = when {
                                isItemFocused -> CineVietRed
                                isSelected -> TvSurfaceHighest
                                else -> Color.Transparent
                            },
                            label = "navBg"
                        )

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(bgColor)
                                .focusable(interactionSource = interactionSource)
                                .clickable(interactionSource = interactionSource, indication = null) {
                                    selectedTab = tab
                                }
                                .onFocusChanged { focusState ->
                                    if (focusState.isFocused) {
                                        selectedTab = tab
                                    }
                                }
                                .padding(horizontal = 12.dp)
                        ) {
                            Icon(
                                imageVector = if (isSelected || isItemFocused) tab.selectedIcon else tab.unselectedIcon,
                                contentDescription = tab.title,
                                tint = if (isItemFocused || isSelected) Color.White else TvOnSurfaceVariant,
                                modifier = Modifier.size(24.dp)
                            )

                            if (isDrawerFocused) {
                                Spacer(modifier = Modifier.width(14.dp))
                                Text(
                                    text = tab.title,
                                    color = if (isItemFocused || isSelected) Color.White else TvOnSurfaceVariant,
                                    fontSize = 14.sp,
                                    fontWeight = if (isSelected || isItemFocused) FontWeight.Bold else FontWeight.Medium,
                                    maxLines = 1
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                    }
                }

                // Bottom Status / User Avatar or Status Pill
                if (isDrawerFocused) {
                    val user = sessionManager.getUser()
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .background(TvSurfaceHighest, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = (user?.name?.firstOrNull() ?: 'K').toString().uppercase(),
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = user?.name ?: "Khách",
                            color = TvOnSurfaceVariant,
                            fontSize = 12.sp,
                            maxLines = 1
                        )
                    }
                }
            }
        }

        // Active Content Area
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .onFocusChanged { state ->
                    if (state.hasFocus) {
                        isDrawerFocused = false
                    }
                }
        ) {
            when (selectedTab) {
                TvNavTab.HOME -> {
                    TvHomeScreen(
                        categoryFilter = null,
                        onMovieClick = onNavigateToDetail,
                        onPlayClick = { slug, ep -> onNavigateToPlayer(slug, ep) }
                    )
                }
                TvNavTab.SERIES -> {
                    TvHomeScreen(
                        categoryFilter = "series",
                        onMovieClick = onNavigateToDetail,
                        onPlayClick = { slug, ep -> onNavigateToPlayer(slug, ep) }
                    )
                }
                TvNavTab.SINGLES -> {
                    TvHomeScreen(
                        categoryFilter = "singles",
                        onMovieClick = onNavigateToDetail,
                        onPlayClick = { slug, ep -> onNavigateToPlayer(slug, ep) }
                    )
                }
                TvNavTab.SEARCH -> {
                    TvSearchScreen(
                        onMovieClick = onNavigateToDetail
                    )
                }
                TvNavTab.ACCOUNT -> {
                    if (sessionManager.isLoggedIn()) {
                        TvAccountInfoScreen(
                            sessionManager = sessionManager,
                            onLoggedOut = { selectedTab = TvNavTab.HOME }
                        )
                    } else {
                        TvLoginScreen(
                            sessionManager = sessionManager,
                            onLoginSuccess = { selectedTab = TvNavTab.HOME },
                            onSkip = { selectedTab = TvNavTab.HOME }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TvAccountInfoScreen(
    sessionManager: TvSessionManager,
    onLoggedOut: () -> Unit
) {
    val user = sessionManager.getUser()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(48.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(CineVietRed, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = (user?.name?.firstOrNull() ?: 'U').toString().uppercase(),
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = user?.name ?: "Khán giả CineViet",
            color = Color.White,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )

        if (!user?.email.isNullOrBlank()) {
            Text(
                text = user?.email!!,
                color = TvOnSurfaceVariant,
                fontSize = 14.sp
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(if (isFocused) CineVietRed else TvSurfaceHigh)
                .border(2.dp, if (isFocused) Color.White else Color.Transparent, RoundedCornerShape(12.dp))
                .focusable(interactionSource = interactionSource)
                .clickable(interactionSource = interactionSource, indication = null) {
                    sessionManager.logout()
                    onLoggedOut()
                }
                .padding(horizontal = 28.dp, vertical = 14.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Đăng xuất tài khoản",
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}
