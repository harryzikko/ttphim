package live.cineviet.tv.data.repository

import live.cineviet.tv.data.api.ApiClient
import live.cineviet.tv.data.local.TvSessionManager
import live.cineviet.tv.data.models.TvSession
import live.cineviet.tv.data.models.TvStatusResponse

class TvAuthRepository(private val sessionManager: TvSessionManager) {
    private val api = ApiClient.service

    suspend fun createSession(): Result<TvSession> {
        return try {
            val response = api.createTvSession()
            if (response.isSuccessful && response.body()?.status == true) {
                val session = response.body()?.data
                if (session != null) {
                    Result.success(session)
                } else {
                    Result.failure(Exception("Không nhận được mã phiên TV"))
                }
            } else {
                Result.failure(Exception(response.body()?.message ?: "Lỗi khởi tạo phiên đăng nhập TV"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun checkStatus(token: String): Result<TvStatusResponse> {
        return try {
            val response = api.getTvStatus(token)
            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.status == "approved" && !body.token.isNullOrBlank()) {
                    sessionManager.saveAuthToken(body.token)
                    body.user?.let { sessionManager.saveUser(it) }
                }
                Result.success(body)
            } else {
                Result.failure(Exception("Không thể kiểm tra trạng thái xác thực"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun isUserLoggedIn(): Boolean = sessionManager.isLoggedIn()
    fun getUser() = sessionManager.getUser()
    fun logout() = sessionManager.logout()
}
