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
    @SerializedName("movie_slug") val movieSlug: String? = null,
    @SerializedName("movie_name") val movieName: String? = null,
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
    @SerializedName("view") val view: Any? = null,
    @SerializedName("imdb_rating") val imdbRating: Any? = null,
    @SerializedName("has_song_ngu") val rawHasSongNgu: Boolean? = null,
    @SerializedName("hasSongNgu") val altHasSongNgu: Boolean? = null
) {
    val effectiveSlug: String
        get() = if (slug.isNotBlank()) slug else (movieSlug ?: "")

    val effectiveName: String
        get() = if (name.isNotBlank()) name else (movieName ?: "")

    val hasSongNgu: Boolean
        get() = rawHasSongNgu == true ||
                altHasSongNgu == true ||
                lang?.contains("Song Ngữ", ignoreCase = true) == true ||
                lang?.contains("Song Ngu", ignoreCase = true) == true ||
                type?.equals("song-ngu", ignoreCase = true) == true

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
    @SerializedName("banner_title") val bannerTitle: String? = null,
    @SerializedName("banner_description") val bannerDescription: String? = null,
    @SerializedName("origin_name") val originName: String? = null,
    @SerializedName("type") val type: String? = null,
    @SerializedName("poster_url") val posterUrl: String? = null,
    @SerializedName("thumb_url") val thumbUrl: String? = null,
    @SerializedName("hero_backdrop_url") val heroBackdropUrl: String? = null,
    @SerializedName("hero_backdrop_fallback") val heroBackdropFallback: String? = null,
    @SerializedName("hero_poster_url") val heroPosterUrl: String? = null,
    @SerializedName("hero_poster_fallback") val heroPosterFallback: String? = null,
    @SerializedName("banner_mobile") val bannerMobile: String? = null,
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
    val displayName: String
        get() = bannerTitle?.takeIf { it.isNotBlank() } ?: name

    val displayContent: String
        get() = bannerDescription?.takeIf { it.isNotBlank() } ?: content ?: ""
    private fun sanitizeTmdb(url: String?): String {
        if (url.isNullOrBlank()) return ""
        // Replace 4K TMDB "original" image with 1080p/720p "w1280" to save memory and avoid TV timeout
        if (url.contains("image.tmdb.org/t/p/original/")) {
            return url.replace("image.tmdb.org/t/p/original/", "image.tmdb.org/t/p/w1280/")
        }
        return url
    }

    private fun sanitizePosterTmdb(url: String?): String {
        if (url.isNullOrBlank()) return ""
        if (url.contains("image.tmdb.org/t/p/original/")) {
            return url.replace("image.tmdb.org/t/p/original/", "image.tmdb.org/t/p/w500/")
        }
        return url
    }

    val displayBackdrop: String
        get() {
            val candidate = sanitizeTmdb(heroBackdropUrl)
            if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate
            return backdropFallback
        }

    val backdropFallback: String
        get() {
            val fallback = heroBackdropFallback ?: thumbUrl ?: posterUrl ?: ""
            if (fallback.startsWith("http://") || fallback.startsWith("https://")) return fallback
            if (fallback.isNotBlank()) return "https://phimimg.com/$fallback"
            return ""
        }

    // Direct KKPhim CDN is 100% reliable and fast in Vietnam
    val displayPoster: String
        get() {
            val candidate = heroPosterFallback ?: posterUrl ?: sanitizePosterTmdb(heroPosterUrl) ?: thumbUrl ?: ""
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
    @SerializedName("views") val views: Any? = null,
    @SerializedName("real_views") val realViews: Any? = null,
    @SerializedName("rank") val rank: Any? = 1
) {
    val displayPoster: String
        get() {
            val url = posterUrl ?: thumbUrl ?: ""
            if (url.startsWith("http://") || url.startsWith("https://")) return url
            if (url.isNotBlank()) return "https://phimimg.com/$url"
            return ""
        }

    val displayViews: String
        get() {
            if (views != null) {
                val str = views.toString().trim()
                if (str.isNotEmpty() && str != "null") {
                    val num = str.toDoubleOrNull()
                    if (num != null) {
                        return if (num >= 1000) String.format("%.1fk", num / 1000) else num.toLong().toString()
                    }
                    return str
                }
            }
            if (realViews != null) {
                val num = realViews.toString().toDoubleOrNull()?.toLong()
                if (num != null && num > 0) return String.format("%,d", num).replace(',', '.')
            }
            return ""
        }

    val rankNumber: Int
        get() = rank?.toString()?.toDoubleOrNull()?.toInt() ?: 1
}

data class CatalogData(
    @SerializedName("items") val items: List<MovieItem> = emptyList(),
    @SerializedName("pagination") val pagination: CatalogPagination? = null
)

data class CatalogPagination(
    @SerializedName("totalItems") val totalItems: Any? = null,
    @SerializedName("totalItemsPerPage") val totalItemsPerPage: Any? = null,
    @SerializedName("currentPage") val currentPage: Any? = null,
    @SerializedName("totalPages") val totalPages: Any? = null
)

data class UserLibraryData(
    @SerializedName("watchlist") val watchlist: List<MovieItem> = emptyList(),
    @SerializedName("history") val history: List<WatchHistoryItem> = emptyList(),
    @SerializedName("continueWatching") val continueWatching: List<WatchHistoryItem> = emptyList()
)

data class WatchHistoryItem(
    @SerializedName("movie_slug") val movieSlug: String = "",
    @SerializedName("movie_name") val movieName: String = "",
    @SerializedName("poster_url") val posterUrl: String? = null,
    @SerializedName("thumb_url") val thumbUrl: String? = null,
    @SerializedName("episode_name") val episodeName: String? = null,
    @SerializedName("episode_slug") val episodeSlug: String? = null,
    @SerializedName("current_time") val currentTime: Any? = null,
    @SerializedName("position_seconds") val positionSeconds: Any? = null,
    @SerializedName("duration") val duration: Any? = null,
    @SerializedName("duration_seconds") val durationSeconds: Any? = null,
    @SerializedName("progress_percent") val progressPercent: Any? = null,
    @SerializedName("has_song_ngu") val hasSongNgu: Boolean = false
) {
    val displayThumb: String
        get() {
            val url = thumbUrl ?: posterUrl ?: ""
            if (url.startsWith("http://") || url.startsWith("https://")) return url
            if (url.isNotBlank()) return "https://phimimg.com/$url"
            return ""
        }

    val currentTimeSeconds: Long
        get() {
            val sec = currentTime?.toString()?.toDoubleOrNull()
                ?: positionSeconds?.toString()?.toDoubleOrNull()
                ?: 0.0
            return sec.toLong()
        }

    val durationSecondsVal: Long
        get() {
            val sec = duration?.toString()?.toDoubleOrNull()
                ?: durationSeconds?.toString()?.toDoubleOrNull()
                ?: 0.0
            return sec.toLong()
        }

    val currentTimeMs: Long
        get() = currentTimeSeconds * 1000L

    val progressPercentInt: Int
        get() {
            val p = progressPercent?.toString()?.toDoubleOrNull()?.toInt()
            if (p != null && p > 0) return p.coerceIn(0, 100)
            val curr = currentTimeSeconds.toDouble()
            val dur = durationSecondsVal.toDouble()
            return if (dur > 0) ((curr / dur) * 100).toInt().coerceIn(0, 100) else 0
        }

    val progressRatio: Float
        get() = (progressPercentInt / 100f).coerceIn(0f, 1f)

    val formattedRemainingOrTime: String
        get() {
            val curr = currentTimeSeconds
            val dur = durationSecondsVal
            if (dur > curr && curr > 0) {
                val remainMins = Math.ceil((dur - curr) / 60.0).toLong()
                if (remainMins > 0) return "Còn $remainMins phút"
            }
            if (progressPercentInt > 0) {
                return "Đã xem $progressPercentInt%"
            }
            if (curr > 0) {
                val mins = curr / 60
                val secs = curr % 60
                return String.format("%02d:%02d", mins, secs)
            }
            return ""
        }
}
