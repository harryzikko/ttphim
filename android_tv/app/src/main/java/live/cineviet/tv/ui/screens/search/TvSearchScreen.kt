package live.cineviet.tv.ui.screens.search

import android.view.KeyEvent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.cineviet.tv.data.models.MovieItem
import live.cineviet.tv.data.models.ShortDramaItem
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.components.TvMovieCard
import live.cineviet.tv.ui.screens.shorts.TvPillButton
import live.cineviet.tv.ui.screens.shorts.TvShortCard
import live.cineviet.tv.ui.theme.*

sealed class TvSearchResultItem {
    data class Movie(val movie: MovieItem) : TvSearchResultItem()
    data class Short(val short: ShortDramaItem) : TvSearchResultItem()
}

@Composable
fun TvSearchScreen(
    onMovieClick: (String) -> Unit,
    onShortClick: (String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()

    var searchQuery by remember { mutableStateOf("") }
    var searchMovieResults by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var searchShortResults by remember { mutableStateOf<List<ShortDramaItem>>(emptyList()) }
    var trendingMovies by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchFilter by remember { mutableStateOf("all") }
    var searchJob by remember { mutableStateOf<Job?>(null) }

    val firstKeyRequester = remember { FocusRequester() }

    // Quick search keywords
    val suggestions = listOf("Chiếu rạp", "Hành động", "Kinh dị", "Tình cảm", "Hàn Quốc", "Anime", "Thuyết minh", "Short Phim")

    fun performSearch(query: String) {
        searchJob?.cancel()
        if (query.isBlank()) {
            searchMovieResults = emptyList()
            searchShortResults = emptyList()
            isSearching = false
            return
        }
        searchJob = scope.launch {
            delay(280)
            isSearching = true
            val movieDeferred = async { repository.searchMovies(query.trim()) }
            val shortDeferred = async { repository.getShortCatalog(keyword = query.trim(), limit = 20) }

            val movieRes = movieDeferred.await()
            val shortRes = shortDeferred.await()

            searchMovieResults = movieRes.getOrDefault(emptyList())
            searchShortResults = shortRes.getOrDefault(null)?.items ?: emptyList()
            isSearching = false
        }
    }

    // Load trending movies when search screen opens so right pane is not empty
    LaunchedEffect(Unit) {
        val result = repository.getCatalog("phim-moi-cap-nhat", page = 1, limit = 18)
        result.onSuccess { trendingMovies = it }
        delay(200)
        try { firstKeyRequester.requestFocus() } catch (_: Exception) {}
    }

    Row(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
            .padding(horizontal = 28.dp, vertical = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(28.dp)
    ) {
        // --- LEFT COLUMN: Search Bar + Virtual TV Keyboard + Suggestion Chips ---
        Column(
            modifier = Modifier
                .width(330.dp)
                .fillMaxHeight()
        ) {
            Text(
                text = "Tìm Kiếm Phim",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Search Input Display Box
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(TvSurfaceHigh)
                    .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = "Search",
                    tint = CineVietRed,
                    modifier = Modifier.size(20.dp)
                )

                Spacer(modifier = Modifier.width(10.dp))

                Box(modifier = Modifier.weight(1f)) {
                    if (searchQuery.isEmpty()) {
                        Text(
                            text = "Nhập tên phim cần tìm...",
                            color = Color.White.copy(alpha = 0.45f),
                            fontSize = 14.sp
                        )
                    } else {
                        Text(
                            text = searchQuery,
                            color = Color.White,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (searchQuery.isNotEmpty()) {
                    val clearSource = remember { MutableInteractionSource() }
                    val isClearFocused by clearSource.collectIsFocusedAsState()

                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (isClearFocused) CineVietRed else TvSurfaceHighest)
                            .focusable(interactionSource = clearSource)
                            .onKeyEvent { keyEvent ->
                                if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                                    (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                                     keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                                     keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                                    searchQuery = ""
                                    performSearch("")
                                    true
                                } else false
                            }
                            .clickable(interactionSource = clearSource, indication = null) {
                                searchQuery = ""
                                performSearch("")
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Clear,
                            contentDescription = "Xóa",
                            tint = Color.White,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Built-in TV Virtual Keyboard
            TvVirtualKeyboard(
                firstKeyRequester = firstKeyRequester,
                onCharClick = { ch ->
                    searchQuery += ch
                    performSearch(searchQuery)
                },
                onSpaceClick = {
                    searchQuery += " "
                    performSearch(searchQuery)
                },
                onBackspaceClick = {
                    if (searchQuery.isNotEmpty()) {
                        searchQuery = searchQuery.dropLast(1)
                        performSearch(searchQuery)
                    }
                },
                onClearClick = {
                    searchQuery = ""
                    performSearch("")
                },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Quick Category Chips
            Text(
                text = "Gợi ý thể loại:",
                color = TvOnSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )

            Spacer(modifier = Modifier.height(6.dp))

            // 2 Small Rows of Suggestion Chips
            val chipRow1 = suggestions.take(4)
            val chipRow2 = suggestions.drop(4)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                chipRow1.forEach { chip ->
                    TvSearchChip(
                        text = chip,
                        onClick = {
                            searchQuery = chip
                            performSearch(chip)
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                chipRow2.forEach { chip ->
                    TvSearchChip(
                        text = chip,
                        onClick = {
                            searchQuery = chip
                            performSearch(chip)
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }

        // --- RIGHT COLUMN: Results or Trending Movies Grid ---
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
        ) {
            val totalResults = searchMovieResults.size + searchShortResults.size
            val isSearchingQuery = searchQuery.isNotBlank()

            val titleText = when {
                isSearching -> "Đang tìm kiếm..."
                isSearchingQuery && totalResults > 0 ->
                    "Tìm thấy $totalResults nội dung cho \"$searchQuery\""
                isSearchingQuery && totalResults == 0 ->
                    "Không tìm thấy nội dung phù hợp với \"$searchQuery\""
                else -> "Gợi ý phim thịnh hành hôm nay"
            }

            Text(
                text = titleText,
                color = if (isSearching) TvOnSurfaceVariant else Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            // Filter Tabs (Tất cả, Phim, Short Phim)
            if (isSearchingQuery && totalResults > 0) {
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TvPillButton(
                        label = "Tất cả ($totalResults)",
                        enabled = true,
                        isActive = searchFilter == "all",
                        onClick = { searchFilter = "all" }
                    )
                    TvPillButton(
                        label = "🎬 Phim (${searchMovieResults.size})",
                        enabled = true,
                        isActive = searchFilter == "movies",
                        onClick = { searchFilter = "movies" }
                    )
                    TvPillButton(
                        label = "⚡ Short Phim (${searchShortResults.size})",
                        enabled = true,
                        isActive = searchFilter == "shorts",
                        onClick = { searchFilter = "shorts" }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (isSearching) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    TvLoadingSpinner(color = CineVietRed)
                }
            } else {
                val displayItems: List<TvSearchResultItem> = remember(searchQuery, searchMovieResults, searchShortResults, trendingMovies, searchFilter) {
                    if (searchQuery.isBlank()) {
                        trendingMovies.map { TvSearchResultItem.Movie(it) }
                    } else {
                        when (searchFilter) {
                            "movies" -> searchMovieResults.map { TvSearchResultItem.Movie(it) }
                            "shorts" -> searchShortResults.map { TvSearchResultItem.Short(it) }
                            else -> {
                                val list = mutableListOf<TvSearchResultItem>()
                                list.addAll(searchMovieResults.map { TvSearchResultItem.Movie(it) })
                                list.addAll(searchShortResults.map { TvSearchResultItem.Short(it) })
                                list
                            }
                        }
                    }
                }

                if (displayItems.isNotEmpty()) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(3),
                            horizontalArrangement = Arrangement.spacedBy(14.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(bottom = 12.dp)
                        ) {
                            items(displayItems) { item ->
                                when (item) {
                                    is TvSearchResultItem.Movie -> TvMovieCard(
                                        movie = item.movie,
                                        onClick = { onMovieClick(item.movie.slug) }
                                    )
                                    is TvSearchResultItem.Short -> TvShortCard(
                                        item = item.short,
                                        onClick = { onShortClick(item.short.slug) }
                                    )
                                }
                            }
                        }

                        // Bottom results count / pagination indicator
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 10.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (isSearchingQuery)
                                    "Hiển thị ${displayItems.size} kết quả phù hợp"
                                else
                                    "Gợi ý phim thịnh hành đề xuất",
                                color = TvOnSurfaceVariant,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                } else if (searchQuery.isNotBlank()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "Không tìm thấy phim hoặc short phim phù hợp với \"$searchQuery\"",
                                color = Color.White,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Vui lòng thử tìm với từ khóa khác hoặc chọn thể loại gợi ý bên cạnh",
                                color = TvOnSurfaceVariant,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TvVirtualKeyboard(
    firstKeyRequester: FocusRequester,
    onCharClick: (Char) -> Unit,
    onSpaceClick: () -> Unit,
    onBackspaceClick: () -> Unit,
    onClearClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val keyboardRows = listOf(
        listOf('A', 'B', 'C', 'D', 'E', 'F'),
        listOf('G', 'H', 'I', 'J', 'K', 'L'),
        listOf('M', 'N', 'O', 'P', 'Q', 'R'),
        listOf('S', 'T', 'U', 'V', 'W', 'X'),
        listOf('Y', 'Z', '1', '2', '3', '4'),
        listOf('5', '6', '7', '8', '9', '0')
    )

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        keyboardRows.forEachIndexed { rowIndex, row ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row.forEachIndexed { colIndex, char ->
                    val isFirstKey = rowIndex == 0 && colIndex == 0
                    TvKeyButton(
                        text = char.toString(),
                        onClick = { onCharClick(char) },
                        modifier = Modifier
                            .weight(1f)
                            .height(38.dp)
                            .then(if (isFirstKey) Modifier.focusRequester(firstKeyRequester) else Modifier)
                    )
                }
            }
        }

        // Action Keys Row
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            TvKeyButton(
                text = "␣ Cách",
                onClick = onSpaceClick,
                modifier = Modifier
                    .weight(3f)
                    .height(38.dp)
            )
            TvKeyButton(
                text = "⌫ Xóa",
                onClick = onBackspaceClick,
                modifier = Modifier
                    .weight(2f)
                    .height(38.dp)
            )
            TvKeyButton(
                text = "✕ Xóa hết",
                onClick = onClearClick,
                modifier = Modifier
                    .weight(2f)
                    .height(38.dp)
            )
        }
    }
}

@Composable
fun TvKeyButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.08f else 1.0f,
        animationSpec = tween(120),
        label = "keyScale"
    )

    Box(
        modifier = modifier
            .scale(scale)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isFocused) CineVietRed else TvSurfaceHigh)
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) Color.White else Color.White.copy(alpha = 0.08f),
                shape = RoundedCornerShape(8.dp)
            )
            .focusable(interactionSource = interactionSource)
            .onKeyEvent { keyEvent ->
                if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                    (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                     keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                     keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                    onClick()
                    true
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = if (isFocused) Color.White else Color.White.copy(alpha = 0.88f),
            fontSize = if (text.length > 2) 11.sp else 14.sp,
            fontWeight = if (isFocused) FontWeight.Bold else FontWeight.SemiBold
        )
    }
}

@Composable
fun TvSearchChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (isFocused) CineVietRed else TvSurfaceHigh)
            .border(
                width = if (isFocused) 1.5.dp else 1.dp,
                color = if (isFocused) Color.White else Color.White.copy(alpha = 0.08f),
                shape = RoundedCornerShape(6.dp)
            )
            .focusable(interactionSource = interactionSource)
            .onKeyEvent { keyEvent ->
                if (keyEvent.nativeKeyEvent.action == KeyEvent.ACTION_DOWN &&
                    (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                     keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER ||
                     keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                    onClick()
                    true
                } else false
            }
            .clickable(interactionSource = interactionSource, indication = null) { onClick() }
            .padding(vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = if (isFocused) Color.White else TvOnSurfaceVariant,
            fontSize = 11.sp,
            fontWeight = if (isFocused) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
