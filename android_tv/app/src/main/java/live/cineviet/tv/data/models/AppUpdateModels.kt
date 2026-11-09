package live.cineviet.tv.data.models

import com.google.gson.annotations.SerializedName

data class AppUpdateData(
    @SerializedName("enabled")
    val enabled: Boolean = true,
    @SerializedName("latest_version")
    val latestVersion: String = "1.0.0",
    @SerializedName("latest_build")
    val latestBuild: Int = 1,
    @SerializedName("force_update")
    val forceUpdate: Boolean = false,
    @SerializedName("title")
    val title: String = "Bản Cập Nhật CineViet Mới",
    @SerializedName("release_notes")
    val releaseNotes: String = "",
    @SerializedName("apk_mobile_url")
    val apkMobileUrl: String = "",
    @SerializedName("apk_tv_url")
    val apkTvUrl: String = "",
    @SerializedName("ios_url")
    val iosUrl: String = ""
)
