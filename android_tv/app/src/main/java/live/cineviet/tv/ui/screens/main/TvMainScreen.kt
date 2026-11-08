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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.layout.ContentScale
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.launch
import live.cineviet.tv.data.local.TvSessionManager
import live.cineviet.tv.data.models.MovieItem
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.components.TvMovieCard
import live.cineviet.tv.ui.navigation.TvScreen
import live.cineviet.tv.ui.screens.auth.TvLoginScreen
import live.cineviet.tv.ui.screens.home.TvHomeScreen
import live.cineviet.tv.ui.screens.search.TvSearchScreen
import live.cineviet.tv.ui.theme.*

enum class TvNavTab(val title: String, val selectedIcon: ImageVector, val unselectedIcon: ImageVector) {
    HOME("Trang chủ", Icons.Filled.Home, Icons.Outlined.Home),
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
                                .clip(CircleShape)
                                .background(TvSurfaceHighest, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!user?.displayAvatar.isNullOrBlank()) {
                                SubcomposeAsyncImage(
                                    model = user!!.displayAvatar,
                                    contentDescription = user.name,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                                    loading = {
                                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                            Text(
                                                text = (user.name?.firstOrNull() ?: 'U').toString().uppercase(),
                                                color = Color.White,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    },
                                    error = {
                                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                            Text(
                                                text = (user.name?.firstOrNull() ?: 'U').toString().uppercase(),
                                                color = Color.White,
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                )
                            } else {
                                Text(
                                    text = (user?.name?.firstOrNull() ?: 'K').toString().uppercase(),
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
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
                        sessionManager = sessionManager,
                        onMovieClick = onNavigateToDetail,
                        onPlayClick = { slug, ep -> onNavigateToPlayer(slug, ep) }
                    )
                }
                TvNavTab.SERIES -> {
                    TvHomeScreen(
                        categoryFilter = "series",
                        sessionManager = sessionManager,
                        onMovieClick = onNavigateToDetail,
                        onPlayClick = { slug, ep -> onNavigateToPlayer(slug, ep) }
                    )
                }
                TvNavTab.SINGLES -> {
                    TvHomeScreen(
                        categoryFilter = "singles",
                        sessionManager = sessionManager,
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
                            onNavigateToDetail = onNavigateToDetail,
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
    onNavigateToDetail: (String) -> Unit,
    onLoggedOut: () -> Unit
) {
    val user = sessionManager.getUser()
    val repository = remember { MovieRepository() }
    var watchlist by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isLoadingWatchlist by remember { mutableStateOf(true) }

    val logoutSource = remember { MutableInteractionSource() }
    val isLogoutFocused by logoutSource.collectIsFocusedAsState()

    LaunchedEffect(Unit) {
        val result = repository.getUserLibrary()
        result.onSuccess { lib ->
            watchlist = lib.watchlist
        }
        isLoadingWatchlist = false
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        // 1. User Profile Header
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(CineVietRed, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    if (!user?.displayAvatar.isNullOrBlank()) {
                        SubcomposeAsyncImage(
                            model = user!!.displayAvatar,
                            contentDescription = user.name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(CircleShape),
                            loading = {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(
                                        text = (user.name?.firstOrNull() ?: 'U').toString().uppercase(),
                                        color = Color.White,
                                        fontSize = 32.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            },
                            error = {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(
                                        text = (user.name?.firstOrNull() ?: 'U').toString().uppercase(),
                                        color = Color.White,
                                        fontSize = 32.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        )
                    } else {
                        Text(
                            text = (user?.name?.firstOrNull() ?: 'U').toString().uppercase(),
                            color = Color.White,
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = user?.name ?: "Khán giả CineViet",
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    if (!user?.email.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = user.email!!,
                            color = TvOnSurfaceVariant,
                            fontSize = 14.sp
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isLogoutFocused) CineVietRed else TvSurfaceHigh)
                        .border(2.dp, if (isLogoutFocused) Color.White else Color.Transparent, RoundedCornerShape(12.dp))
                        .focusable(interactionSource = logoutSource)
                        .clickable(interactionSource = logoutSource, indication = null) {
                            sessionManager.logout()
                            onLoggedOut()
                        }
                        .padding(horizontal = 24.dp, vertical = 12.dp),
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

        // 2. Favorites Section (Watchlist)
        item {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Danh Sách Yêu Thích (${watchlist.size} phim)",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(16.dp))

                if (isLoadingWatchlist) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(140.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        TvLoadingSpinner()
                    }
                } else if (watchlist.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Chưa có phim nào trong danh sách yêu thích.\nHãy nhấn biểu tượng trái tim ở trang chi tiết phim để lưu vào đây!",
                            color = TvOnSurfaceVariant,
                            fontSize = 14.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            lineHeight = 22.sp
                        )
                    }
                } else {
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        items(watchlist) { movie ->
                            TvMovieCard(
                                movie = movie,
                                onClick = { onNavigateToDetail(movie.effectiveSlug) }
                            )
                        }
                    }
                }
            }
        }
    }
}
