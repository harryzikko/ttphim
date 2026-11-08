package live.cineviet.tv

import android.app.Application
import live.cineviet.tv.data.api.ApiClient
import live.cineviet.tv.data.local.TvSessionManager

class CineVietTvApp : Application() {
    lateinit var sessionManager: TvSessionManager
        private set

    override fun onCreate() {
        super.onCreate()
        sessionManager = TvSessionManager(this)
        ApiClient.initialize(sessionManager)
    }
}
