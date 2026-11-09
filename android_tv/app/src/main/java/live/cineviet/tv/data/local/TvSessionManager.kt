package live.cineviet.tv.data.local

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import live.cineviet.tv.data.models.HomeData
import live.cineviet.tv.data.models.UserDto

class TvSessionManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("cineviet_tv_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_USER_DATA = "user_data"
        private const val KEY_CACHED_HOME = "cached_home_data"
    }

    fun saveCachedHome(json: String) {
        prefs.edit().putString(KEY_CACHED_HOME, json).apply()
    }

    fun getCachedHome(): HomeData? {
        val json = prefs.getString(KEY_CACHED_HOME, null) ?: return null
        return try {
            gson.fromJson(json, HomeData::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun saveAuthToken(token: String) {
        prefs.edit().putString(KEY_AUTH_TOKEN, token).apply()
    }

    fun getAuthToken(): String? {
        return prefs.getString(KEY_AUTH_TOKEN, null)
    }

    fun saveUser(user: UserDto) {
        val json = gson.toJson(user)
        prefs.edit().putString(KEY_USER_DATA, json).apply()
    }

    fun getUser(): UserDto? {
        val json = prefs.getString(KEY_USER_DATA, null) ?: return null
        return try {
            gson.fromJson(json, UserDto::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun isLoggedIn(): Boolean {
        return !getAuthToken().isNullOrBlank()
    }

    fun logout() {
        prefs.edit().clear().apply()
    }
}
