package live.cineviet.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import live.cineviet.tv.ui.navigation.TvScreen
import live.cineviet.tv.ui.screens.detail.TvDetailScreen
import live.cineviet.tv.ui.screens.main.TvMainScreen
import live.cineviet.tv.ui.screens.player.TvPlayerScreen
import live.cineviet.tv.ui.theme.CineVietTvTheme
import live.cineviet.tv.ui.theme.TvBackground

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = application as CineVietTvApp
        val sessionManager = app.sessionManager

        setContent {
            CineVietTvTheme {
                val backStack = remember { mutableStateListOf<TvScreen>(TvScreen.Home) }
                val currentScreen = backStack.lastOrNull() ?: TvScreen.Home

                BackHandler(enabled = backStack.size > 1) {
                    if (backStack.size > 1) {
                        backStack.removeAt(backStack.lastIndex)
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(TvBackground)
                ) {
                    when (currentScreen) {
                        is TvScreen.Home,
                        is TvScreen.Series,
                        is TvScreen.Singles,
                        is TvScreen.Search,
                        is TvScreen.Login,
                        is TvScreen.Account -> {
                            TvMainScreen(
                                sessionManager = sessionManager,
                                onNavigateToDetail = { slug ->
                                    backStack.add(TvScreen.Detail(slug))
                                },
                                onNavigateToPlayer = { slug, epSlug ->
                                    backStack.add(TvScreen.Player(slug, epSlug, 0))
                                }
                            )
                        }

                        is TvScreen.Detail -> {
                            TvDetailScreen(
                                slug = currentScreen.slug,
                                onBack = {
                                    if (backStack.size > 1) {
                                        backStack.removeAt(backStack.lastIndex)
                                    }
                                },
                                onPlayEpisode = { slug, epSlug, serverIdx ->
                                    backStack.add(TvScreen.Player(slug, epSlug, serverIdx))
                                }
                            )
                        }

                        is TvScreen.Player -> {
                            TvPlayerScreen(
                                slug = currentScreen.slug,
                                initialEpisodeSlug = currentScreen.epSlug,
                                serverIndex = currentScreen.serverIdx,
                                onBack = {
                                    if (backStack.size > 1) {
                                        backStack.removeAt(backStack.lastIndex)
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
