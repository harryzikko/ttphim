package live.cineviet.tv.data.updater

import android.content.Context
import android.content.Intent
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
        try {
            var cleanUrl = downloadUrl.trim()
            if (cleanUrl.isBlank()) {
                withContext(Dispatchers.Main) {
                    onError("Đường dẫn tải APK cập nhật trống!")
                }
                return@withContext
            }

            if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
                cleanUrl = "https://cineviet.live${if (cleanUrl.startsWith("/")) "" else "/"}$cleanUrl"
            }

            val request = Request.Builder()
                .url(cleanUrl)
                .header("User-Agent", "CineViet-AndroidTV-Updater/1.0")
                .build()

            val client = ApiClient.imageOkHttpClient
            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                withContext(Dispatchers.Main) {
                    onError("Không thể tải bản cập nhật (Mã lỗi ${response.code})")
                }
                return@withContext
            }

            val body = response.body ?: run {
                withContext(Dispatchers.Main) { onError("Phản hồi từ máy chủ trống") }
                return@withContext
            }

            val totalBytes = body.contentLength()
            val updateFile = File(context.cacheDir, "CineViet_TV_update.apk")
            if (updateFile.exists()) {
                updateFile.delete()
            }

            body.byteStream().use { input ->
                FileOutputStream(updateFile).use { output ->
                    val buffer = ByteArray(8 * 1024)
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

            withContext(Dispatchers.Main) {
                onProgress(1.0f)
                triggerInstall(context, updateFile, onError)
            }

        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                onError("Lỗi trong quá trình tải: ${e.localizedMessage ?: e.message}")
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
                    onError("Vui lòng bật quyền 'Cho phép cài đặt từ nguồn này' cho ứng dụng CineViet TV, sau đó bấm Cập nhật lại.")
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
            }

            context.startActivity(installIntent)
        } catch (e: Exception) {
            onError("Không thể khởi động trình cài đặt: ${e.localizedMessage ?: e.message}")
        }
    }
}
