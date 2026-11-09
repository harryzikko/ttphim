package live.cineviet.tv.data.api

import live.cineviet.tv.data.local.TvSessionManager
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.net.InetAddress
import java.util.concurrent.TimeUnit

class SafeTvDns : Dns {
    // Verified fast CloudFront & BunnyCDN Anycast IPs for image.tmdb.org unblocked globally
    private val tmdbIps = listOf(
        "143.204.226.97",
        "143.204.226.102",
        "143.204.226.39",
        "143.204.226.81",
        "18.65.176.54",
        "18.65.176.101",
        "84.17.38.228",
        "169.150.207.217"
    )

    override fun lookup(hostname: String): List<InetAddress> {
        if (hostname.contains("tmdb.org", ignoreCase = true) || hostname.contains("b-cdn.net", ignoreCase = true)) {
            val validSystemIps = try {
                val sys = Dns.SYSTEM.lookup(hostname)
                sys.filter {
                    val ip = it.hostAddress ?: ""
                    ip != "0.0.0.0" && ip != "127.0.0.1" && ip != "::1" && !ip.startsWith("10.") && !ip.startsWith("192.168.")
                }
            } catch (_: Exception) {
                emptyList()
            }

            if (validSystemIps.isNotEmpty()) {
                return validSystemIps
            }

            // Fallback to verified CloudFront Anycast IPs preserving hostname for valid TLS SNI handshake
            val resolved = mutableListOf<InetAddress>()
            for (ipStr in tmdbIps) {
                try {
                    val raw = InetAddress.getByName(ipStr).address
                    resolved.add(InetAddress.getByAddress(hostname, raw))
                } catch (_: Exception) {}
            }
            if (resolved.isNotEmpty()) return resolved
        }

        return Dns.SYSTEM.lookup(hostname)
    }
}

object ApiClient {
    private const val BASE_URL = "https://cineviet.live/api/"

    private var sessionManager: TvSessionManager? = null

    fun initialize(manager: TvSessionManager) {
        sessionManager = manager
    }

    val safeDns = SafeTvDns()

    val imageOkHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .dns(safeDns)
            .addInterceptor { chain ->
                val req = chain.request().newBuilder()
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
                    .header("Referer", "https://cineviet.live/")
                    .build()
                chain.proceed(req)
            }
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    private val okHttpClient: OkHttpClient by lazy {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        OkHttpClient.Builder()
            .dns(safeDns)
            .addInterceptor(logging)
            .addInterceptor { chain ->
                val requestBuilder = chain.request().newBuilder()
                    .header("User-Agent", "CineViet-AndroidTV/1.0 (Kotlin/Compose)")
                    .header("Accept", "application/json")
                    .header("Cache-Control", "no-cache, no-store, must-revalidate")
                    .header("Pragma", "no-cache")

                sessionManager?.getAuthToken()?.let { token ->
                    if (token.isNotBlank()) {
                        requestBuilder.header("Authorization", "Bearer $token")
                    }
                }

                chain.proceed(requestBuilder.build())
            }
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
    }

    val service: CineVietApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(CineVietApiService::class.java)
    }
}
