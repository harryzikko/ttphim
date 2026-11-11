package live.cineviet.tv.data.models

import com.google.gson.annotations.SerializedName

fun resolveShortTvUrl(raw: String?): String {
    val trimmed = raw?.trim().orEmpty()
    if (trimmed.isEmpty()) return ""
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
    return if (trimmed.startsWith("/")) {
        "https://cineviet.live$trimmed"
    } else {
        "https://cineviet.live/$trimmed"
    }
}

data class ShortCatalogData(
    @SerializedName("items") val items: List<ShortDramaItem> = emptyList(),
    @SerializedName("genres") val genres: List<String> = emptyList(),
    @SerializedName("pagination") val pagination: ShortPagination = ShortPagination()
)

data class ShortPagination(
    @SerializedName("page") val page: Int = 1,
    @SerializedName("limit") val limit: Int = 25,
    @SerializedName("hasMore") val hasMore: Boolean = false
)

data class ShortDramaItem(
    @SerializedName("id") val id: String = "",
    @SerializedName("slug") val slug: String = "",
    @SerializedName("name") val name: String = "",
    @SerializedName("poster_url") val posterUrl: String = "",
    @SerializedName("poster_fallback_url") val posterFallbackUrl: String = "",
    @SerializedName("background_url") val backgroundUrl: String = "",
    @SerializedName("description") val description: String = "",
    @SerializedName("episode_count_hint") val episodeCountHint: Int? = null,
    @SerializedName("total_episodes") val totalEpisodes: Int? = null
)

data class ShortDetailData(
    @SerializedName("item") val item: ShortDramaItem = ShortDramaItem(),
    @SerializedName("episodes") val episodes: List<ShortEpisodeItem> = emptyList()
)

data class ShortEpisodeItem(
    @SerializedName("episode") val episode: Int = 1,
    @SerializedName("video_id") val videoId: String = "",
    @SerializedName("title") val title: String = "",
    @SerializedName("thumbnail_url") val thumbnailUrl: String = ""
)

data class ShortStreamData(
    @SerializedName("slug") val slug: String = "",
    @SerializedName("episode") val episode: Int = 1,
    @SerializedName("servers") val servers: List<ShortStreamServer> = emptyList()
)

data class ShortSubtitleItem(
    @SerializedName("id") val id: String = "",
    @SerializedName("lang") val lang: String = "vi",
    @SerializedName("label") val label: String = "Tiếng Việt",
    @SerializedName("proxy_url") val proxyUrl: String = "",
    @SerializedName("url") val url: String = ""
) {
    val resolvedUrl: String
        get() = resolveShortTvUrl(proxyUrl.ifBlank { url })
}

data class ShortStreamServer(
    @SerializedName("name") val name: String = "",
    @SerializedName("raw_title") val rawTitle: String = "",
    @SerializedName("is_full") val isFull: Boolean = false,
    @SerializedName("url") val url: String = "",
    @SerializedName("subtitles") val subtitles: List<ShortSubtitleItem> = emptyList()
) {
    val resolvedStreamUrl: String
        get() = resolveShortTvUrl(url)

    val resolvedCandidateUrls: List<String>
        get() {
            val primary = resolvedStreamUrl
            if (primary.isEmpty()) return emptyList()
            val lower = primary.lowercase()
            val out = mutableListOf<String>()
            if (lower.contains("/api/shortflix/playlist?")) {
                out.add(primary.replaceFirst("/api/shortflix/playlist?", "/api/shortflix/playlist.m3u8?", ignoreCase = true))
                out.add(primary)
                return out.distinct()
            }
            out.add(primary)
            if (!lower.contains("/api/shortflix/playlist.m3u8?")) {
                out.add("https://cineviet.live/api/shortflix/playlist.m3u8?url=${java.net.URLEncoder.encode(primary, "UTF-8")}")
            }
            return out.distinct()
        }
}
