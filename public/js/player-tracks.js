(function(root) {
  'use strict';
  const language = value => String(value || '').toLowerCase().replace(/_/g,'-');
  const aliases = {vie:'vi',eng:'en',zho:'zh',chi:'zh',jpn:'ja',kor:'ko',tha:'th',fra:'fr',fre:'fr'};
  function canonical(value){const parts=language(value).split('-');parts[0]=aliases[parts[0]]||parts[0];return parts.join('-');}
  function match(tracks,wanted){
    if(!wanted||wanted==='off')return -1;
    const target=canonical(wanted);
    let index=tracks.findIndex(track=>canonical(track.lang)===target);
    if(index<0)index=tracks.findIndex(track=>canonical(track.lang).split('-')[0]===target.split('-')[0]);
    return index;
  }
  function mount({video,container,Hls,preferences}) {
    if(!video||!container)return {attachHls(){},destroy(){}};
    const doc=container.ownerDocument,box=doc.createElement('details');box.className='player-track-menu';box.hidden=true;
    const summary=doc.createElement('summary');summary.textContent='\u00c2m thanh / Ph\u1ee5 \u0111\u1ec1';box.appendChild(summary);
    const body=doc.createElement('div');body.className='player-track-fields';box.appendChild(body);container.appendChild(box);
    let hls=null,active=true,updating=false,lastAudio='',lastSubtitle='';
    const manual = {};
    const signature = tracks => tracks.map(track=>track.lang+':'+track.label).join('|');
    const cleanups=[],hlsCleanups=[];
    let preferred=preferences?.get()||{};
    const asArray=list=>Array.from(list||[]);
    const nativeSubtitle=()=>asArray(video.textTracks).filter(track=>['subtitles','captions'].includes(track.kind));
    function snapshot(){
      if(hls)return {
        audio:asArray(hls.audioTracks).map((track,index)=>({index,lang:track.lang||'',label:track.name||track.lang||`\u00c2m thanh ${index+1}`})),
        subtitles:hls.subtitleTracks?.length ? asArray(hls.subtitleTracks).map((track,index)=>({index,lang:track.lang||'',label:track.name||track.lang||`Ph\u1ee5 \u0111\u1ec1 ${index+1}`})) : nativeSubtitle().map((track,index)=>({index,lang:track.language||'',label:track.label||track.language||`Ph\u1ee5 \u0111\u1ec1 ${index+1}`})),
        audioIndex:hls.audioTrack,subtitleIndex:hls.subtitleTracks?.length ? (hls.subtitleDisplay===false?-1:hls.subtitleTrack) : nativeSubtitle().findIndex(track=>track.mode==='showing')
      };
      const audio=asArray(video.audioTracks),subtitles=nativeSubtitle();
      return {audio:audio.map((track,index)=>({index,lang:track.language||'',label:track.label||track.language||`\u00c2m thanh ${index+1}`})),
        subtitles:subtitles.map((track,index)=>({index,lang:track.language||'',label:track.label||track.language||`Ph\u1ee5 \u0111\u1ec1 ${index+1}`})),
        audioIndex:audio.findIndex(track=>track.enabled),subtitleIndex:subtitles.findIndex(track=>track.mode==='showing')};
    }
    function choose(kind,index){
      if(!active)return;
      if(hls && (kind==='audio' || hls.subtitleTracks?.length)){if(kind==='audio')hls.audioTrack=index;else{hls.subtitleDisplay=index>=0;hls.subtitleTrack=index;}}
      else if(kind==='audio')asArray(video.audioTracks).forEach((track,n)=>{track.enabled=n===index;});
      else nativeSubtitle().forEach((track,n)=>{track.mode=n===index?'showing':'disabled';});
    }
    function applyPreferred(data){
      const audio=preferred.audio_language||'',subtitle=preferred.subtitle_language||'';
      const audioMatch=match(data.audio,audio),subtitleMatch=match(data.subtitles,subtitle);
      const audioKey=audio+'|'+data.audio.map(track=>track.lang+':'+track.label).join('|');
      const subtitleKey=subtitle+'|'+data.subtitles.map(track=>track.lang+':'+track.label).join('|');
      const keep = (kind, wanted, tracks) => {
        const selection = manual[kind];
        if (!selection || selection.signature !== signature(tracks)) return false;
        if (wanted === selection.language) { selection.before = selection.language; return true; }
        if (wanted === selection.before) return true;
        delete manual[kind]; return false;
      };
      if(audioKey!==lastAudio){lastAudio=audioKey;if(audioMatch>=0 && !keep('audio',audio,data.audio))choose('audio',audioMatch);}
      if(subtitleKey!==lastSubtitle){lastSubtitle=subtitleKey;if(!keep('subtitles',subtitle,data.subtitles)){if(subtitle==='off')choose('subtitles',-1);else if(subtitleMatch>=0)choose('subtitles',subtitleMatch);}}
    }
    function render(){
      if(!active||updating)return;
      updating=true;
      try {
        let data=snapshot();applyPreferred(data);data=snapshot();
        box.hidden=data.audio.length<2 && data.subtitles.length===0;
        body.replaceChildren();if(box.hidden)return;
        const field=(kind,label,tracks,current,off=false)=>{
          const row=doc.createElement('label');row.textContent=label;
          const select=doc.createElement('select');select.dataset.trackKind=kind;
          if(off){const option=doc.createElement('option');option.value='-1';option.textContent='T\u1eaft ph\u1ee5 \u0111\u1ec1';select.appendChild(option);}
          for(const track of tracks){const option=doc.createElement('option');option.value=track.index;option.textContent=track.label;select.appendChild(option);}
          select.value=String(current);
          select.onchange=()=>{
            const index=Number(select.value);choose(kind,index);
            const chosen=tracks.find(track=>track.index===index);
            const value=index===-1?'off':canonical(chosen?.lang);
            manual[kind] = { before: preferred[kind==='audio'?'audio_language':'subtitle_language'] || '', language: value, signature: signature(tracks) };
            if(value && /^(?:off|[a-z]{2,8}(?:-[a-z0-9]{1,8}){0,4})$/.test(value))preferences?.update?.({[kind==='audio'?'audio_language':'subtitle_language']:value});
            render();
          };
          row.appendChild(select);body.appendChild(row);
        };
        if(data.audio.length>1)field('audio','\u00c2m thanh',data.audio,data.audioIndex);
        if(data.subtitles.length)field('subtitles','Ph\u1ee5 \u0111\u1ec1',data.subtitles,data.subtitleIndex,true);
        const missing=(preferred.audio_language&&data.audio.length&&match(data.audio,preferred.audio_language)<0)||(preferred.subtitle_language&&preferred.subtitle_language!=='off'&&data.subtitles.length&&match(data.subtitles,preferred.subtitle_language)<0);
        if(missing){const note=doc.createElement('p');note.textContent='Ngu\u1ed3n kh\u00f4ng c\u00f3 ng\u00f4n ng\u1eef \u01b0u ti\u00ean. B\u1ea1n c\u00f3 th\u1ec3 ch\u1ecdn track hi\u1ec7n c\u00f3.';body.appendChild(note);}
      } finally {updating=false;}
    }
    function listen(target,event){if(!target?.addEventListener)return;target.addEventListener(event,render);cleanups.push(()=>target.removeEventListener(event,render));}
    listen(video,'loadedmetadata');listen(video,'loadeddata');
    for(const list of [video.audioTracks,video.textTracks])for(const event of ['addtrack','removetrack','change'])listen(list,event);
    const unsubscribe=preferences?.subscribe?.(value=>{preferred=value;render();});
    render();
    return {
      attachHls(instance){
        delete manual.audio; delete manual.subtitles;
        hlsCleanups.splice(0).forEach(fn=>fn());hls=instance;lastAudio='';lastSubtitle='';
        for(const key of ['MANIFEST_PARSED','AUDIO_TRACKS_UPDATED','AUDIO_TRACK_SWITCHED','SUBTITLE_TRACKS_UPDATED','SUBTITLE_TRACK_SWITCH']){
          const event=Hls?.Events?.[key];if(!event)continue;
          instance.on(event,render);hlsCleanups.push(()=>instance.off?.(event,render));
        }
        render();
      },
      destroy(){active=false;unsubscribe?.();cleanups.forEach(fn=>fn());hlsCleanups.forEach(fn=>fn());box.remove();}
    };
  }
  root.PlayerTracks={mount,match,canonical};
})(typeof window==='undefined'?globalThis:window);
