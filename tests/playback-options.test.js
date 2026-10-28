const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const {createService,DEFAULTS,validatePatch}=require('../src/services/playbackPreferences');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function database(){
  const state={users:[{id:'a',name:'A',password:'keep'},{id:'b',name:'B'}],history:[{user_id:'a',movie_slug:'film'}]};let queue=Promise.resolve();
  return {state,read:async()=>structuredClone(state),mutate(fn){const work=queue.then(()=>fn(state));queue=work.catch(()=>{});return work;}};
}
function fixture(){
  const dom=new JSDOM('<main><div id="player"><video></video></div></main>',{url:'http://localhost/xem-phim/film/tap-1',runScripts:'outside-only'});
  const w=dom.window;w.eval(read('public/js/player-preferences.js'));w.eval(read('public/js/player-tracks.js'));
  return {dom,w,doc:w.document,video:w.document.querySelector('video'),container:w.document.getElementById('player')};
}
test('preferences default without writes, merge concurrent patches and isolate accounts/unrelated user fields',async()=>{
  const db=database(),service=createService(db);assert.deepEqual(await service.get('a'),DEFAULTS);assert.equal(db.state.users[0].playback_preferences,undefined);
  await Promise.all([service.update('a',{auto_next:false}),service.update('a',{playback_speed:1.75}),service.update('a',{audio_language:'VI',subtitle_language:'off'})]);
  assert.deepEqual(await service.get('a'),{auto_next:false,playback_speed:1.75,audio_language:'vi',subtitle_language:'off'});
  assert.deepEqual(await service.get('b'),DEFAULTS);assert.equal(db.state.users[0].password,'keep');assert.equal(db.state.history.length,1);
  await assert.rejects(service.get('missing'),{statusCode:404});
});
test('preference mutation validates types, bounds, unknown/prototype keys and does not coerce invalid data',()=>{
  for(const patch of [{},{auto_next:'false'},{playback_speed:'1.5'},{playback_speed:3},{audio_language:'<img>'},{subtitle_language:null},{user_id:'b'},{role:'admin'},[],JSON.parse('{"__proto__":{"admin":true}}')])assert.throws(()=>validatePatch(patch),{statusCode:400});
  assert.deepEqual(validatePatch({audio_language:'en-US',subtitle_language:'off'}),{audio_language:'en-us',subtitle_language:'off'});
});
test('two browser controllers load server values, persist only confirmed writes and refresh on focus',async()=>{
  const a=fixture(),b=fixture();let server={...DEFAULTS},fail=false;
  const api={request:async(_,options)=>{if(fail)throw Error('offline');if(options.method==='PATCH')server={...server,...JSON.parse(options.body)};return{status:true,data:server};}};
  const first=a.w.PlayerPreferences.create({api,user:{id:'a'}}),second=b.w.PlayerPreferences.create({api,user:{id:'a'}});
  try{
    a.w.localStorage.setItem('TTPhim_player_speed','2');await first.load();await second.load();assert.equal(first.get().playback_speed,1);
    await first.update({auto_next:false,playback_speed:1.5,audio_language:'vi'});assert.equal(second.get().playback_speed,1);
    b.w.dispatchEvent(new b.w.Event('focus'));await tick();assert.equal(second.get().playback_speed,1.5);assert.equal(second.get().auto_next,false);
    fail=true;assert.equal(await first.update({playback_speed:2}),false);assert.equal(first.get().playback_speed,1.5);assert.equal(a.w.localStorage.getItem('TTPhim_playback_guest'),null);
  }finally{first.destroy();second.destroy();a.w.close();b.w.close();}
});
test('account load failure never falls back to guest preferences; retry and guest storage work separately',async()=>{
  const h=fixture();let fail=true,calls=0;
  h.w.localStorage.setItem('TTPhim_playback_guest',JSON.stringify({auto_next:true,playback_speed:2}));
  const account=h.w.PlayerPreferences.create({user:{id:'a'},api:{request:async()=>{calls++;if(fail)throw Error();return{status:true,data:DEFAULTS};}}});
  const guest=h.w.PlayerPreferences.create();
  try{
    await account.load();assert.equal(account.get().auto_next,false);assert.equal(account.get().playback_speed,1);assert.equal(await account.update({playback_speed:2}),false);
    fail=false;await account.load();assert.equal(account.get().auto_next,true);assert.equal(calls,2);
    await guest.load();assert.equal(guest.get().playback_speed,2);await guest.update({auto_next:false});assert.equal(JSON.parse(h.w.localStorage.getItem('TTPhim_playback_guest')).auto_next,false);
    await guest.load();assert.equal(guest.get().auto_next,false);
  }finally{account.destroy();guest.destroy();h.w.close();}
});
test('preferences panel disables pending writes, rolls back rejected selection and has a retry',async()=>{
  const h=fixture();let resolve,fail=false;
  const controller=h.w.PlayerPreferences.create({user:{id:'a'},api:{request:async(_,options)=>{if(options.method==='GET'){if(fail)throw Error();return{status:true,data:DEFAULTS};}return new Promise(done=>{resolve=done;});}}});
  try{
    h.w.PlayerPreferences.mountPanel({anchor:h.container,controller});await controller.load();
    const select=h.doc.querySelector('[data-preference="playback_speed"]');select.value='1.5';select.dispatchEvent(new h.w.Event('change'));
    assert.equal(select.disabled,true);assert.equal(select.value,'1');resolve({status:false});await tick();
    assert.equal(select.disabled,false);assert.equal(select.value,'1');assert.equal(h.doc.querySelector('.playback-preferences button').hidden,false);
    assert.ok(h.doc.querySelector('[role="status"]').textContent.includes('Chưa lưu'));
  }finally{controller.destroy();h.w.close();}
});
function fakeHls(){
  const callbacks=new Map(),Events={MANIFEST_PARSED:'manifest',AUDIO_TRACKS_UPDATED:'audio',AUDIO_TRACK_SWITCHED:'audio-switch',SUBTITLE_TRACKS_UPDATED:'subs',SUBTITLE_TRACK_SWITCH:'sub-switch'};
  return {Events,instance:{audioTracks:[],subtitleTracks:[],audioTrack:0,subtitleTrack:-1,subtitleDisplay:true,on(event,fn){if(!callbacks.has(event))callbacks.set(event,new Set());callbacks.get(event).add(fn);},off(event,fn){callbacks.get(event)?.delete(fn);},emit(event){callbacks.get(event)?.forEach(fn=>fn());}}};
}
test('no track menu for single/burned-in audio, actual HLS tracks render safely and choose by real index',async()=>{
  const h=fixture(),fake=fakeHls(),instance=fake.instance;
  let value={...DEFAULTS,audio_language:'vi',subtitle_language:'vi'},listener,updates=[];
  const preferences={get:()=>value,subscribe(fn){listener=fn;fn(value);return()=>{listener=null;};},update:async patch=>{updates.push(patch);value={...value,...patch};listener?.(value);return true;}};
  const tracks=h.w.PlayerTracks.mount({video:h.video,container:h.container,Hls:fake,preferences});
  try{
    assert.equal(h.doc.querySelector('.player-track-menu').hidden,true);
    tracks.attachHls(instance);instance.audioTracks=[{name:'Only',lang:'en'}];instance.emit('audio');assert.equal(h.doc.querySelector('.player-track-menu').hidden,true);
    instance.audioTracks.push({name:'<img src=x onerror=alert(1)>',lang:'vie'});instance.subtitleTracks=[{name:'English',lang:'en'},{name:'Vietnamese',lang:'vi'}];instance.emit('subs');
    assert.equal(instance.audioTrack,1);assert.equal(instance.subtitleTrack,1);assert.equal(h.doc.querySelector('.player-track-menu').hidden,false);assert.equal(h.doc.querySelector('img'),null);
    let audio=h.doc.querySelector('[data-track-kind="audio"]');assert.equal(audio.options.length,2);audio.value='0';audio.dispatchEvent(new h.w.Event('change'));assert.equal(instance.audioTrack,0);
    const subtitle=h.doc.querySelector('[data-track-kind="subtitles"]');assert.equal(subtitle.options.length,3);subtitle.value='-1';subtitle.dispatchEvent(new h.w.Event('change'));assert.equal(instance.subtitleTrack,-1);assert.equal(instance.subtitleDisplay,false);
    assert.deepEqual(JSON.parse(JSON.stringify(updates)),[{audio_language:'en'},{subtitle_language:'off'}]);
    tracks.destroy();assert.equal(h.doc.querySelector('.player-track-menu'),null);instance.emit('audio');assert.equal(h.doc.querySelector('.player-track-menu'),null);
  }finally{tracks.destroy();h.w.close();}
});
test('native audio/text tracks expose only real choices and unavailable preference preserves source selection',()=>{
  const h=fixture();const audio=[{language:'en',label:'English',enabled:true},{language:'ja',label:'Japanese',enabled:false}];
  const subtitle=[{kind:'metadata',language:'vi',mode:'hidden'},{kind:'subtitles',language:'en',label:'English',mode:'showing'}];
  Object.defineProperty(h.video,'audioTracks',{value:audio});Object.defineProperty(h.video,'textTracks',{value:subtitle});
  const tracks=h.w.PlayerTracks.mount({video:h.video,container:h.container,preferences:{get:()=>({audio_language:'vi',subtitle_language:'vi'})}});
  try{
    assert.equal(audio[0].enabled,true);assert.equal(h.doc.querySelector('[data-track-kind="subtitles"]').options.length,2);
    const select=h.doc.querySelector('[data-track-kind="audio"]');select.value='1';select.dispatchEvent(new h.w.Event('change'));assert.equal(audio[0].enabled,false);assert.equal(audio[1].enabled,true);
    assert.equal(h.w.PlayerTracks.match([{lang:'en-US'},{lang:'vi'}],'eng'),0);
  }finally{tracks.destroy();h.w.close();}
});

