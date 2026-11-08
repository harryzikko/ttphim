package live.cineviet.tv.data.api

import live.cineviet.tv.data.models.*
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface CineVietApiService {

    @GET("home")
    suspend fun getHome(): Response<ApiResponse<HomeData>>

    @GET("movies/{slug}")
    suspend fun getMovieDetail(
        @Path("slug") slug: String
    ): Response<ApiResponse<MovieDetailData>>

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
}
