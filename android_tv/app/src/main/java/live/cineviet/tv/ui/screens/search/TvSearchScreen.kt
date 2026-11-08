package live.cineviet.tv.ui.screens.search

import android.view.KeyEvent
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Icon
import androidx.tv.material3.Text
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import live.cineviet.tv.data.models.MovieItem
import live.cineviet.tv.data.repository.MovieRepository
import live.cineviet.tv.ui.components.TvLoadingSpinner
import live.cineviet.tv.ui.components.TvMovieCard
import live.cineviet.tv.ui.theme.*

@Composable
fun TvSearchScreen(
    onMovieClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val repository = remember { MovieRepository() }
    val scope = rememberCoroutineScope()
    val keyboardController = LocalSoftwareKeyboardController.current

    var searchQuery by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<MovieItem>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchJob by remember { mutableStateOf<Job?>(null) }

    val searchFocusRequester = remember { FocusRequester() }
    val searchInteractionSource = remember { MutableInteractionSource() }
    val isSearchFocused by searchInteractionSource.collectIsFocusedAsState()

    // Quick search keywords
    val suggestions = listOf("Chiếu rạp", "Hành động", "Kinh dị", "Tình cảm", "Hàn Quốc", "Trung Quốc", "Anime", "Thuyết minh")

    fun performSearch(query: String) {
        searchJob?.cancel()
        if (query.isBlank()) {
            searchResults = emptyList()
            isSearching = false
            return
        }
        searchJob = scope.launch {
            delay(300)
            isSearching = true
            val result = repository.searchMovies(query.trim())
            result.onSuccess {
                searchResults = it
                isSearching = false
            }.onFailure {
                searchResults = emptyList()
                isSearching = false
            }
        }
    }

    // Auto focus the search input field and show IME when entering Search screen
    LaunchedEffect(Unit) {
        delay(200)
        try {
            searchFocusRequester.requestFocus()
            keyboardController?.show()
        } catch (_: Exception) {}
    }

    // Re-trigger IME when input field gains focus
    LaunchedEffect(isSearchFocused) {
        if (isSearchFocused) {
            delay(100)
            keyboardController?.show()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TvBackground)
            .padding(horizontal = 36.dp, vertical = 24.dp)
    ) {
        // Search Header & Input Box
        Text(
            text = "Tìm Kiếm Phim",
            color = Color.White,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(14.dp))

        // Search Input Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(TvSurfaceHigh)
                .border(
                    width = if (isSearchFocused) 2.5.dp else 1.dp,
                    color = if (isSearchFocused) CineVietRed else Color.White.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clickable(interactionSource = searchInteractionSource, indication = null) {
                    searchFocusRequester.requestFocus()
                    keyboardController?.show()
                }
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = "Search",
                tint = if (isSearchFocused) CineVietRed else TvOnSurfaceVariant,
                modifier = Modifier.size(24.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Box(modifier = Modifier.weight(1f)) {
                if (searchQuery.isEmpty()) {
                    Text(
                        text = "Nhập tên phim, diễn viên hoặc thể loại...",
                        color = TvOnSurfaceVariant.copy(alpha = 0.7f),
                        fontSize = 15.sp
                    )
                }

                BasicTextField(
                    value = searchQuery,
                    onValueChange = {
                        searchQuery = it
                        performSearch(it)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(searchFocusRequester)
                        .focusable(interactionSource = searchInteractionSource)
                        .onKeyEvent { keyEvent ->
                            if (keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                                keyEvent.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_ENTER
                            ) {
                                keyboardController?.show()
                                false
                            } else {
                                false
                            }
                        },
                    textStyle = TextStyle(
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    ),
                    singleLine = true,
                    cursorBrush = SolidColor(CineVietRed),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(
                        onSearch = {
                            keyboardController?.hide()
                            performSearch(searchQuery)
                        }
                    )
                )
            }

            if (searchQuery.isNotEmpty()) {
                val clearSource = remember { MutableInteractionSource() }
                val isClearFocused by clearSource.collectIsFocusedAsState()

                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (isClearFocused) CineVietRed else Color.Transparent)
                        .focusable(interactionSource = clearSource)
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
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // Quick Suggestion Chips Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            suggestions.forEach { suggestion ->
                val chipSource = remember { MutableInteractionSource() }
                val isChipFocused by chipSource.collectIsFocusedAsState()

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isChipFocused) CineVietRed else TvSurface)
                        .border(
                            width = 1.dp,
                            color = if (isChipFocused) Color.White else Color.White.copy(alpha = 0.08f),
                            shape = RoundedCornerShape(8.dp)
                        )
                        .focusable(interactionSource = chipSource)
                        .clickable(interactionSource = chipSource, indication = null) {
                            searchQuery = suggestion
                            performSearch(suggestion)
                            keyboardController?.hide()
                        }
                        .padding(horizontal = 14.dp, vertical = 7.dp)
                ) {
                    Text(
                        text = suggestion,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = if (isChipFocused) FontWeight.Bold else FontWeight.Medium
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Results Section
        if (isSearching) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                TvLoadingSpinner(color = CineVietRed)
            }
        } else if (searchResults.isNotEmpty()) {
            Text(
                text = "Kết quả tìm kiếm (${searchResults.size} phim)",
                color = TvOnSurfaceVariant,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )

            Spacer(modifier = Modifier.height(12.dp))

            LazyVerticalGrid(
                columns = GridCells.Fixed(5),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 32.dp)
            ) {
                items(searchResults) { movie ->
                    TvMovieCard(
                        movie = movie,
                        onClick = { onMovieClick(movie.slug) }
                    )
                }
            }
        } else if (searchQuery.isNotEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Không tìm thấy phim phù hợp với \"$searchQuery\"",
                    color = TvOnSurfaceVariant,
                    fontSize = 15.sp
                )
            }
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Nhập từ khóa tìm kiếm hoặc chọn danh mục gợi ý ở trên",
                    color = TvOnSurfaceVariant.copy(alpha = 0.5f),
                    fontSize = 14.sp
                )
            }
        }
    }
}
