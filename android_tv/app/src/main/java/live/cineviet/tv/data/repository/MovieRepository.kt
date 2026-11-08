package live.cineviet.tv.data.repository

import live.cineviet.tv.data.api.ApiClient
import live.cineviet.tv.data.models.CatalogData
import live.cineviet.tv.data.models.HomeData
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.models.MovieItem
import live.cineviet.tv.data.models.UserLibraryData

class MovieRepository {
    private val api = ApiClient.service

    suspend fun getHome(): Result<HomeData> {
        return try {
            val response = api.getHome()
            if (response.isSuccessful && response.body()?.status == true) {
                val data = response.body()?.data ?: HomeData()
                Result.success(data)
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi tải trang chủ"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getCatalog(type: String, page: Int = 1, limit: Int = 40): Result<List<MovieItem>> {
        return try {
            val response = api.getCatalog(type = type, page = page, limit = limit)
            if (response.isSuccessful && response.body()?.status == true) {
                val items = response.body()?.data?.items ?: emptyList()
                Result.success(items)
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi tải danh mục"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getMovieDetail(slug: String): Result<MovieDetailData> {
        return try {
            val response = api.getMovieDetail(slug)
            if (response.isSuccessful && response.body()?.status == true) {
                val data = response.body()?.data
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Không có dữ liệu phim"))
                }
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi tải chi tiết phim"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun searchMovies(query: String): Result<List<MovieItem>> {
        return try {
            val response = api.searchMovies(query)
            if (response.isSuccessful && response.body()?.status == true) {
                Result.success(response.body()?.data ?: emptyList())
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi tìm kiếm"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun trackView(slug: String) {
        try {
            api.trackView(slug)
        } catch (_: Exception) {}
    }

    suspend fun getUserLibrary(): Result<UserLibraryData> {
        return try {
            val response = api.getUserLibrary()
            if (response.isSuccessful && response.body()?.status == true) {
                Result.success(response.body()?.data ?: UserLibraryData())
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi tải thư viện phim"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun saveHistory(
        movieSlug: String,
        movieName: String,
        posterUrl: String?,
        thumbUrl: String?,
        episodeName: String,
        episodeSlug: String,
        currentTime: Long,
        duration: Long
    ) {
        try {
            val progressPercent = if (duration > 0) ((currentTime * 100) / duration).toInt().coerceIn(0, 100) else 0
            val payload = mapOf(
                "movie_slug" to movieSlug,
                "movie_name" to movieName,
                "poster_url" to (posterUrl ?: ""),
                "thumb_url" to (thumbUrl ?: ""),
                "episode_name" to episodeName,
                "episode_slug" to episodeSlug,
                "current_time" to currentTime,
                "duration" to duration,
                "progress_percent" to progressPercent
            )
            api.saveHistory(payload)
        } catch (_: Exception) {}
    }

    suspend fun removeFromHistory(movieSlug: String): Result<Unit> {
        return try {
            val response = api.removeFromHistory(mapOf("movie_slug" to movieSlug))
            if (response.isSuccessful && response.body()?.status == true) {
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi xóa phim khỏi danh sách tiếp tục xem"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun toggleWatchlist(
        movieSlug: String,
        movieName: String,
        posterUrl: String?,
        originName: String?
    ): Result<Boolean> {
        return try {
            val payload = mapOf(
                "movie_slug" to movieSlug,
                "movie_name" to movieName,
                "poster_url" to (posterUrl ?: ""),
                "origin_name" to (originName ?: "")
            )
            val response = api.toggleWatchlist(payload)
            if (response.isSuccessful && response.body()?.status == true) {
                Result.success(true)
            } else {
                Result.failure(Exception("Lỗi cập nhật yêu thích"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
