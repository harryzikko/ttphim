# Playback tracks and account preferences (features 2 and 6)

## User behavior

- Desktop and mobile web players expose audio only when more than one real track exists, and subtitles only when the source/player exposes subtitle or caption tracks. Empty/single-audio/burned-in sources do not get artificial track selectors.
- Hls.js manifest track lists and track update/switch events drive the controls. Native HLS uses browser audioTracks/textTracks when exposed. Native captions remain available when Hls.js has no separate subtitle rendition list.
- Selecting a track switches the current source's real index without changing episodes. Labels use textContent; provider track labels cannot insert HTML. Explicit selection between two tracks sharing a language remains selected in the current session after saving that language preference.
- Language preference matches exact tags first, then the same base language. Common ISO-639 aliases such as vie/vi and eng/en are supported. An unavailable language does not invent a track or switch to another movie/server. Changing the source destroys its menu/listeners.
- Embedded cross-origin players own their tracks and speed. No fake controls, iframe inspection bypass or claim of universal seek/track support is added. Burned-in subtitles cannot be disabled by this feature.

## Account preferences

The playback preferences panel is available only on the desktop/mobile account pages. The extra panel under the watch player has been removed at the user's request; watch controllers still load/apply account preferences, and in-player speed/audio/subtitle controls remain. Account settings control auto-next, speed (0.5/0.75/1/1.25/1.5/1.75/2), preferred audio language and preferred subtitle language (including off).

- Authenticated users load authoritative values from the server before starting the player. Values refresh on page focus/visibility return; this is not realtime server push.
- Mutations send only changed keys and merge transactionally, preserving unrelated fields and changes to other preference keys. Only confirmed writes update speed/settings state. A rejected write keeps confirmed settings and offers retry.
- If initial account settings cannot load, auto-next stays off and settings cannot silently write guest state; the panel explains the failure. API authentication errors do not turn the viewer into a guest.
- Guests use TTPhim_playback_guest in localStorage. Old browser-only speed/auto-next may initialize guest values, but never overwrite authoritative account settings. Volume/mute remain device-local.
- The active track can still be changed locally when preference persistence fails; the panel does not claim that failed save was synced. Unknown track languages do not create invalid account preferences.
- Turning auto-next off cancels an existing countdown; seeking/replay/manual episode changes keep the previous cancellation behavior.

## API and storage

- GET /api/user/playback-preferences returns { status: true, data: { auto_next, playback_speed, audio_language, subtitle_language } }.
- PATCH the same path accepts a nonempty strict subset of these fields. Invalid types/speeds/language tags and unknown fields return 400. Guests return 401. User identity comes only from the authenticated request, never a body/query ID.
- Responses use private, no-store caching. Existing origin/auth/mutation protections precede the router.
- Data is an additive playback_preferences object on the owned user row, updated through db.mutate. Existing JSON/PostgreSQL document storage needs no new table. No real-account migration or bulk write is performed.
- Implementation: src/services/playbackPreferences.js, src/routes/playbackRoutes.js, public/js/player-preferences.js, public/js/player-tracks.js, shared PlayerUX session lifecycle and desktop/mobile controllers.

## Verification

- tests/playback-options.test.js: defaults, strict validation, account isolation/concurrent patch merge, independent frontend contexts, focus refresh, rejected writes, guest separation, real-list HLS/native controls, safe labels, subtitle-off, teardown and same-language explicit track regression.
- tests/backend.test.js covers authenticated HTTP API persistence and invalid/foreign ID rejection using a temporary database.
- npm run test:player-e2e: 11/11 pass with Edge and repository local H.264/MPEG-TS media, including independent desktop/mobile account contexts and auto-next off.
- Additional isolated Edge integration uses generated H.264 video, two AAC sine-wave tracks and HLS WebVTT: real decode, Vietnamese audio playlist/segments fetched, subtitle cues loaded, selection persisted, speed refreshed across independent contexts, failed save preserved confirmed speed, single-track controls hidden, both account pages mounted. No pageerror. This validates the tested local stream, not every provider/film.
- Full suite: 238 pass / 3 conditional skips; security E2E 1/1 run separately. Tests write only temporary data.

Native Flutter/TV app integration, real Safari/iPhone/Android devices, production hosting, real provider multi-track availability and PostgreSQL re-verification are not certified in this change. HTML screenshot-gallery preview timed out; Edge interaction/DOM/viewport assertions and saved screenshots are available, but the gallery timeout is not a product playback failure.

Watch-page panel removal verification: full suite 265 pass / 3 conditional skips; player E2E 11/11, including no .playback-preferences panel on desktop/mobile watch pages while account speed and auto-next remain honored. Existing generic panel/account tests are retained.
