package live.cineviet.tv.data.api

import live.cineviet.tv.data.models.*
import retrofit2.Response
import retrofit2.http.*

interface CineVietApiService {

    @GET("home")
    suspend fun getHome(): Response<ApiResponse<HomeData>>

    @GET("movies/{slug}")
    suspend fun getMovieDetail(
        @Path("slug") slug: String
    ): Response<ApiResponse<MovieDetailData>>

    @GET("catalog")
    suspend fun getCatalog(
        @Query("type") type: String,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 40
    ): Response<ApiResponse<CatalogData>>

    @GET("search")
    suspend fun searchMovies(
        @Query("q") query: String
    ): Response<ApiResponse<List<MovieItem>>>

    @POST("auth/tv/session")
    suspend fun createTvSession(): Response<ApiResponse<TvSession>>

    @GET("auth/tv/status")
    suspend fun getTvStatus(
        @Query("token") token: String
    ): Response<TvStatusResponse>

    @POST("movies/{slug}/view")
    suspend fun trackView(
        @Path("slug") slug: String
    ): Response<ApiResponse<Any>>

    @GET("user/library")
    suspend fun getUserLibrary(): Response<ApiResponse<UserLibraryData>>

    @POST("user/history")
    suspend fun saveHistory(
        @Body data: Map<String, @JvmSuppressWildcards Any>
    ): Response<ApiResponse<Any>>

    @POST("user/history/remove")
    suspend fun removeFromHistory(
        @Body data: Map<String, @JvmSuppressWildcards Any>
    ): Response<ApiResponse<Any>>

    @POST("user/watchlist/toggle")
    suspend fun toggleWatchlist(
        @Body data: Map<String, @JvmSuppressWildcards Any>
    ): Response<ApiResponse<Any>>
}
