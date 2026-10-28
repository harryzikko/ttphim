Player QA media
===============
These four MPEG-TS segments and the HLS playlist contain only FFmpeg's
synthetic testsrc2 color/motion pattern, generated for this repository.
No third-party movie, music, provider stream or personal data is present.
The generated fixture is freely reusable (CC0-1.0 dedication).

8 seconds, 160x90, 12 fps, H.264, no audio, approximately 100 KB total.
Reproduction command (FFmpeg is not needed to run the tests):

ffmpeg -f lavfi -i testsrc2=size=160x90:rate=12 -t 8 -an -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 24 -sc_threshold 0 -b:v 80k -f hls -hls_time 2 -hls_list_size 0 -hls_segment_filename segment-%02d.ts sample.m3u8

Run from repository root: node scripts/player-e2e.cjs
Requires playwright and an installed Edge (Windows default) or Chromium.
PLAYER_PLAYWRIGHT_PATH may point at an existing playwright module directory.
PLAYER_BROWSER_PATH overrides the executable path.

The runner creates/removes its own DB under PI_SCRATCH_DIR or the OS temp
folder and starts an ephemeral loopback listener (never port 3001). It uses
real cookie auth/history API, SDK, player controllers and pinned Hls.js.
All browser requests outside that origin are blocked. Server-side provider
constructors are isolated and external fetch is disabled.

Desktop/mobile tests use production HTML with CDN scripts/styles removed,
so these are controller/media lifecycle tests, not visual or CDN integration
tests. Real HLS fetching, MSE/H.264 decoding, seeking and ended are exercised.
TV uses the real inline TV controller and Hls.js with an explicitly labelled
Artplayer contract double; actual Artplayer/Android TV/remote integration,
TV resume persistence, audio decoding and native Safari HLS are not covered.
Autoplay policy denial and an unresponsive HLS engine are controlled faults,
not a claim about actual device autoplay policy. The broken playlist is a
real local HTTP 404; embed fallback loads an inert same-origin test page.
Telemetry endpoint is deliberately HTTP 503 to prove failures are harmless.
Ordinary node --test tests/*.test.js skips the browser suite unless PLAYER_E2E=1.
