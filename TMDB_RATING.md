# TMDb score on movie details

The external IMDb score in the detail-page summary is replaced by TMDb. Website account ratings remain independent and unchanged.

- GET /api/movies/:slug/tmdb-rating resolves the movie through the existing provider detail service, then uses only its valid TMDb ID and known media type.
- Supported ID fields: tmdb.id, scalar tmdb, tmdb_id, tmdbId. Media type prefers tmdb.type, then tmdb_type/tmdbType, then known movie/series type. Missing/invalid ID or unresolved type returns an empty score; no name/IMDb search is used for ratings.
- TMDb requests use /movie/{id} or /tv/{id}. The response ID, vote_average (0..10) and nonnegative integer vote_count are validated.
- A positive vote count exposes the actual score to one decimal, vote count and a canonical TMDb link. Zero votes show an unrated state. Missing ID shows no data. Upstream failure shows retry, not an invented/default score.
- Score cache: one hour for rated titles, ten minutes for confirmed unrated titles, keyed by media type + ID. Concurrent lookups are coalesced; outages/malformed responses are not cached as scores.
- Client loading is separate from website ratings and movie detail rendering. Late responses from a previously mounted title are ignored; the client reconstructs the safe TMDb link and validates the returned ID/type.

Verification: 272 full-suite tests pass, three conditional skips. Focused service/API/DOM tests cover strict identity, type-isolated cache, concurrent requests, invalid/outage/unrated responses, source separation, safe links and stale loads. Edge at 1440px and 390px checked actual TMDb movie ID 550 and TV ID 1399; displayed scores and URLs matched live API results. Isolated fixtures checked no-ID, unrated and outage/retry states. No pageerror. Mutation tests use temporary data; live probes do not change real account/history/banner data.

Scope is the external score shown on the movie detail page. Existing IMDb sort/catalog metadata are not relabeled as TMDb without changing their actual data source. TMDb points/vote counts change over time and depend on API availability and provider-supplied identity accuracy.
