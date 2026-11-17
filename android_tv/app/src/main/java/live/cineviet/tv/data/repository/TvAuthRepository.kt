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

    suspend fun refreshSessionIfLoggedIn() {
        val currentToken = sessionManager.getAuthToken()
        if (currentToken.isNullOrBlank()) return
        try {
            val response = api.getAuthMe()
            if (response.code() == 401) {
                if (sessionManager.getAuthToken() == currentToken) {
                    sessionManager.logout()
                }
                return
            }
            if (response.isSuccessful) {
                val body = response.body() ?: return
                if (sessionManager.getAuthToken() != currentToken) return
                if (body.status && body.data != null) {
                    body.token?.takeIf { it.isNotBlank() }?.let { sessionManager.saveAuthToken(it) }
                    sessionManager.saveUser(body.data)
                } else if (!body.status && body.data == null) {
                    sessionManager.logout()
                }
            }
        } catch (_: Exception) {
            // Preserve TV session while temporarily offline or on server timeout.
        }
    }

    fun isUserLoggedIn(): Boolean = sessionManager.isLoggedIn()
    fun getUser() = sessionManager.getUser()
    fun logout() = sessionManager.logout()
}
