package live.cineviet.tv.data.models

import com.google.gson.annotations.SerializedName

data class HomeData(
    @SerializedName("spotlights") val spotlights: List<SpotlightMovie> = emptyList(),
    @SerializedName("rankings") val rankings: List<RankingMovie> = emptyList(),
    @SerializedName("latest") val latest: List<MovieItem> = emptyList(),
    @SerializedName("cinema") val cinema: List<MovieItem> = emptyList(),
    @SerializedName("series") val series: List<MovieItem> = emptyList(),
    @SerializedName("singles") val singles: List<MovieItem> = emptyList(),
    @SerializedName("tvshows") val tvshows: List<MovieItem> = emptyList(),
    @SerializedName("anime") val anime: List<MovieItem> = emptyList(),
    @SerializedName("hero_enabled") val heroEnabled: Boolean = true
)

data class MovieItem(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = "",
    @SerializedName("origin_name") val originName: String? = null,
    @SerializedName("poster_url") val posterUrl: String? = null,
    @SerializedName("thumb_url") val thumbUrl: String? = null,
    @SerializedName("year") val year: Any? = null,
    @SerializedName("time") val time: String? = null,
    @SerializedName("quality") val quality: String? = null,
    @SerializedName("lang") val lang: String? = null,
    @SerializedName("episode_current") val episodeCurrent: String? = null,
    @SerializedName("episode_total") val episodeTotal: String? = null,
    @SerializedName("type") val type: String? = null,
    @SerializedName("view") val view: Long? = 0,
    @SerializedName("imdb_rating") val imdbRating: Any? = null,
    @SerializedName("has_song_ngu") val hasSongNgu: Boolean = false
) {
    fun getFullImageUrl(url: String?): String {
        if (url.isNullOrBlank()) return ""
        if (url.startsWith("http://") || url.startsWith("https://")) return url
        return "https://phimimg.com/$url"
    }

    val displayPoster: String
        get() = getFullImageUrl(posterUrl ?: thumbUrl)

    val displayThumb: String
        get() = getFullImageUrl(thumbUrl ?: posterUrl)
}

data class SpotlightMovie(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = "",
    @SerializedName("origin_name") val originName: String? = null,
    @SerializedName("type") val type: String? = null,
    @SerializedName("poster_url") val posterUrl: String? = null,
    @SerializedName("thumb_url") val thumbUrl: String? = null,
    @SerializedName("hero_backdrop_url") val heroBackdropUrl: String? = null,
    @SerializedName("hero_poster_url") val heroPosterUrl: String? = null,
    @SerializedName("year") val year: Any? = null,
    @SerializedName("time") val time: String? = null,
    @SerializedName("quality") val quality: String? = null,
    @SerializedName("lang") val lang: String? = null,
    @SerializedName("has_song_ngu") val hasSongNgu: Boolean = false,
    @SerializedName("content") val content: String? = null,
    @SerializedName("rating") val rating: Any? = null,
    @SerializedName("first_episode_slug") val firstEpisodeSlug: String? = null,
    @SerializedName("trailer_url") val trailerUrl: String? = null,
    @SerializedName("cta_label") val ctaLabel: String? = null
) {
    val displayBackdrop: String
        get() {
            val candidate = heroBackdropUrl ?: thumbUrl ?: posterUrl ?: ""
            if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate
            if (candidate.isNotBlank()) return "https://phimimg.com/$candidate"
            return ""
        }

    val displayPoster: String
        get() {
            val candidate = heroPosterUrl ?: posterUrl ?: thumbUrl ?: ""
            if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate
            if (candidate.isNotBlank()) return "https://phimimg.com/$candidate"
            return ""
        }
}

data class RankingMovie(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = "",
    @SerializedName("origin_name") val originName: String? = null,
    @SerializedName("poster_url") val posterUrl: String? = null,
    @SerializedName("thumb_url") val thumbUrl: String? = null,
    @SerializedName("year") val year: Any? = null,
    @SerializedName("quality") val quality: String? = null,
    @SerializedName("episode_current") val episodeCurrent: String? = null,
    @SerializedName("views") val views: Long? = 0,
    @SerializedName("real_views") val realViews: Long? = 0,
    @SerializedName("rank") val rank: Int? = 1
) {
    val displayPoster: String
        get() {
            val url = posterUrl ?: thumbUrl ?: ""
            if (url.startsWith("http://") || url.startsWith("https://")) return url
            if (url.isNotBlank()) return "https://phimimg.com/$url"
            return ""
        }
}
