package live.cineviet.tv.ui.navigation

sealed class TvScreen {
    object Home : TvScreen()
    object Series : TvScreen()
    object Singles : TvScreen()
    object Search : TvScreen()
    object Login : TvScreen()
    object Account : TvScreen()
    data class Detail(val slug: String) : TvScreen()
    data class Player(val slug: String, val epSlug: String? = null, val serverIdx: Int = 0) : TvScreen()
}
