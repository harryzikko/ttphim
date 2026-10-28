(function(root) {
  'use strict';
  const DEFAULTS = { auto_next:true, playback_speed:1, audio_language:'', subtitle_language:'' };
  const SPEEDS = [0.5,0.75,1,1.25,1.5,1.75,2];
  const LANGUAGES = [['','Theo ngu\u1ed3n'],['vi','Ti\u1ebfng Vi\u1ec7t'],['en','English'],['zh','Ti\u1ebfng Trung'],['ko','Ti\u1ebfng H\u00e0n'],['ja','Ti\u1ebfng Nh\u1eadt'],['th','Ti\u1ebfng Th\u00e1i'],['fr','Ti\u1ebfng Ph\u00e1p']];
  function normalize(input) {
    const result={...DEFAULTS};
    if(typeof input?.auto_next==='boolean')result.auto_next=input.auto_next;
    if(SPEEDS.includes(input?.playback_speed))result.playback_speed=input.playback_speed;
    for(const key of ['audio_language','subtitle_language'])if(typeof input?.[key]==='string' && (input[key]==='' || (key==='subtitle_language'&&input[key]==='off') || /^[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,4}$/i.test(input[key])) && input[key].length<=40)result[key]=input[key].toLowerCase();
    return result;
  }
  function create({api=root.API,user=null,storage=root.localStorage}={}) {
    let value={...DEFAULTS,auto_next:!user},ready=false,busy=false,error='',revision=0,loading=null;
    const listeners=new Set(),key='TTPhim_playback_guest';
    const emit=()=>listeners.forEach(fn=>fn({...value},{ready,busy,error,user}));
    const request=async(method,body)=>{
      const response=await api.request('/api/user/playback-preferences',{method,...(body?{body:JSON.stringify(body)}:{})});
      if(!response?.status || !response.data)throw Error('Preferences unavailable');
      return normalize(response.data);
    };
    const controller={
      get:()=>({...value}),
      subscribe(fn){listeners.add(fn);fn({...value},{ready,busy,error,user});return()=>listeners.delete(fn);},
      async load(){
        if(busy)return value;
        if(loading)return loading;
        const ticket=++revision;
        loading=Promise.resolve().then(async()=>{
          try {
            let next;
            if(user)next=await request('GET');
            else {const saved=storage.getItem(key);next=normalize(saved?JSON.parse(saved):{auto_next:storage.getItem('TTPhim_auto_next')!=='false',playback_speed:Number(storage.getItem('TTPhim_player_speed')||1)});}
            if(ticket===revision){value=next;ready=true;error='';}
          }catch(_){if(ticket===revision){ready=false;error='Ch\u01b0a t\u1ea3i \u0111\u01b0\u1ee3c t\u00f9y ch\u1ecdn. Th\u1eed l\u1ea1i \u0111\u1ec3 \u0111\u1ed3ng b\u1ed9.';}}
          finally{loading=null;emit();}
          return {...value};
        });return loading;
      },
      async update(patch){
        if(!ready||busy)return false;
        busy=true;error='';++revision;emit();
        try {
          const next=user?await request('PATCH',patch):normalize({...value,...patch});
          if(!user)storage.setItem(key,JSON.stringify(next));
          value=next;return true;
        }catch(_){error='Ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c t\u00f9y ch\u1ecdn. Vui l\u00f2ng th\u1eed l\u1ea1i.';return false;}
        finally{busy=false;emit();}
      },
      destroy(){root.removeEventListener?.('focus',refresh);root.document?.removeEventListener('visibilitychange',visible);listeners.clear();}
    };
    const refresh=()=>controller.load();
    const visible=()=>{if(root.document.visibilityState==='visible')refresh();};
    root.addEventListener?.('focus',refresh);root.document?.addEventListener('visibilitychange',visible);
    return controller;
  }
  function mountPanel({anchor,controller,open=false,inside=false}) {
    if(!anchor||!controller)return;
    const doc=anchor.ownerDocument,panel=doc.createElement('details');panel.className='playback-preferences';panel.open=open;
    const title=doc.createElement('summary');title.textContent='T\u00f9y ch\u1ecdn ph\u00e1t l\u1ea1i';panel.appendChild(title);
    const form=doc.createElement('div');form.className='playback-preferences-fields';
    const controls={};
    function field(key,text,options){
      const label=doc.createElement('label');label.textContent=text;
      const select=doc.createElement('select');select.dataset.preference=key;
      for(const [value,text]of options){const option=doc.createElement('option');option.value=String(value);option.textContent=text;select.appendChild(option);}
      select.onchange=()=>controller.update({[key]:key==='auto_next'?select.value==='true':key==='playback_speed'?Number(select.value):select.value});
      label.appendChild(select);form.appendChild(label);controls[key]=select;
    }
    field('auto_next','T\u1ef1 chuy\u1ec3n t\u1eadp',[[true,'B\u1eadt'],[false,'T\u1eaft']]);
    field('playback_speed','T\u1ed1c \u0111\u1ed9 ph\u00e1t',SPEEDS.map(n=>[n,n+'x']));
    field('audio_language','\u00c2m thanh \u01b0u ti\u00ean',LANGUAGES);
    field('subtitle_language','Ph\u1ee5 \u0111\u1ec1 \u01b0u ti\u00ean',[...LANGUAGES,['off','T\u1eaft ph\u1ee5 \u0111\u1ec1']]);
    const help=doc.createElement('p');help.textContent='Ch\u1ec9 \u00e1p d\u1ee5ng ng\u00f4n ng\u1eef n\u1ebfu ngu\u1ed3n c\u00f3 track ph\u00f9 h\u1ee3p. Player nh\u00fang t\u1ef1 qu\u1ea3n l\u00fd \u00e2m thanh, ph\u1ee5 \u0111\u1ec1 v\u00e0 t\u1ed1c \u0111\u1ed9.';
    const status=doc.createElement('p');status.setAttribute('role','status');status.className='playback-preferences-status';
    const retry=doc.createElement('button');retry.type='button';retry.textContent='Th\u1eed l\u1ea1i';retry.onclick=()=>controller.load();
    panel.append(form,help,status,retry);if(inside)anchor.appendChild(panel);else anchor.insertAdjacentElement('afterend',panel);
    const unsubscribe=controller.subscribe((value,state)=>{
      for(const [key,select]of Object.entries(controls)){
        if(![...select.options].some(option=>option.value===String(value[key]))){const option=doc.createElement('option');option.value=value[key];option.textContent=value[key];select.appendChild(option);}
        select.value=String(value[key]);select.disabled=!state.ready||state.busy;
      }
      status.textContent=state.error||(state.busy?'\u0110ang l\u01b0u\u2026':state.user?'\u0110\u00e3 t\u1ea3i t\u00f9y ch\u1ecdn t\u00e0i kho\u1ea3n. Thay \u0111\u1ed5i \u0111\u01b0\u1ee3c l\u01b0u tr\u00ean m\u00e1y ch\u1ee7.':'Kh\u00e1ch: ch\u1ec9 l\u01b0u tr\u00ean tr\u00ecnh duy\u1ec7t n\u00e0y.');
      retry.hidden=!state.error;
    });
    return()=>{unsubscribe();panel.remove();};
  }
  root.PlayerPreferences={create,mountPanel,normalize,DEFAULTS,SPEEDS};
  if(root.document)root.document.addEventListener('DOMContentLoaded',async()=>{
    if(!/^\/(?:mobile\/)?tai-khoan\/?$/.test(root.location.pathname))return;
    const anchor=root.document.querySelector('main');if(!anchor)return;
    try{
      const user=await root.API.getMe();if(!user)return;
      const controller=create({user});mountPanel({anchor,controller,open:true,inside:true});await controller.load();
      root.document.querySelector('[data-setting="autoplay_next"]')?.closest('div.flex.items-center.justify-between')?.remove();
      root.document.getElementById('settingAudio')?.remove();
    }catch(_){}
  });
})(typeof window==='undefined'?globalThis:window);
