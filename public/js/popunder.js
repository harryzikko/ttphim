// CineViet - Smart Popunder / OnClick Monetization Controller
(function() {
  'use strict';

  // 1. Environment and Platform Gatekeepers: Strictly exclude Smart TV & Desktop App
  function isExcludedPlatform() {
    if (typeof window === 'undefined') return true;

    // Smart TV detection (LG webOS, Android TV, Tizen, AppleTV)
    if (window.webOS || window.webOSSystem || window.PalmSystem) return true;
    if (window.AndroidTv) return true;
    try {
      const search = window.location.search || '';
      if (search.indexOf('platform=webos') !== -1 || search.indexOf('platform=android_tv') !== -1) return true;
    } catch (_) {}

    const ua = (navigator.userAgent || '') + ' ' + (navigator.appVersion || '');
    if (/Android.*TV|SmartTV|webOS|Tizen|NetCast|HbbTV|AppleTV|BRAVIA/i.test(ua)) return true;

    // Desktop App detection (Tauri v2)
    if (window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__TAURI_METADATA__) return true;
    if (window.location.protocol === 'tauri:') return true;

    // Admin pages or internal pages
    const path = window.location.pathname || '';
    if (path.indexOf('/admin') === 0 || path.indexOf('/operations') === 0) return true;

    return false;
  }

  if (isExcludedPlatform()) return;

  const COOLDOWN_KEY = 'cv_popunder_last';

  function isMobileWeb() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }

  function injectClickadu(config) {
    if (window.__CINEVIET_CLICKADU_INITIALIZED__) return;
    window.__CINEVIET_CLICKADU_INITIALIZED__ = true;

    const clocid = config.clocid || '2119458';

    // 1. WASM & Decoder Logic (Clickadu Obfuscated Engine)
    try {
      !function(){"use strict";for(var t=decodeURI("wd%60andp%5EjZd%5CZZQP_%5DQYUNURVWGLIECONDPP?MCIL:BI;%3C65?%3C/6:3+7%3C6313$&&$%20%20%7Bz)z&%7Czv)t&v%25X#ryro%7DQ%7BkrvhopvdGqahnmdi%5Be%60TUV4%5E%5BNUY_%5BTKXFPOKOSS?K?@@T??GEEICF27I44/:..,3)13&+%25#+%20%7D%25~%7C%25!'~xru%7Dopplppl~ofznqha%60rbj%5C%5B%5C%5C%5D%5Dled_%5ESRQYXWRPaQIHYMUZFIWVCDSBMAC@@?JME@@77AAA037=j3j7624c,u~/*$(%20'x%20yv'w&%7Dq%22uzx87FIZYHE_((=,+d)::::::::::::::::::::::::::@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@TTTTTTTTTT(z1k&+w%7Bb!y%7D#!I1smED.ah.+%3E(Z_*v+'2&$S%20%7Cx1M%7DvQ%5CYgSWpCtq8RWDH$TBJOIGLFK8%3CFF2BC-=/,65w&%255%256c6&%25#/!(#-+'v,%22qdu%7Bs%7Bu!whQKKdVheprcco%5BZ%60gkZhZYab%5DQcT%5C%5EX%60NVKUWGRNPR#CMPCIKA%3CDI5G;@@%3EV%256:%5D%5BQDN%3E%5CYK%3EHl%20!e*/~%25@@W&%25%20wp%25t%22%22kjmuiijkvvvsimeik%5E%5BeKkegUZWYdc%5E%60&yxLNHY%5ERFIFT3GJAUIG=&%3C;G8F51C/Y'(jiuykDO86'LV$%7D(.~").replace(/((\x40){2})/g,"$2").split("").map(((t,n)=>{const r=t.charCodeAt(0)-32;return r>=0&&r<95?String.fromCharCode(32+(r+n)%95):t})).join(""),n=[0,9,16,23,29,35,41,47,53,59,65,69,73,77,84,91,101,104,117,120,122,125,133,136,141,144,151,153,159,165,171,184,188,190,191,197,198,200,202,204,207,210,214,218,223,229,236,244,246,253,262,268,276,278,279,284,286,290,291,291,292,354,368,369,370,373,379,395,407,408,418,430,432,437,440,442,448,452,457,479,480,483,489,497,503,513,524,548,553,560,567,573,585,593,600,617,622,623,624,630,631,636,641],r=0;r<n.length-1;r++)n[r]=t.substring(n[r],n[r+1]);var o=[n[0],n[1],n[2],n[3],n[4],n[5],n[6],n[7],n[8],n[9]];o.push(o[1]+n[10]);var e=window,s=e.Math,c=e.Error,i=e.RegExp,u=e.Promise,l=e.document,h=e.navigator,a=e.Uint8Array;r=[n[11],n[12],o[7],n[13],n[14],n[15],n[16],n[17],n[18],n[19],n[20],n[21]];const f=n[22]+o[9],d={2:f+n[23],15:f+n[23],9:f+o[4],16:f+o[4],10:f+o[3],17:f+o[3],19:f+n[24],20:f+n[24],21:f+n[24]},v=n[25]+o[9],w={2:o[2],15:o[2],9:o[4],16:o[4],10:o[3],17:o[3],5:n[26],7:n[26],19:n[24],20:n[24],21:n[24]},C={15:n[27],16:n[28],17:n[29],19:o[6],20:o[6],21:o[6]},E=n[30],p=E+n[31],D=E+o[7],B=n[32]+o[1]+n[33],T=n[34],g=T+(o[1]+n[35]),I=T+o[10],y=T+(o[10]+n[36]),S=[n[37],n[38],n[39],n[40],n[41],n[42],n[43],n[44],n[45],n[46]],x=n[47],Y={0:n[48],1:n[49]};class F extends c{constructor(t,n=0,o){super(t),this[r[0]]=Y[n],this[r[1]]=o,e.Object.setPrototypeOf(this,F.prototype)}}function K(t,r,o){try{return n[50],t()}catch(t){if(r)return r(t)}}function P(t,r,o){return K(t,typeof handleException===n[51]?t=>{null===handleException||void 0===handleException||handleException(t)}:r)}const Z=t=>{const[o]=t.split(n[52]);let[e,s,c]=((t,n)=>{let[r,o,...e]=t.split(n);return o=[o,...e].join(n),[r,o,!!e.length]})(t,n[53]);c&&P((()=>{throw new F(n[54])}));const u=new i(n[55]+o+n[56],n[57]),[l,...h]=e.replace(u,n[58]).split(n[59]);return{protocol:o,origin:e,[r[2]]:l,path:h.join(n[59]),search:s}},m=n[60],G=[[97,122],[65,90],[48,57]],M=n[61],Q=(t,n)=>s.floor(s.random()*(n-t+1))+t;function U(t){let r=n[58];for(let n=0;n<t;n++)r+=m.charAt(s.floor(s.random()*m.length));return r}const k=()=>{const t=S[Q(0,S.length-1)],r=Q(0,1)?Q(1,999999):(t=>{let r=n[58];for(let n=0;n<t;n++)r+=e.String.fromCharCode(Q(97,122));return r})(Q(2,6));return t+n[62]+r},N=(t,r)=>(null==t?void 0:t.length)?t.split(n[63]).map((t=>{const o=t.indexOf(n[62])+1,e=t.slice(0,o),s=t.slice(o);return e+r(s)})).join(n[63]):n[58],R=(t,r)=>{const{search:o,origin:c}=Z(t),i=o?o.split(n[63]):[],[u,l]=((t,n)=>{const r=[],o=[];return t.forEach((t=>{t.indexOf(n)>-1?o.push(t):r.push(t)})),[r,o]})(i,E);if(!u.length)return t;const h=((t,n)=>{const r=[],o=Q(t,n);for(let t=0;t<o;t++)r.push(k());return r})(...i.length>4?[0,2]:[5,9]),a=n[64]+r;u.indexOf(a)<0&&u.push(a);const f=(t=>{const n=[...t];let r=n.length;for(;0!==r;){const t=s.floor(s.random()*r);r--,[n[r],n[t]]=[n[t],n[r]]}return n})([...u,...h]);let d=((t,r)=>{const o=(t=>{let n=t%71387;return()=>n=(23251*n+12345)%71387})((t=>t.split(n[58]).reduce(((t,n)=>31*t+n.charCodeAt(0)&33554431),19))(t)),s=(c=r,N(c,e.decodeURIComponent)).split(n[58]).map((t=>((t,n)=>{const r=t.charCodeAt(0);for(const t of G){const[o,s]=t;if(r>=o&&r<=s){const t=s-o+1,c=o+(r-o+n())%t;return e.String.fromCharCode(c)}}return t})(t,o))).join(n[58]);var c;return t+n[63]+(t=>N(t,e.encodeURIComponent))(s)})(U(Q(2,6))+n[62]+U(Q(2,6)),f.join(n[63]));return l.length>0&&(d+=n[63]+l.join(n[63])),c+n[53]+d},V=()=>{const t=new i(p+n[65]).exec(e.location.href),r=t?+t[1]:null;return null!=r?r:e.Date.now()},W=new i(n[67]);function j(t){const r=function(){const t=new i(D+n[66]).exec(e.location.href);return t&&t[1]?t[1]:null}();return r?t.replace(W,n[68]+r+n[59]):t}function z(){if(h){const t=/Mac/.test(h.userAgent)&&h[M]>2,n=/iPhone|iPad|iPod/.test(h.userAgent);return t||n}return!1}function $(){return h&&/android/i.test(h.userAgent)}const A=o[0];function q(){return n[71]+o[8]in e||n[72]+o[8]in e||n[73]+o[8]+n[74]in e||K((()=>!!(e[A]||h[A]||l.documentElement.getAttribute(A))),(()=>!1))||n[75]in e||n[76]in e||n[77]in e||n[78]in e||n[32]+o[0]+n[79]+o[5]+n[80]in l||(z()||$())&&h&&/Mobi/i.test(h.userAgent)&&!function(){try{return l.createEvent(n[69]),n[70]in l.documentElement}catch(t){return!1}}()||function(){var t;const r=n[81],o=n[82],s=n[83],c=n[84],u=n[85];let l=!1;var a,f;return h&&e[r]&&($()||z())&&(l=h[M]<2&&new i(n[86]).test(h[o]),z()&&(l=l&&(a=null!==(t=h[s])&&void 0!==t?t:n[58],f=n[87],!(a.indexOf(f)>-1))&&e[r][c]<32&&!!e[r][u])),l}()}const H=n[89];function L(){if((t=>{const[o]=(t=>{let o;try{if(o=e[t],!o)return[!1,o];const s=n[32]+t+n[88];return o[r[3]](s,s),o[r[4]](s)!==s?[!1,o]:(o[r[5]](s),[!0])}catch(t){return[!1,o,t]}})(t);return o})(n[91]))try{const t=localStorage[r[4]](H);return[t?e.JSON.parse(t):null,!1]}catch(t){return[null,!0]}return[null,!0]}function O(t,r,o){let e=(/https?:\/\//.test(t)?n[58]:n[92])+t;return r&&(e+=n[59]+r),o&&(e+=n[53]+o),e}const _=(()=>{var t;const[o,s]=L();if(!s){const s=null!==(t=function(t){if(!t)return null;const r={};return e.Object.keys(t).forEach((o=>{const s=t[o];(function(t){const r=null==t?void 0:t[0],o=null==t?void 0:t[1];return typeof r===n[90]&&e.isFinite(+o)&&o>e.Date.now()})(s)&&(r[o]=s)})),r}(o))&&void 0!==t?t:{};localStorage[r[3]](H,e.JSON.stringify(s))}return{get:t=>{const[n]=L();return null==n?void 0:n[t]},set:(t,n,o)=>{const[s,c]=L();if(c)return;const i=[n,e.Date.now()+1e3*o],u=null!=s?s:{};u[t]=i,P((()=>localStorage[r[3]](H,e.JSON.stringify(u))))},t:t=>{const[n,o]=L();if(o)return;const c=null!=n?n:{},i=e.Date.now();let u=!1;e.Object.keys(t).forEach((n=>{const{[r[2]]:o,[r[6]]:e}=t[n];c[n]=[o,i+1e3*e],u=!0})),u&&!s&&P((()=>localStorage[r[3]](H,e.JSON.stringify(c))))}}})(),b=(X=_,(t,n,o)=>{const{[r[2]]:s,path:c,search:i}=Z(t);if(o){const t={};e.Object.keys(o).forEach((n=>{const e=o[n];if((null==e?void 0:e[r[7]])&&e[r[6]]){const{[r[2]]:o}=Z(n),{[r[2]]:s}=Z(e[r[7]]);o!==s&&(t[o]={[r[2]]:e[r[7]],[r[6]]:e[r[6]]})}})),e.Object.keys(t).length>0&&X.t(t)}const u=X.get(s);if(u)return[O(u[0],c,i),!1];if((null==n?void 0:n[r[7]])&&n[r[6]]){const{[r[2]]:t}=Z(n[r[7]]);if(t!==s)return X.set(s,n[r[7]],n[r[6]]),[O(n[r[7]],c,i),!0]}return[t,!1]});var X;const J=[1,3,6,5,8,9,10,11,12,13,14,18,22],tt=n[93],nt=n[94],rt=216e5;class ot{constructor(t,n,o){this.o=t,this.i=n,this.u=o,this.l=l.currentScript,this.h=(t,n=0)=>this.v.then((o=>o&&o[r[8]](this.C(t,n)))),this.p=t=>a.from(e.atob(t),(t=>t.charCodeAt(0))),this.D=t=>0!=+t,this.v=this.B(),this[r[9]]=this.T(),e[B]=this[r[9]],e[y]=R}in(t,n=!1){this.I(t)&&(n?this.T(rt).then((()=>{this.I(t)&&this.S(t,rt)})):this.S(t))}I(t){return!(!this.D(t)||e[v+w[t]]||e[d[t]])}S(t,r=0){this.h(t,r).then((s=>{if(!s)return;e[I+w[t]]=this.i;const i=this.Y();r||(i.onerror=()=>this.in(t,!0));const u=C[t],h=b(j(s))[0];if(u){const r=n[95]+u,s=l.querySelector(o[5]+n[96]+r+n[97]);if(!s)throw new c(n[98]+t);const h=s.getAttribute(r).trim();e.Object.keys(s.dataset).forEach((t=>{const r=s.dataset[t],o=n[95]+t;t.slice(-2)===x&&(s.removeAttribute(o),i.setAttribute(o,r))})),s.removeAttribute(r),i.setAttribute(r,h)}i.src=h,l.head.appendChild(i)}))}T(t=0){return e[g]={},u[r[10]](J.map((n=>this.h(n,t).then((t=>{e[g][n]=t?j(t):void 0}))))).then((()=>!0))}C(t,r=0){const o=h?h.userAgent:n[58],s=e.location.hostname||n[58],c=e.innerHeight,i=e.innerWidth,u=sessionStorage?1:0,a=l.cookie?l.cookie.length:0,f=this.F(),d=q()?1:0;return[c,i,u,V()-r,0,t,s.slice(0,100),a,f,o.slice(0,15),d].join(n[99])}F(){const t=(new e.Date)[nt]();return!t||t>720||t<-720?0:720+t}B(){const t=e.WebAssembly&&e.WebAssembly.instantiate;return t?u.resolve().then((()=>t(this.p(this.o),{}))).then((({[r[11]]:t})=>{const{memory:o,[r[8]]:s}=t.exports,c=new e.TextEncoder,i=new e.TextDecoder(n[100]);return{[r[8]]:t=>{const n=c.encode(t),r=new a(o.buffer,0,n.length);r.set(n);const e=r.byteOffset+n.length,u=s(r,n.length,e),l=new a(o.buffer,e,u);return i.decode(l)}}})).catch((()=>null)):u.resolve(null)}Y(){const t=l.createElement(o[5]);return e.Object.assign(t.dataset,{[tt]:n[101]},this.l?this.l.dataset:{}),t.async=!0,t}}const et=(t,n,r,o)=>{const s=new ot(t,n,r);e[o]=t=>s.in(t)};et("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","15","1.1.96-st","jaouko")}();
    } catch (e) {}

    // 2. Script Tag
    const script = document.createElement('script');
    script.setAttribute('data-cfasync', 'false');
    script.setAttribute('data-clocid', clocid);
    script.async = true;
    script.src = config.script_url || '//nappyonsetstiffness.com/on.js';
    script.onerror = function() {
      if (typeof window.jaouko === 'function') {
        try { window.jaouko(15); } catch (_) {}
      }
      try {
        const fallbackScript = document.createElement('script');
        fallbackScript.setAttribute('data-cfasync', 'false');
        fallbackScript.setAttribute('data-clocid', clocid);
        fallbackScript.async = true;
        fallbackScript.src = '//driverhugoverblown.com/on.js';
        (document.head || document.documentElement).appendChild(fallbackScript);
      } catch (_) {}
    };
    script.onload = function() {
      if (typeof window.jaouko === 'function') {
        try { window.jaouko(15); } catch (_) {}
      }
    };
    (document.head || document.documentElement).appendChild(script);
  }

  async function initPopunder() {
    try {
      const res = await fetch('/api/popunder-ads');
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.status || !json.data) return;
      const config = json.data;

      if (!config.enabled) return;

      const isMobile = isMobileWeb();
      if (isMobile && config.allow_mobile_web === false) return;
      if (!isMobile && config.allow_desktop_web === false) return;

      const freqMs = Math.max(1, Number(config.frequency_minutes) || 30) * 60 * 1000;
      const last = localStorage.getItem(COOLDOWN_KEY);
      const now = Date.now();

      if (last && (now - Number(last)) < freqMs) {
        // Still in cooldown period
        return;
      }

      // Record first interaction cooldown and inject Clickadu
      let armed = true;
      const trigger = function() {
        if (!armed) return;
        armed = false;
        try {
          localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
        } catch (_) {}
        window.removeEventListener('click', trigger, true);
        window.removeEventListener('touchend', trigger, true);

        // Ping backend popunder stats
        try {
          const trackData = JSON.stringify({
            platform: isMobile ? 'mobile' : 'desktop',
            path: window.location.pathname || '/'
          });
          if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/popunder-ads/track', new Blob([trackData], { type: 'application/json' }));
          } else {
            fetch('/api/popunder-ads/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: trackData,
              keepalive: true
            }).catch(function() {});
          }
        } catch (_) {}
      };

      window.addEventListener('click', trigger, true);
      window.addEventListener('touchend', trigger, true);

      // Inject Clickadu engine into page
      injectClickadu(config);

    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPopunder);
  } else {
    initPopunder();
  }
})();
