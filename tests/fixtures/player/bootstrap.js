// Test-only observation; Hls.js itself, MSE and H.264 decoding remain real.
window.qa = { hls: [], sessions: [], states: [], arts: [], telemetry: [] };
window.showToast = () => {};
window.MobileApp = { toast() {} };
const createElement = document.createElement.bind(document);
document.createElement = function (name, ...args) {
  const element = createElement(name, ...args);
  if (name.toLowerCase() === 'video') element.muted = true;
  return element;
};
const RealHls = window.Hls;
window.Hls = class extends RealHls {
  constructor(...args) { super(...args); this.qaCallbacks = []; qa.hls.push(this); }
  on(event, callback, ...args) { this.qaCallbacks?.push([event, callback]); return super.on(event, callback, ...args); }
  destroy() { this.qaDestroyed = true; return super.destroy(); }
};
const createSession = PlayerUX.createSession;
PlayerUX.createSession = options => {
  const onState = options.onState;
  const session = createSession({ ...options, ...(options.url?.includes('broken.m3u8') ? { timeout: 500 } : {}),
    onState: (...args) => { qa.states.push(args); onState?.(...args); } });
  qa.sessions.push(session);
  return session;
};
// TV's external Artplayer dependency is a contract double, NOT an Artplayer integration test.
window.Artplayer = class {
  constructor(options) {
    this.video = document.createElement('video');
    this.video.controls = true;
    this.handlers = {};
    document.querySelector(options.container).append(this.video);
    qa.arts.push(this);
    this.video.addEventListener('loadedmetadata', () => this.video.play().catch(() => {}), { once: true });
    options.customType.m3u8(this.video, options.url);
  }
  on(event, callback) {
    this.handlers[event] = callback;
    this.video.addEventListener(event.replace('video:', ''), callback);
  }
  get currentTime() { return this.video.currentTime; }
  set currentTime(value) { this.video.currentTime = value; }
  get duration() { return this.video.duration; }
  pause() { this.video.pause(); }
  toggle() { if (this.video.paused) this.video.play().catch(() => {}); else this.video.pause(); }
  destroy() { this.destroyed = true; this.video.remove(); }
};
