package live.cineviet.tv.data.repository

import live.cineviet.tv.data.api.ApiClient
import live.cineviet.tv.data.models.HomeData
import live.cineviet.tv.data.models.MovieDetailData
import live.cineviet.tv.data.models.MovieItem

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
}
