package live.cineviet.tv.ui.navigation

sealed class TvScreen {
    object Home : TvScreen()
    object Series : TvScreen()
    object Singles : TvScreen()
    object Shorts : TvScreen()
    object Search : TvScreen()
    object Login : TvScreen()
    object Account : TvScreen()
    data class Detail(val slug: String) : TvScreen()
    data class ShortDetail(val slug: String) : TvScreen()
    data class ShortPlayer(
        val slug: String,
        val episode: Int = 1,
        val preferFull: Boolean = false
    ) : TvScreen()
    data class Player(
        val slug: String,
        val epSlug: String? = null,
        val serverIdx: Int = 0,
        val startPositionMs: Long = 0L
    ) : TvScreen()
}
