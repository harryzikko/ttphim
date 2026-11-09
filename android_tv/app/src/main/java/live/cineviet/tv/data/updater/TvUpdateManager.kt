package live.cineviet.tv.data.updater

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import live.cineviet.tv.BuildConfig
import live.cineviet.tv.data.api.ApiClient
import live.cineviet.tv.data.models.AppUpdateData
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

object TvUpdateManager {

    private fun isNewerVersion(latest: String, current: String): Boolean {
        try {
            val lParts = latest.trim().split(".").map { it.toIntOrNull() ?: 0 }
            val cParts = current.trim().split(".").map { it.toIntOrNull() ?: 0 }
            val maxLen = maxOf(lParts.size, cParts.size)

            for (i in 0 until maxLen) {
                val l = if (i < lParts.size) lParts[i] else 0
                val c = if (i < cParts.size) cParts[i] else 0
                if (l > c) return true
                if (l < c) return false
            }
        } catch (_: Exception) {}
        return false
    }

    suspend fun checkUpdate(): Result<AppUpdateData?> = withContext(Dispatchers.IO) {
        try {
            val response = ApiClient.service.getAppUpdate()
            if (response.isSuccessful && response.body()?.status == true) {
                val data = response.body()?.data ?: return@withContext Result.success(null)
                if (!data.enabled) return@withContext Result.success(null)

                val hasNewerBuild = data.latestBuild > BuildConfig.VERSION_CODE
                val hasNewerVersion = isNewerVersion(data.latestVersion, BuildConfig.VERSION_NAME)

                if (hasNewerBuild || hasNewerVersion) {
                    Result.success(data)
                } else {
                    Result.success(null)
                }
            } else {
                Result.failure(Exception("Lỗi máy chủ: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun downloadAndInstall(
        context: Context,
        downloadUrl: String,
        onProgress: (Float) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        // Build list of fallback candidate URLs to try in sequence
        val candidates = mutableListOf<String>()

        var sanitized = downloadUrl.trim()
        if (sanitized.isNotBlank()) {
            sanitized = sanitized.replace("TTPhim-AndroidTV-release.apk", "CineViet-AndroidTV-release.apk")
            sanitized = sanitized.replace("TTPhim-Mobile-release.apk", "CineViet-Mobile-release.apk")
            if (sanitized.startsWith("http://cineviet.live")) {
                sanitized = sanitized.replace("http://cineviet.live", "https://cineviet.live")
            }
            if (!sanitized.startsWith("http://") && !sanitized.startsWith("https://")) {
                sanitized = "https://cineviet.live${if (sanitized.startsWith("/")) "" else "/"}$sanitized"
            }
            candidates.add(sanitized)
        }

        // Direct production VPS endpoint fallback
        val vpsUrl = "https://cineviet.live/downloads/CineViet-AndroidTV-release.apk"
        if (!candidates.contains(vpsUrl)) {
            candidates.add(vpsUrl)
        }

        // Official GitHub Releases latest fallback
        val githubUrl = "https://github.com/harryzikko/ttphim/releases/latest/download/CineViet-AndroidTV-release.apk"
        if (!candidates.contains(githubUrl)) {
            candidates.add(githubUrl)
        }

        val targetDir = context.getExternalFilesDir(null) ?: context.cacheDir
        val updateFile = File(targetDir, "CineViet_TV_update.apk")

        var downloadSucceeded = false
        var lastErrorMsg = "Không thể kết nối đến máy chủ cập nhật"

        for (candidateUrl in candidates) {
            try {
                if (updateFile.exists()) {
                    updateFile.delete()
                }

                val request = Request.Builder()
                    .url(candidateUrl)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android TV) CineViet-AndroidTV-Updater/1.0")
                    .build()

                val client = ApiClient.imageOkHttpClient
                val response = client.newCall(request).execute()

                if (!response.isSuccessful) {
                    lastErrorMsg = "Máy chủ phản hồi mã lỗi ${response.code} khi tải từ: $candidateUrl"
                    continue
                }

                val body = response.body ?: continue
                val totalBytes = body.contentLength()

                body.byteStream().use { input ->
                    FileOutputStream(updateFile).use { output ->
                        val buffer = ByteArray(32 * 1024)
                        var bytesRead: Int
                        var totalRead = 0L

                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            totalRead += bytesRead
                            if (totalBytes > 0) {
                                val progress = totalRead.toFloat() / totalBytes.toFloat()
                                withContext(Dispatchers.Main) {
                                    onProgress(progress)
                                }
                            } else {
                                withContext(Dispatchers.Main) {
                                    onProgress(-1f)
                                }
                            }
                        }
                        output.flush()
                    }
                }

                // Verify file downloaded correctly (at least 1 MB)
                if (updateFile.exists() && updateFile.length() > 1024 * 1024) {
                    downloadSucceeded = true
                    break
                } else {
                    lastErrorMsg = "Tệp tải về không hợp lệ (kích thước quá nhỏ: ${updateFile.length()} bytes)"
                }
            } catch (e: Exception) {
                lastErrorMsg = "Lỗi khi tải từ $candidateUrl: ${e.localizedMessage ?: e.message}"
            }
        }

        if (downloadSucceeded) {
            withContext(Dispatchers.Main) {
                onProgress(1.0f)
                triggerInstall(context, updateFile, onError)
            }
        } else {
            withContext(Dispatchers.Main) {
                onError("Không thể tải bản cập nhật: $lastErrorMsg")
            }
        }
    }

    fun triggerInstall(context: Context, apkFile: File, onError: (String) -> Unit) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    onError("Vui lòng bật quyền 'Cho phép cài đặt từ nguồn này' cho CineViet TV trong cài đặt máy, sau đó bấm Thử tải lại.")
                    return
                }
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }

            // Explicitly grant read URI permission to all potential package installers
            val resInfoList = context.packageManager.queryIntentActivities(
                installIntent,
                PackageManager.MATCH_DEFAULT_ONLY
            )
            for (resolveInfo in resInfoList) {
                context.grantUriPermission(
                    resolveInfo.activityInfo.packageName,
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }

            context.startActivity(installIntent)
        } catch (e: Exception) {
            onError("Không thể khởi động trình cài đặt: ${e.localizedMessage ?: e.message}")
        }
    }
}
