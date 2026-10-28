/* Independent presentation modes: never touch media sources or move a player node. */
(() => {
  'use strict';
  let instance = null;
  const text = {
    lightsOff: 'T\u1eaft \u0111\u00e8n r\u1ea1p', lightsOn: 'B\u1eadt l\u1ea1i \u0111\u00e8n r\u1ea1p',
    theaterOn: 'M\u1edf r\u1ed9ng khung xem', theaterOff: 'Kh\u00f4i ph\u1ee5c khung xem',
    exit: 'B\u1eadt l\u1ea1i \u0111\u00e8n r\u1ea1p (Esc)'
  };
  function init() {
    if (instance) return instance;
    const doc = document, body = doc.body;
    const player = doc.getElementById('player-viewport') || doc.getElementById('m-player-wrapper');
    if (!player) return null;
    const light = doc.getElementById('btn-cinema-mode');
    const theater = doc.getElementById('btn-theater-toggle');
    if (!light) return null;
    const generated = [];
    function ensure(id, tag, parent) {
      let node = doc.getElementById(id);
      if (!node) { node = doc.createElement(tag); node.id = id; parent.append(node); generated.push(node); }
      return node;
    }
    const scrim = ensure('cinema-backdrop-scrim', 'div', body);
    const controls = ensure('cinema-floating-controls', 'div', body);
    const exit = ensure('btn-floating-light', 'button', controls);
    // Only the empty overlay and exit control move; iframe ancestors remain untouched.
    const origins = [scrim, controls].filter(node => !generated.includes(node)).map(node => ({ node, parent: node.parentNode, next: node.nextSibling }));
    body.append(scrim, controls);
    scrim.setAttribute('aria-hidden', 'true');
    controls.hidden = true;
    exit.type = 'button'; exit.title = text.exit; exit.setAttribute('aria-label', text.exit);
    if (!exit.textContent.trim()) exit.textContent = text.lightsOn;
    const listeners = [], inerted = new Map();
    let lightsOff = false, isTheater = false, previousFocus = null, destroyed = false;
    const listen = (node, event, handler, options) => {
      node.addEventListener(event, handler, options);
      listeners.push(() => node.removeEventListener(event, handler, options));
    };
    const focus = node => { if (node?.isConnected && !node.closest('[inert]')) node.focus({ preventScroll: true }); };
    const scroll = point => { if (point && (window.scrollX !== point.x || window.scrollY !== point.y)) window.scrollTo({ left: point.x, top: point.y, behavior: 'instant' }); };
    const position = () => ({ x: window.scrollX, y: window.scrollY });
    const allowed = node => player.contains(node) || controls.contains(node);
    function restoreInert() {
      inerted.forEach((saved, node) => {
        if (saved.inert === null) node.removeAttribute('inert'); else node.setAttribute('inert', saved.inert);
        if (saved.hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', saved.hidden);
      });
      inerted.clear();
    }
    function isolate() {
      restoreInert();
      const protectedNodes = [player, controls, scrim];
      function visit(parent) {
        Array.from(parent.children).forEach(node => {
          if (protectedNodes.includes(node) || /^(SCRIPT|STYLE|LINK)$/.test(node.tagName)) return;
          if (protectedNodes.some(keep => node.contains(keep))) { visit(node); return; }
          inerted.set(node, { inert: node.getAttribute('inert'), hidden: node.getAttribute('aria-hidden') });
          node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true');
        });
      }
      visit(body);
    }
    function updateButtons() {
      light.setAttribute('aria-pressed', String(lightsOff));
      light.title = lightsOff ? text.lightsOn : text.lightsOff;
      light.setAttribute('aria-label', light.title);
      const label = doc.getElementById('light-label');
      if (label) label.textContent = light.title;
      if (theater) {
        theater.setAttribute('aria-pressed', String(isTheater));
        theater.title = isTheater ? text.theaterOff : text.theaterOn;
        theater.setAttribute('aria-label', theater.title);
      }
    }
    function setLights(value, restoreFocus = true) {
      value = Boolean(value);
      if (destroyed || lightsOff === value) return;
      const point = position();
      lightsOff = value;
      body.classList.toggle('cinema-lights-active', value);
      controls.hidden = !value;
      if (value) {
        previousFocus = doc.activeElement;
        if (!allowed(previousFocus)) focus(exit);
        isolate();
        observer.observe(body, { childList: true, subtree: true });
      } else {
        observer.disconnect(); restoreInert();
        if (restoreFocus) focus(previousFocus?.isConnected ? previousFocus : light);
        previousFocus = null;
      }
      updateButtons(); scroll(point);
    }
    function setTheater(value) {
      value = Boolean(value);
      if (destroyed || !theater || isTheater === value) return;
      const point = position();
      isTheater = value;
      body.classList.toggle('watch-theater-active', value);
      updateButtons(); scroll(point);
    }
    const observer = new MutationObserver(() => { if (lightsOff) isolate(); });
    listen(light, 'click', () => setLights(!lightsOff));
    if (theater) listen(theater, 'click', () => setTheater(!isTheater));
    listen(exit, 'click', () => setLights(false));
    listen(scrim, 'click', () => setLights(false));
    listen(doc, 'focusin', event => { if (lightsOff && !allowed(event.target)) focus(exit); });
    listen(doc, 'keydown', event => {
      if (event.defaultPrevented || doc.fullscreenElement || doc.webkitFullscreenElement) return;
      if (event.key === 'Escape') {
        if (lightsOff) { event.preventDefault(); event.stopImmediatePropagation(); setLights(false); }
        else if (isTheater && !event.target.closest?.('[role="dialog"], dialog[open]')) {
          event.preventDefault(); event.stopImmediatePropagation(); setTheater(false);
        }
        return;
      }
      if (!lightsOff || event.key !== 'Tab') return;
      const candidates = [...player.querySelectorAll('button, a[href], input, select, textarea, iframe, video[controls], [tabindex]'), exit]
        .filter(node => !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden], [inert]') && (node.checkVisibility ? node.checkVisibility() : window.getComputedStyle(node).display !== 'none' && window.getComputedStyle(node).visibility !== 'hidden'));
      const index = candidates.indexOf(doc.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focus(candidates.at(-1)); }
      else if (!event.shiftKey && (index === candidates.length - 1 || index < 0)) { event.preventDefault(); focus(candidates[0]); }
    }, true);
    listen(window, 'pagehide', () => instance?.destroy());
    updateButtons();
    instance = {
      setLights, setTheater,
      getState: () => ({ lightsOff, theater: isTheater }),
      destroy() {
        if (destroyed) return;
        setLights(false); setTheater(false); destroyed = true;
        observer.disconnect(); listeners.forEach(remove => remove()); restoreInert();
        origins.forEach(({ node, parent, next }) => parent.insertBefore(node, next?.parentNode === parent ? next : null));
        generated.reverse().forEach(node => node.remove());
        instance = null;
      }
    };
    return instance;
  }
  window.WatchViewModes = { init };
  window.addEventListener('pageshow', event => { if (event.persisted) init(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
