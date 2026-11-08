package live.cineviet.tv

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import live.cineviet.tv.data.api.ApiClient
import live.cineviet.tv.data.local.TvSessionManager

class CineVietTvApp : Application(), ImageLoaderFactory {
    lateinit var sessionManager: TvSessionManager
        private set

    override fun onCreate() {
        super.onCreate()
        sessionManager = TvSessionManager(this)
        ApiClient.initialize(sessionManager)
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .okHttpClient { ApiClient.imageOkHttpClient }
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.25)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizePercent(0.05)
                    .build()
            }
            .crossfade(true)
            .build()
    }
}
