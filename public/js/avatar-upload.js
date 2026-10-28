(() => {
  'use strict';
  const LIMIT = 5 * 1024 * 1024, PIXELS = 20 * 1024 * 1024;
  const node = (tag, text, cls) => { const el=document.createElement(tag); if(text)el.textContent=text;if(cls)el.className=cls;return el; };
  function start() {
    const mount=document.getElementById('avatar-upload-controls')||document.getElementById('m-avatar-controls');
    if(!mount||!window.API)return;
    const open=node('button','Đổi avatar','avatar-open');open.type='button';
    const feedback=node('p','','avatar-feedback');feedback.setAttribute('role','status');
    mount.append(open,feedback);
    const dialog=node('dialog','','avatar-dialog');dialog.setAttribute('aria-labelledby','avatar-dialog-title');
    const heading=node('div','','avatar-dialog-heading'),title=node('h2','Đổi ảnh đại diện');title.id='avatar-dialog-title';
    const close=node('button','Đóng','avatar-close');close.type='button';heading.append(title,close);
    const note=node('p','Chọn chibi hoặc tải JPG, PNG, WebP tĩnh. Tối đa 5 MB và 20 megapixel.','avatar-note');
    const presets=node('div','','avatar-presets');presets.setAttribute('role','group');presets.setAttribute('aria-label','Chọn avatar chibi');
    const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.id='avatar-file-input';
    const fileLabel=node('label','Chọn ảnh từ thiết bị','avatar-file-label');fileLabel.htmlFor=file.id;
    const editor=node('div','','avatar-editor');editor.hidden=true;
    const canvas=node('canvas');canvas.width=512;canvas.height=512;canvas.setAttribute('aria-label','Xem trước vùng ảnh vuông');
    const sliders={};
    for(const [key,text,min,max,value]of [['zoom','Phóng ảnh',1,3,1],['x','Vị trí ngang',0,100,50],['y','Vị trí dọc',0,100,50]]){
      const label=node('label',text),input=node('input');input.type='range';input.min=min;input.max=max;input.step=key==='zoom'?.01:1;input.value=value;input.setAttribute('aria-label',text);label.append(input);sliders[key]=input;editor.append(label);
    }
    editor.prepend(canvas);
    const preview=node('img','','avatar-preset-preview');preview.alt='Avatar chibi đang chọn';preview.hidden=true;
    const error=node('p','','avatar-error');error.setAttribute('role','status');
    const actions=node('div','','avatar-dialog-actions'),cancel=node('button','Hủy'),save=node('button','Lưu avatar','avatar-save');cancel.type=save.type='button';save.disabled=true;actions.append(cancel,save);
    dialog.append(heading,note,presets,fileLabel,file,preview,editor,error,actions);document.body.append(dialog);
    let source=null,selected=null,image=null,objectUrl=null,busy=false,sequence=0,returnFocus=null;
    const tell=text=>{error.textContent=text;};
    const lock=value=>{busy=value;dialog.setAttribute('aria-busy',String(value));dialog.querySelectorAll('button,input').forEach(el=>el.disabled=value);save.disabled=value||(!source&&!selected);};
    function cleanup(){sequence++;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;image=null;source=null;selected=null;file.value='';editor.hidden=preview.hidden=true;save.disabled=true;presets.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed','false'));}
    function dismiss(){if(busy)return;cleanup();dialog.close();returnFocus?.focus({preventScroll:true});}
    function crop(){const side=Math.min(image.naturalWidth,image.naturalHeight)/Number(sliders.zoom.value);return{left:(image.naturalWidth-side)*Number(sliders.x.value)/100/image.naturalWidth,top:(image.naturalHeight-side)*Number(sliders.y.value)/100/image.naturalHeight,width:side/image.naturalWidth,height:side/image.naturalHeight};}
    function draw(){if(!image)return;const c=crop(),ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,512);ctx.drawImage(image,c.left*image.naturalWidth,c.top*image.naturalHeight,c.width*image.naturalWidth,c.height*image.naturalHeight,0,0,512,512);}
    Object.values(sliders).forEach(input=>input.addEventListener('input',draw));
    close.addEventListener('click',dismiss);cancel.addEventListener('click',dismiss);
    dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dismiss();}});
    async function show(){
      if(busy||dialog.open)return;
      returnFocus=document.activeElement;cleanup();tell('Đang tải avatar...');dialog.showModal();
      const request=sequence;
      try{
        const result=await API.getAvatarOptions();if(request!==sequence||!dialog.open)return;
        if(!result.status||!Array.isArray(result.data))throw Error(result.message||'Không thể tải bộ avatar');
        presets.replaceChildren();
        result.data.forEach((url,index)=>{
          if(!/^\/images\/avatars\/vietnam-(boy|girl)-v1\.webp$/.test(url))return;
          const button=node('button');button.type='button';button.setAttribute('aria-label',url.includes('vietnam-girl-')?'Chọn avatar nữ':'Chọn avatar nam');button.setAttribute('aria-pressed','false');
          const img=node('img');img.src=url;img.alt='';img.width=96;img.height=96;button.append(img);
          button.addEventListener('click',()=>{cleanup();selected=url;preview.src=url;preview.hidden=false;tell('Bản xem trước, chưa lưu.');button.setAttribute('aria-pressed','true');save.disabled=false;});presets.append(button);
        });tell('');
      }catch(e){if(request===sequence&&dialog.open)tell(e.message||'Không thể tải avatar. Bạn vẫn có thể chọn ảnh từ thiết bị.');}
    }
    open.addEventListener('click',show);document.getElementById('btn-change-avatar')?.addEventListener('click',show);
    file.addEventListener('change',async()=>{
      const candidate=file.files?.[0];if(!candidate)return;
      cleanup();const request=sequence;
      if(!['image/jpeg','image/png','image/webp'].includes(candidate.type)){tell('Chỉ nhận ảnh JPG, PNG hoặc WebP.');return;}
      if(candidate.size>LIMIT){tell('Ảnh vượt quá 5 MB.');return;}
      objectUrl=URL.createObjectURL(candidate);const candidateUrl=objectUrl;const decoded=new Image();
      try{
        decoded.src=candidateUrl;await decoded.decode();if(request!==sequence||!dialog.open)return;
        if(decoded.naturalWidth<32||decoded.naturalHeight<32||decoded.naturalWidth*decoded.naturalHeight>PIXELS)throw Error('Ảnh cần ít nhất 32px mỗi chiều và không vượt quá 20 megapixel.');
        source=candidate;image=decoded;sliders.zoom.value=1;sliders.x.value=sliders.y.value=50;editor.hidden=false;draw();save.disabled=false;tell('Chỉnh vùng ảnh vuông rồi bấm Lưu avatar.');
      }catch(e){if(request===sequence){cleanup();tell(e.message||'Không thể đọc ảnh.');}}
    });
    save.addEventListener('click',async()=>{
      if(busy||(!source&&!selected))return;
      lock(true);tell('Đang xử lý và lưu ảnh...');
      try{
        const result=source?await API.uploadAvatar(source,crop()):await API.chooseAvatar(selected);
        if(!result.status||!result.data?.avatar)throw Error(result.message||'Không thể lưu avatar.');
        const user=result.data;
        for(const id of ['profile-avatar-img','nav-user-avatar','userAvatar','m-header-avatar']){const img=document.getElementById(id);if(img?.tagName==='IMG'){img.src=user.avatar;img.hidden=false;}}
        window.dispatchEvent(new CustomEvent('cineviet:profile-updated',{detail:user}));
        feedback.textContent='Đã cập nhật avatar.';lock(false);dismiss();
      }catch(e){tell(e.message||'Không thể kết nối. Avatar cũ được giữ nguyên.');lock(false);}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