test('explicit second track of the same language survives its own asynchronous preference save',async()=>{
  const h=fixture(),fake=fakeHls();let value={...DEFAULTS,audio_language:'vi',subtitle_language:'vi'},listener;
  const preferences={get:()=>value,subscribe(fn){listener=fn;fn(value);return()=>{};},async update(patch){listener(value);await tick();value={...value,...patch};listener(value);return true;}};
  fake.instance.audioTracks=[{name:'English',lang:'en'},{name:'English description',lang:'en'},{name:'Vietnamese',lang:'vi'}];
  fake.instance.subtitleTracks=[{name:'English',lang:'en'},{name:'English SDH',lang:'en'},{name:'Vietnamese',lang:'vi'}];
  const tracks=h.w.PlayerTracks.mount({video:h.video,container:h.container,Hls:fake,preferences});tracks.attachHls(fake.instance);
  try{
    const audio=h.doc.querySelector('[data-track-kind="audio"]');audio.value='1';audio.dispatchEvent(new h.w.Event('change'));await tick();await tick();assert.equal(fake.instance.audioTrack,1);
    const subtitle=h.doc.querySelector('[data-track-kind="subtitles"]');subtitle.value='1';subtitle.dispatchEvent(new h.w.Event('change'));await tick();await tick();assert.equal(fake.instance.subtitleTrack,1);
    fake.instance.emit('audio');assert.equal(fake.instance.audioTrack,1);
    value={...value,audio_language:'vi',subtitle_language:'vi'};listener(value);assert.equal(fake.instance.audioTrack,2);assert.equal(fake.instance.subtitleTrack,2);
  }finally{tracks.destroy();h.w.close();}
});
