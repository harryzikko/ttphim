package live.cineviet.tv.data.models

import com.google.gson.annotations.SerializedName

data class TvSession(
    @SerializedName("token") val token: String = "",
    @SerializedName("code") val code: String = "",
    @SerializedName("qr_url") val qrUrl: String? = null,
    @SerializedName("expires_in") val expiresIn: Any? = 300,
    @SerializedName("expires_at") val expiresAt: Any? = 0
) {
    val effectiveExpiresIn: Int
        get() = expiresIn?.toString()?.toDoubleOrNull()?.toInt() ?: 300

    val effectiveExpiresAt: Long
        get() = expiresAt?.toString()?.toDoubleOrNull()?.toLong() ?: 0L
}

data class TvStatusResponse(
    @SerializedName("status") val status: String = "", // "pending", "approved", "expired"
    @SerializedName("token") val token: String? = null,
    @SerializedName("user") val user: UserDto? = null,
    @SerializedName("expires_in") val expiresIn: Any? = null,
    @SerializedName("message") val message: String? = null
)

data class UserDto(
    @SerializedName("id") val id: Any? = null,
    @SerializedName("name") val name: String? = null,
    @SerializedName("username") val username: String? = null,
    @SerializedName("email") val email: String? = null,
    @SerializedName("role") val role: String? = null,
    @SerializedName("avatar") val avatar: String? = null
) {
    val displayAvatar: String
        get() {
            if (avatar.isNullOrBlank()) return ""
            if (avatar.startsWith("http://") || avatar.startsWith("https://")) return avatar
            val clean = if (avatar.startsWith("/")) avatar else "/$avatar"
            return "https://cineviet.live$clean"
        }
}
