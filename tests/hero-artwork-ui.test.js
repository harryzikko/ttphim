const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const helper = read('public/js/hero-artwork.js');
const movie = {
  name: 'Demo movie', slug: 'demo-movie', poster_url: 'https://source.test/poster.jpg',
  thumb_url: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
  hero_backdrop_url: 'https://image.tmdb.org/t/p/original/backdrop.jpg',
  hero_backdrop_srcset: 'https://image.tmdb.org/t/p/w780/backdrop.jpg 780w, https://image.tmdb.org/t/p/original/backdrop.jpg 1920w',
  hero_backdrop_fallback: 'https://source.test/backdrop.jpg',
  hero_poster_url: 'https://image.tmdb.org/t/p/original/poster.jpg',
  hero_poster_fallback: 'https://source.test/poster.jpg'
};
function fixture(html = '<div id="stage"></div>') {
  const dom = new JSDOM(html, { url: 'https://fixture.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.eval(helper);
  return dom;
}

test('backdrops use responsive high-resolution images, preserve literal URL characters and reset stale srcset', () => {
  const dom = fixture();
  try {
    const stage = dom.window.document.getElementById('stage');
    dom.window.HeroArtwork.setBackdrop(stage, movie, false);
    const img = stage.querySelector('img');
    assert.equal(img.src, movie.hero_backdrop_url);
    assert.equal(img.srcset, movie.hero_backdrop_srcset);
    assert.equal(stage.style.backgroundImage, 'none');
    assert.equal(stage.dataset.artworkState, 'loading');
    img.dispatchEvent(new dom.window.Event('load'));
    assert.equal(stage.dataset.artworkState, 'ready');
    const manual = "https://manual.test/banner's image.jpg";
    dom.window.HeroArtwork.setBackdrop(stage, { ...movie, thumb_url: manual, hero_backdrop_url: manual, hero_backdrop_srcset: '' }, false);
    assert.equal(img.getAttribute('src'), manual);
    assert.equal(img.hasAttribute('srcset'), false);
    assert.equal(stage.querySelectorAll('img').length, 1);
  } finally { dom.window.close(); }
});

test('mobile manual banner wins without receiving the desktop TMDb srcset', () => {
  const dom = fixture();
  try {
    const stage = dom.window.document.getElementById('stage');
    dom.window.HeroArtwork.setBackdrop(stage, { ...movie, banner_mobile: 'https://manual.test/mobile.jpg' }, true);
    assert.equal(stage.querySelector('img').src, 'https://manual.test/mobile.jpg');
    assert.equal(stage.querySelector('img').hasAttribute('srcset'), false);
    dom.window.HeroArtwork.setBackdrop(stage, { ...movie, banner_mobile: movie.thumb_url }, true);
    assert.equal(stage.querySelector('img').srcset, movie.hero_backdrop_srcset);
  } finally { dom.window.close(); }
});

test('failed TMDb image retries source once, removes srcset and ends with a visible error state', () => {
  const dom = fixture();
  try {
    const stage = dom.window.document.getElementById('stage');
    dom.window.HeroArtwork.setBackdrop(stage, movie, false);
    const img = stage.querySelector('img');
    img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(img.src, movie.hero_backdrop_fallback);
    assert.equal(img.hasAttribute('srcset'), false);
    img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(stage.dataset.artworkState, 'error');
    assert.equal(img.style.visibility, 'hidden');
    dom.window.HeroArtwork.setBackdrop(stage, movie, false);
    assert.equal(img.style.visibility, '');
    assert.equal(stage.dataset.artworkState, 'loading');
  } finally { dom.window.close(); }
});

test('hero poster enrichment never changes ordinary card artwork or movie data', () => {
  const dom = fixture('<a><img id="hero"></a><a><img id="rail" src="https://source.test/poster.jpg"></a>');
  try {
    const before = JSON.stringify(movie);
    const hero = dom.window.document.getElementById('hero');
    dom.window.HeroArtwork.setPoster(hero, movie);
    assert.equal(hero.src, movie.hero_poster_url);
    hero.dispatchEvent(new dom.window.Event('error'));
    assert.equal(hero.src, movie.poster_url);
    assert.equal(dom.window.document.getElementById('rail').src, movie.poster_url);
    assert.equal(JSON.stringify(movie), before);
  } finally { dom.window.close(); }
});

test('missing artwork has an empty state and API image fields cannot inject markup', () => {
  const dom = fixture();
  try {
    const stage = dom.window.document.getElementById('stage');
    dom.window.HeroArtwork.setBackdrop(stage, {}, false);
    assert.equal(stage.dataset.artworkState, 'empty');
    assert.equal(stage.querySelector('img').hasAttribute('src'), false);
    dom.window.HeroArtwork.setBackdrop(stage, { name: '<script>bad()</script>', thumb_url: 'x\" onerror=bad()' }, false);
    assert.equal(stage.querySelector('img').hasAttribute('onerror'), false);
    assert.equal(stage.querySelector('script'), null);
  } finally { dom.window.close(); }
});

async function homeFixture(mobile, spotlights, reduced = false) {
  const html = read(mobile ? 'public/mobile/index.html' : 'public/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const dom = fixture(html);
  dom.window.console = { log() {}, error() {} };
  dom.window.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  dom.window.eval(read('public/js/hero-actions.js'));
  dom.window.API = { getHome: async () => ({ spotlights }) };
  dom.window.eval(read(mobile ? 'public/mobile/js/home.js' : 'public/js/home.js'));
  await new Promise(resolve => setImmediate(resolve));
  return dom;
}

test('desktop controls switch the hero and high-resolution poster; dots retain keyboard focus', async () => {
  const dom = await homeFixture(false, [movie, { ...movie, name: 'Second demo', hero_backdrop_url: 'https://manual.test/second.jpg', hero_backdrop_srcset: '' }]);
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.hero-bg-layer.active img').src, movie.hero_backdrop_url);
    assert.equal(doc.getElementById('hero-poster-img').src, movie.hero_poster_url);
    doc.getElementById('hero-next-btn').click();
    assert.equal(doc.querySelector('.hero-bg-layer.active img').src, 'https://manual.test/second.jpg');
    doc.querySelector('#hero-slide-dots button').click();
    assert.equal(doc.activeElement, doc.querySelector('#hero-slide-dots button'));
    assert.equal(doc.activeElement.getAttribute('aria-current'), 'true');
    assert.equal(doc.getElementById('hero-slide-counter'), null);
    assert.equal(doc.getElementById('hero-pause-btn'), null);
    doc.getElementById('hero-next-btn').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(doc.querySelectorAll('#hero-slide-dots button')[1].getAttribute('aria-current'), 'true');
    assert.equal(doc.querySelector('.hero-bg-layer.prev').getAttribute('aria-hidden'), 'true');
  } finally { dom.window.close(); }
});

test('mobile has working previous/next controls without a counter, pause or invented quality', async () => {
  const dom = await homeFixture(true, [movie, { ...movie, banner_mobile: 'https://manual.test/mobile.jpg' }], true);
  try {
    const doc = dom.window.document;
    doc.getElementById('m-hero-next').click();
    assert.equal(doc.querySelector('#m-spotlight-bg img').src, 'https://manual.test/mobile.jpg');
    doc.getElementById('m-hero-prev').click();
    assert.equal(doc.querySelector('#m-spotlight-bg img').src, movie.hero_backdrop_url);
    assert.equal(doc.getElementById('m-hero-pause'), null);
    assert.equal(doc.getElementById('m-spotlight-rank').textContent, 'Phim nổi bật');
    assert.equal(doc.getElementById('m-spotlight-progress').parentElement.hidden, true);
    assert.ok(!doc.getElementById('m-spotlight-badges').textContent.includes('4K HDR'));
  } finally { dom.window.close(); }
});

test('empty spotlights hide only the hero and one mobile slide disables carousel controls', async () => {
  for (const mobile of [false, true]) {
    const dom = await homeFixture(mobile, []);
    try { assert.equal(dom.window.document.getElementById(mobile ? 'm-spotlight-section' : 'home-hero').hidden, true); }
    finally { dom.window.close(); }
  }
  const dom = await homeFixture(true, [movie]);
  try {
    assert.equal(dom.window.document.getElementById('m-hero-next').disabled, true);
    assert.equal(dom.window.document.getElementById('m-hero-pause'), null);
  } finally { dom.window.close(); }
});

test('owned HTML loads artwork CSS after established styles and helper before controllers', () => {
  for (const file of ['public/index.html', 'public/mobile/index.html']) {
    const html = read(file);
    assert.ok(html.indexOf('/css/hero-artwork.css?v=') > html.indexOf('/css/editorial.css?v='));
    assert.ok(html.indexOf('/js/hero-artwork.js?v=') < html.indexOf(file.includes('mobile') ? '/mobile/js/home.js?v=' : '/js/home.js?v='));
  }
  const css = read('public/css/hero-artwork.css');
  assert.ok(css.includes('object-fit: contain'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(!css.includes('object-fit: cover'));
});

test('desktop uses a full-bleed image stage with lower-left overlay copy and separate lower-right controls', () => {
  const css = read('public/css/hero-artwork.css');
  const html = read('public/index.html');
  assert.ok(!css.includes('37fr'));
  assert.match(css, /\.hero-bg-container\s*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%/s);
  assert.match(css, /\.hero-main-content\s*\{[^}]*position: relative; z-index: 3/s);
  assert.match(css, /#hero-poster-deck\s*\{[^}]*position: absolute;[^}]*right:/s);
  assert.match(css, /\.hero-bg-container::after\s*\{[^}]*linear-gradient/s);
  assert.match(css, /#hero-poster-card\s*\{ display: none; \}/);
  assert.ok(css.includes('mask-image'));assert.ok(css.includes('mask-composite: intersect'));
  assert.ok(!css.includes('transition: all'));
  assert.match(html, /id="hero-poster-card"[^>]*hidden[^>]*tabindex="-1"/);
  assert.match(html, /id="hero-bg-layer-1"[^>]*><img id="hero-backdrop-img-1"/);
  assert.match(html, /id="hero-bg-layer-2"[^>]*><img id="hero-backdrop-img-2"/);
});

test('desktop reduced motion stays paused across slide changes without a pause control', async () => {
  const dom = await homeFixture(false, [movie, { ...movie, name: 'Second demo' }], true);
  try {
    const doc = dom.window.document;
    const timer = doc.getElementById('spotlight-timer-bar');
    assert.equal(timer.classList.contains('paused'), true);
    doc.getElementById('hero-next-btn').click();
    assert.equal(timer.classList.contains('paused'), true);
    assert.equal(doc.getElementById('hero-pause-btn'), null);
    assert.equal(doc.getElementById('hero-poster-card').hidden, true);
  } finally { dom.window.close(); }
});

test('SSR images bind source fallback before the home API resolves', async () => {
  const dom = fixture('<div id="hero-bg-layer-1"><img class="hero-artwork-image" src="https://tmdb.test/image.jpg" data-hero-fallback="https://source.test/image.jpg" alt="SSR demo"></div>');
  try {
    await new Promise(resolve => setImmediate(resolve));
    const img = dom.window.document.querySelector('img');
    assert.equal(img.parentElement.getAttribute('aria-busy'), 'true');
    img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(img.src, 'https://source.test/image.jpg');
    img.dispatchEvent(new dom.window.Event('load'));
    assert.equal(img.parentElement.getAttribute('aria-busy'), 'false');
    assert.equal(img.alt, 'SSR demo');
  } finally { dom.window.close(); }
});

test('image feather follows its actual contained rectangle on load, resize and portrait fallback',()=>{
  const dom=fixture('<section id="home-hero"><div id="hero-bg-layer-1"><img class="hero-artwork-image"></div></section>');
  try {
    const layer=dom.window.document.getElementById('hero-bg-layer-1'),img=layer.querySelector('img');
    let width=1870,height=830,naturalWidth=1920,naturalHeight=1080;
    layer.getBoundingClientRect=()=>({width,height});
    Object.defineProperty(img,'naturalWidth',{get:()=>naturalWidth});Object.defineProperty(img,'naturalHeight',{get:()=>naturalHeight});
    dom.window.HeroArtwork.setBackdrop(layer,movie,false);img.dispatchEvent(new dom.window.Event('load'));
    const expectedWidth=naturalWidth*Math.min(width/naturalWidth,height/naturalHeight);
    assert.ok(Math.abs(parseFloat(img.style.width)-expectedWidth)<0.001);assert.ok(Math.abs(parseFloat(img.style.left)-(width-expectedWidth))<0.001);
    assert.ok(layer.style.getPropertyValue('--hero-slide-image').includes('backdrop.jpg'));assert.ok(parseFloat(img.style.getPropertyValue('--hero-feather-x'))>0);
    width=1440;height=760;dom.window.dispatchEvent(new dom.window.Event('resize'));
    assert.ok(Math.abs(parseFloat(img.style.width)/parseFloat(img.style.height)-16/9)<0.001);
    img.dispatchEvent(new dom.window.Event('error'));naturalWidth=600;naturalHeight=900;img.dispatchEvent(new dom.window.Event('load'));
    assert.ok(layer.style.getPropertyValue('--hero-slide-image').includes('source.test/backdrop.jpg'));assert.equal(img.hasAttribute('srcset'),false);
    assert.ok(Math.abs(parseFloat(img.style.width)/parseFloat(img.style.height)-2/3)<0.001);
    const style=read('public/css/hero-artwork.css');assert.ok(style.includes('.hero-bg-layer::before'));assert.ok(style.includes('--hero-slide-image'));assert.ok(!style.includes('var(--hero-ambient'));
  }finally{dom.window.close();}
});

test('desktop and mobile omit unavailable metadata while preserving real quality/language',async()=>{
  for(const mobile of [false,true]){
    const dom=await homeFixture(mobile,[{...movie,quality:'HD',time:'N/A',episode_current:'N/A',lang:'Vietsub'}],true);
    try{
      const doc=dom.window.document;
      const badges=mobile?doc.getElementById('m-spotlight-badges'):doc.querySelector('#hero-content-deck > div:first-child');
      const visible=[...badges.querySelectorAll('span')].filter(el=>!el.hidden).map(el=>el.textContent).join(' ');
      assert.ok(!visible.includes('N/A'));assert.ok(visible.includes('HD'));assert.ok(visible.includes('Vietsub'));
      assert.equal(dom.window.HeroArtwork.cleanMeta(' N/A '),'');assert.equal(dom.window.HeroArtwork.cleanMeta('Song Ngữ'),'Song Ngữ');
    }finally{dom.window.close();}
  }
});

test('desktop and mobile never show trailer controls, even for movies with a trailer', async () => {
  for (const mobile of [false, true]) {
    const dom = await homeFixture(mobile, [movie, { ...movie, trailer_url: 'https://youtu.be/abcdefghijk' }], true);
    try {
      const doc = dom.window.document;
      assert.equal(doc.querySelector('#hero-trailer-btn, #m-hero-trailer-btn'), null);
      doc.getElementById(mobile ? 'm-hero-next' : 'hero-next-btn').click();
      assert.equal(doc.querySelector('#hero-trailer-btn, #m-hero-trailer-btn, #home-trailer-modal'), null);
    } finally { dom.window.close(); }
  }
});

test('favorite hearts load server state, confirm writes and stay attached to the correct movie', async () => {
  const dom = fixture('<button><span class="material-symbols-outlined"></span><span>Yêu thích</span></button>');
  try {
    const win = dom.window, button = win.document.querySelector('button'), messages = [];
    let complete, calls = 0;
    win.API = { getMe: async () => ({ id: 'test-user' }), getLibrary: async () => ({ watchlist: [{ movie_slug: movie.slug }] }), toggleWatchlist: async () => { calls++; return new Promise(resolve => { complete = resolve; }); } };
    win.eval(read('public/js/hero-actions.js'));
    const select = win.HeroActions.favorite(button, (...args) => messages.push(args));
    select(movie); await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    const saving = button.onclick(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.disabled, true); assert.equal(button.getAttribute('aria-pressed'), 'true');
    select({ ...movie, slug: 'second' }); assert.equal(button.getAttribute('aria-pressed'), 'false');
    await button.onclick(); assert.equal(calls, 1);
    complete({ status: true, data: { added: false } }); await saving;
    assert.equal(button.getAttribute('aria-pressed'), 'false'); assert.equal(button.disabled, false);
    select(movie); assert.equal(button.getAttribute('aria-pressed'), 'false');
    win.API.toggleWatchlist = async () => ({ status: false, message: 'Test failure' });
    await button.onclick(); assert.equal(button.getAttribute('aria-pressed'), 'false'); assert.equal(messages.at(-1)[1], 'error');
    win.API.toggleWatchlist = async () => ({ status: true, data: { added: true } });
    await button.onclick(); assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.querySelector('span').textContent, 'favorite');
    win.API.getMe = async () => null;
    win.dispatchEvent(new win.Event('ttphim:auth-changed')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    await button.onclick(); assert.equal(messages.at(-1)[1], 'warning'); assert.equal(calls, 1);
  } finally { dom.window.close(); }
});
