package live.cineviet.tv.data.local

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import live.cineviet.tv.data.models.HomeData
import live.cineviet.tv.data.models.UserDto
import live.cineviet.tv.data.models.WatchHistoryItem

class TvSessionManager(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("cineviet_tv_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_USER_DATA = "user_data"
        private const val KEY_CACHED_HOME = "cached_home_data"
        private const val KEY_LOCAL_HISTORY = "local_watch_history"
    }

    fun saveLocalHistoryItem(item: WatchHistoryItem) {
        try {
            val list = getLocalHistory().toMutableList()
            list.removeAll { it.movieSlug == item.movieSlug }
            list.add(0, item)
            val trimmed = list.take(100)
            prefs.edit().putString(KEY_LOCAL_HISTORY, gson.toJson(trimmed)).apply()
        } catch (_: Exception) {}
    }

    fun getLocalHistory(): List<WatchHistoryItem> {
        val json = prefs.getString(KEY_LOCAL_HISTORY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<WatchHistoryItem>>() {}.type
            gson.fromJson<List<WatchHistoryItem>>(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun removeLocalHistory(slug: String) {
        try {
            val list = getLocalHistory().toMutableList()
            list.removeAll { it.movieSlug == slug }
            prefs.edit().putString(KEY_LOCAL_HISTORY, gson.toJson(list)).apply()
        } catch (_: Exception) {}
    }

    fun clearLocalHistory() {
        prefs.edit().remove(KEY_LOCAL_HISTORY).apply()
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
