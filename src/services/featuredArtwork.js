const banners = require('./bannerService');
const tmdb = require('./tmdbService');

function createFeaturedArtwork({ provider = tmdb, timeoutMs = 6500 } = {}) {
  async function lookup(movie) {
    if (typeof provider.getMovieArtwork !== 'function') return null;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => provider.getMovieArtwork(movie)).catch(() => null),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  }
  return async function prepareHome(data, settings) {
    const display = banners.applyHome(data, settings);
    const config = banners.getConfig(settings);
    const slides = new Map(config.slides.map(slide => [slide.slug, slide]));
    const originals = new Map((data.spotlights || []).map(movie => [movie.slug, movie]));
    const spotlights = await Promise.all(display.spotlights.map(async movie => {
      const slide = slides.get(movie.slug) || {};
      const original = originals.get(movie.slug) || movie;
      const artwork = await lookup(original);
      const customDesktop = Boolean(slide.image_desktop);
      const customMobile = Boolean(slide.image_mobile || slide.image_desktop);
      const sourceBackdrop = original.thumb_url || original.poster_url || '';
      const backdrop = (!customDesktop && artwork?.backdrop?.url) || movie.thumb_url || movie.poster_url || '';
      const mobile = (!customMobile && artwork?.backdrop?.url) || movie.banner_mobile || backdrop;
      return {
        ...movie, thumb_url: backdrop, banner_mobile: mobile,
        hero_mobile_custom: customMobile,
        hero_backdrop_url: backdrop,
        hero_backdrop_srcset: !customDesktop && artwork?.backdrop?.url === backdrop ? artwork.backdrop.srcset : '',
        hero_mobile_srcset: !customMobile && artwork?.backdrop?.url === mobile ? artwork.backdrop.srcset : '',
        hero_backdrop_fallback: sourceBackdrop,
        hero_poster_url: artwork?.poster?.url || original.poster_url || sourceBackdrop,
        hero_poster_srcset: artwork?.poster?.srcset || '',
        hero_artwork_tmdb_id: artwork?.tmdb_id || null,
        hero_artwork_media_type: artwork?.media_type || null,
        hero_poster_fallback: original.poster_url || sourceBackdrop,
        hero_artwork_source: !customDesktop && artwork?.backdrop?.url === backdrop ? 'tmdb' : customDesktop ? 'custom' : 'provider'
      };
    }));
    return { ...display, spotlights };
  };
}
module.exports = { createFeaturedArtwork, prepareHome: createFeaturedArtwork() };
