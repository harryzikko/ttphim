/* Featured artwork only; ordinary movie cards keep their source images. */
(function () {
  'use strict';
  function cleanMeta(value) {
    const text = String(value ?? '').trim();
    return /^(?:n\s*\/\s*a|na|null|none|undefined|[-—]+)$/i.test(text) ? '' : text;
  }

  const backdropLayouts = new Map();
  const responsiveBackdrops = new Map();
  const phonePortrait = () => window.innerWidth < 768 && window.innerHeight > window.innerWidth;
  function layoutBackdrop(img, mobile) {
    const host = img.parentElement;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || !img.naturalWidth || !img.naturalHeight) return;
    const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const renderedWidth = img.naturalWidth * scale, renderedHeight = img.naturalHeight * scale;
    img.style.width = `${renderedWidth}px`; img.style.height = `${renderedHeight}px`;
    img.style.left = `${mobile || host.dataset.artworkOrientation === 'portrait' ? (width - renderedWidth) / 2 : width - renderedWidth}px`;
    img.style.setProperty('--hero-feather-x', `${Math.min(180, renderedWidth * .16)}px`);
    img.style.setProperty('--hero-feather-y', `${Math.min(110, renderedHeight * .2)}px`);
  }
  window.addEventListener('resize', () => {
    for (const [layer, selection] of responsiveBackdrops) {
      if (!layer.isConnected) { responsiveBackdrops.delete(layer); continue; }
      if (phonePortrait(selection.mobile) !== selection.portrait) setBackdrop(layer, selection.movie, selection.mobile);
    }
    for (const [img, mobile] of backdropLayouts) {
      if (!img.isConnected) { backdropLayouts.delete(img); continue; }
      layoutBackdrop(img, mobile);
    }
  });
  function setAmbient(layer, src) {
    layer.style.setProperty('--hero-slide-image', src ? `url(${JSON.stringify(src)})` : 'none');
  }
  function setImage(img, options) {
    if (!img) return;
    const { src = '', fallback = '', srcset = '', sizes = '', alt = '' } = options;
    const host = img.parentElement;
    if (!host.querySelector('.hero-artwork-error')) {
      const error = document.createElement('span');
      error.className = 'hero-artwork-error';
      error.textContent = 'Kh\u00f4ng th\u1ec3 t\u1ea3i \u1ea3nh';
      host.appendChild(error);
    }
    const state = value => {
      host.dataset.artworkState = value;
      host.setAttribute('aria-busy', String(value === 'loading'));
      if (img.classList.contains('hero-artwork-image') && (value === 'ready' || value === 'error' || value === 'empty')) {
        setAmbient(host, value === 'ready' ? (img.currentSrc || img.src) : '');
        if (value === 'ready') layoutBackdrop(img, host.id === 'm-spotlight-bg');
      }
    };
    img.alt = alt;
    img.decoding = 'async';
    img.style.visibility = '';
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    state(src ? 'loading' : 'empty');
    let retried = false;
    img.onload = () => state('ready');
    img.onerror = () => {
      if (!retried && fallback && fallback !== src) {
        retried = true;
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = fallback;
        return;
      }
      state('error');
      img.style.visibility = 'hidden';
    };
    if (!src) {
      img.removeAttribute('src');
      return;
    }
    if (srcset) {
      img.sizes = sizes || '100vw';
      img.srcset = srcset;
    }
    img.src = src;
    if (img.complete && img.naturalWidth > 0) state('ready');
  }

  function setBackdrop(layer, movie, mobile) {
    if (!layer) return;
    let img = layer.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'hero-artwork-image';
      layer.appendChild(img);
    }
    layer.style.backgroundImage = 'none';
    backdropLayouts.set(img, mobile);
    const portrait = phonePortrait(mobile);
    const separateMobile = (mobile || portrait) && movie.banner_mobile && (movie.hero_mobile_custom || (movie.banner_mobile !== movie.hero_backdrop_url && movie.banner_mobile !== movie.thumb_url));
    const usePoster = portrait && !separateMobile;
    responsiveBackdrops.set(layer, { movie, mobile, portrait });
    layer.dataset.artworkOrientation = portrait ? 'portrait' : 'landscape';
    layer.dataset.artworkFormat = separateMobile ? 'custom' : usePoster ? 'poster' : 'backdrop';
    setImage(img, {
      src: separateMobile ? movie.banner_mobile : usePoster ? (movie.hero_poster_url || movie.poster_url || movie.hero_backdrop_url || movie.thumb_url) : (movie.hero_backdrop_url || movie.thumb_url || movie.poster_url),
      fallback: usePoster ? (movie.hero_poster_fallback || movie.poster_url || movie.hero_backdrop_fallback || movie.thumb_url) : (movie.hero_backdrop_fallback || movie.thumb_url || movie.poster_url),
      srcset: separateMobile ? (movie.hero_mobile_srcset || '') : usePoster ? (movie.hero_poster_srcset || '') : (movie.hero_backdrop_srcset || ''),
      sizes: '100vw',
      alt: movie.banner_title || movie.name || ''
    });
    img.fetchPriority = 'high';
  }

  function setPoster(img, movie) {
    setImage(img, {
      src: movie.hero_poster_url || movie.poster_url || movie.thumb_url,
      fallback: movie.hero_poster_fallback || movie.poster_url || movie.thumb_url,
      srcset: movie.hero_poster_srcset || '',
      sizes: '(min-width: 1280px) 280px, (min-width: 768px) 200px, 140px',
      alt: movie.name || ''
    });
  }

  // SSR can supply the first image before the home API resolves.
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#hero-bg-layer-1 img[src], #hero-bg-layer-2 img[src], #m-spotlight-bg img[src], #hero-poster-img[src]').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;
      if (img.classList.contains('hero-artwork-image')) backdropLayouts.set(img, img.parentElement.id === 'm-spotlight-bg');
      setImage(img, {
        src,
        fallback: img.dataset.heroFallback || '',
        srcset: img.getAttribute('srcset') || '',
        sizes: img.getAttribute('sizes') || '',
        alt: img.alt
      });
    });
  });
  window.HeroArtwork = { setImage, setBackdrop, setPoster, cleanMeta };
})();
