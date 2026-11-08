package live.cineviet.tv.data.models

import com.google.gson.annotations.SerializedName

data class MovieDetailData(
    @SerializedName("movie") val movie: MovieDetail = MovieDetail(),
    @SerializedName("episodes") val episodes: List<EpisodeServer> = emptyList(),
    @SerializedName("inWatchlist") val inWatchlist: Boolean = false
)

data class MovieDetail(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = "",
    @SerializedName("origin_name") val originName: String? = null,
    @SerializedName("content") val content: String? = null,
    @SerializedName("type") val type: String? = null,
    @SerializedName("status") val status: String? = null,
    @SerializedName("thumb_url") val thumbUrl: String? = null,
    @SerializedName("poster_url") val posterUrl: String? = null,
    @SerializedName("trailer_url") val trailerUrl: String? = null,
    @SerializedName("time") val time: String? = null,
    @SerializedName("episode_current") val episodeCurrent: String? = null,
    @SerializedName("episode_total") val episodeTotal: String? = null,
    @SerializedName("quality") val quality: String? = null,
    @SerializedName("lang") val lang: String? = null,
    @SerializedName("year") val year: Any? = null,
    @SerializedName("view") val view: Long? = 0,
    @SerializedName("actor") val actor: List<String>? = emptyList(),
    @SerializedName("director") val director: List<String>? = emptyList(),
    @SerializedName("category") val category: List<CategoryItem>? = emptyList(),
    @SerializedName("country") val country: List<CountryItem>? = emptyList(),
    @SerializedName("tmdb_cast") val tmdbCast: List<TmdbCast>? = emptyList(),
    @SerializedName("tmdb_directors") val tmdbDirectors: List<TmdbDirector>? = emptyList()
) {
    fun getBackdrop(): String {
        val candidate = thumbUrl ?: posterUrl ?: ""
        if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate
        if (candidate.isNotBlank()) return "https://phimimg.com/$candidate"
        return ""
    }

    fun getPoster(): String {
        val candidate = posterUrl ?: thumbUrl ?: ""
        if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate
        if (candidate.isNotBlank()) return "https://phimimg.com/$candidate"
        return ""
    }
}

data class CategoryItem(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = ""
)

data class CountryItem(
    @SerializedName("id") val id: String? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = ""
)

data class TmdbCast(
    @SerializedName("id") val id: Long? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("character") val character: String? = null,
    @SerializedName("profile_path") val profilePath: String? = null
) {
    val portraitUrl: String
        get() {
            if (profilePath.isNullOrBlank()) return ""
            if (profilePath.startsWith("http://") || profilePath.startsWith("https://")) return profilePath
            return "https://image.tmdb.org/t/p/w185$profilePath"
        }
}

data class TmdbDirector(
    @SerializedName("id") val id: Long? = null,
    @SerializedName("name") val name: String = "",
    @SerializedName("job") val job: String? = null,
    @SerializedName("profile_path") val profilePath: String? = null
) {
    val portraitUrl: String
        get() {
            if (profilePath.isNullOrBlank()) return ""
            if (profilePath.startsWith("http://") || profilePath.startsWith("https://")) return profilePath
            return "https://image.tmdb.org/t/p/w185$profilePath"
        }
}

data class EpisodeServer(
    @SerializedName("server_name") val serverName: String = "",
    @SerializedName("server_data") val serverData: List<EpisodeItem> = emptyList()
)

data class EpisodeItem(
    @SerializedName("name") val name: String = "",
    @SerializedName("slug") val slug: String = "",
    @SerializedName("filename") val filename: String? = null,
    @SerializedName("link_embed") val linkEmbed: String? = null,
    @SerializedName("link_m3u8") val linkM3u8: String? = null
)
