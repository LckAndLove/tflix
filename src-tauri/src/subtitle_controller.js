// Own external subtitle selection, native-track loading and rendering. No
// timing offsets, frame-rate guesses or remote React state are involved.
(function () {
  'use strict';
  if(location.hostname!=='cinesrc.st' || !window.__TFLIX_SUBTITLES__ || window.__TFLIX_SUBTITLE_CONTROLLER__) return;
  window.__TFLIX_SUBTITLE_CONTROLLER__=true;
  const transport=window.__TFLIX_SUBTITLES__;
  const zh=(navigator.language||'').startsWith('zh');
  const words=zh?{
    title:'字幕',off:'关闭字幕',native:'片源内置',external:'外挂字幕',unknown:'版本未验证',loading:'正在加载字幕…',
    ready:'字幕已加载 · 发行版本未验证',empty:'没有可选的完整字幕文件；视频画面可能已自带字幕',blocked:'已排除分盘字幕；不会自动拼接或平移。',
    hint:'优先使用片源内置字幕。外挂须匹配当前发行版；画面内嵌的字幕无法关闭。',close:'关闭',error:'字幕加载失败，可重选其他文件。'
  }:{title:'Subtitles',off:'Off',native:'Source track',external:'External subtitles',unknown:'Edition unverified',loading:'Loading subtitles…',
    ready:'Loaded · video edition unverified',empty:'No complete subtitle files available. The video may have burned-in captions.',blocked:'Split-disc subtitles excluded; no automatic merging or shifting.',
    hint:'Prefer source tracks. External files must match this edition. Burned-in captions cannot be disabled.',close:'Close',error:'Subtitle load failed. Choose another file.'};
  let video,controller,panel,caption,status,catalogStatus,list,languages,returnFocus,selectedTrack=null;
  let sourceSerial=0,lastSource='',catalogRequest=null,catalogSerial=0,activeState={state:'off'};
  let preferred;
  try {preferred=localStorage.getItem('tflix_subtitle_language');} catch {}
  preferred=preferred||((navigator.language||'en').split('-')[0]);
  const session=window.createTflixSubtitleSession({download:transport.download,prepare,onState:state=>{
    activeState=state;
    window.__TFLIX_SUBTITLE_STATE__=Object.freeze({...state});
    if(state.state==='off') {selectedTrack=null;render();}
    if(status) status.textContent=stateText();
  }});
  function stateText() {return activeState.state==='loading'?words.loading:activeState.state==='ready'?(activeState.matchState==='source-track'?words.native:words.ready):activeState.state==='error'?`${words.error} ${activeState.message||''}`:words.hint;}
  function remember(language) {preferred=language;try{localStorage.setItem('tflix_subtitle_language',language);}catch{}}
  function render() {
    if(!caption) return;
    // During an HLS seek WebKit may retain the previous activeCues until
    // decoded media catches up. Never display that old line at the new time.
    const cues=video && !video.seeking && video.readyState>=2 ? selectedTrack?.activeCues : null;
    caption.textContent=cues ? Array.from(cues).filter(cue=>cue.startTime<=video.currentTime && video.currentTime<cue.endTime).map(cue=>cue.getCueAsHTML?.().textContent||cue.text).join('\n') : '';
    caption.hidden=!caption.textContent;
  }
  function selectTrack(track) {
    selectedTrack=track;
    for(const other of video.textTracks) if(other!==track && other.mode!=='disabled') other.mode='disabled';
    if(track && track.mode!=='hidden') track.mode='hidden';
    render();
  }
  async function prepare(file,signal) {
    if(!video || signal.aborted) throw Error('Video changed');
    const owner=video,track=document.createElement('track');
    const url=URL.createObjectURL(new Blob([file.text],{type:'text/vtt;charset=utf-8'}));
    track.dataset.tflixSubtitle='true';track.kind='subtitles';track.label='TFLIX';track.srclang=languages?.value||preferred;track.src=url;
    let disposed=false;
    const dispose=()=>{
      if(disposed) return;disposed=true;
      if(selectedTrack===track.track) {selectedTrack=null;render();}
      track.track?.removeEventListener('cuechange',render);
      track.remove();URL.revokeObjectURL(url);
    };
    await new Promise((resolve,reject)=>{
      const finish=(error)=>{
        clearTimeout(timer);signal.removeEventListener('abort',abort);
        track.removeEventListener('load',loaded);track.removeEventListener('error',failed);
        if(error){dispose();reject(error);}else resolve();
      };
      const abort=()=>finish(Error('Subtitle selection cancelled'));
      const loaded=()=>track.track.cues?.length ? finish() : finish(Error('No timed cues'));
      const failed=()=>finish(Error('Native subtitle parser rejected the file'));
      const timer=setTimeout(()=>finish(Error('Subtitle load timed out')),15000);
      track.addEventListener('load',loaded,{once:true});track.addEventListener('error',failed,{once:true});
      signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted){abort();return;}
      owner.appendChild(track);track.track.mode='hidden';
    });
    return {dispose,activate(){
      if(signal.aborted || owner!==video) {dispose();return;}
      // Native parsing completed before activation. The upstream renderer cannot
      // apply a stale offset: its external catalog is not used for this track.
      track.track.addEventListener('cuechange',render);selectTrack(track.track);
      remember(track.srclang);render();
    }};
  }
  function element(tag,text,className) {
    const el=document.createElement(tag);if(text) el.textContent=text;if(className) el.className=className;return el;
  }
  function nativeTracks() {
    if(!video) return [];
    const external=new Set(Array.from(video.querySelectorAll('track[data-custom-subtitle],track[data-tflix-subtitle]'),x=>x.track));
    return Array.from(video.textTracks).filter(t=>['subtitles','captions'].includes(t.kind) && !external.has(t));
  }
  function chooseNative(track) {
    if(selectedTrack)selectedTrack.removeEventListener('cuechange',render);
    session.stop();selectTrack(track);track.addEventListener('cuechange',render);
    if(status) status.textContent=words.native;remember(track.language||'en');
    activeState={state:'ready',matchState:'source-track',sourceKey:`source-${sourceSerial}`};
    window.__TFLIX_SUBTITLE_STATE__=Object.freeze({...activeState});
  }
  function closePanel() {if(!panel)return;panel.hidden=true;returnFocus?.focus();}
  async function loadCatalog() {
    catalogRequest?.abort();catalogRequest=new AbortController();
    const ticket=++catalogSerial,signal=catalogRequest.signal;
    list.replaceChildren();status.textContent=stateText();catalogStatus.textContent=words.loading;
    for(const track of nativeTracks()) {
      const button=element('button',`${words.native} · ${track.label||track.language}`);
      button.type='button';button.onclick=()=>{chooseNative(track);closePanel();};list.appendChild(button);
    }
    try {
      const candidates=await transport.catalog(languages.value,signal);
      if(signal.aborted || ticket!==catalogSerial) return;
      const available=candidates.filter(x=>!x.excluded);
      catalogStatus.textContent=available.length?words.external:words.empty;
      if(candidates.some(x=>x.excluded)) list.appendChild(element('p',words.blocked));
      for(const candidate of available) {
        const name=candidate.fileName||candidate.release||candidate.display||String(candidate.id);
        const button=element('button',`${name}\n${candidate.matchState==='source-track'?words.native:words.unknown}`);button.type='button';
        button.onclick=()=>{session.select(candidate);closePanel();};list.appendChild(button);
      }
    } catch(error) {if(!signal.aborted && ticket===catalogSerial) catalogStatus.textContent=words.error;}
  }
  function buildUi() {
    if(!controller || panel) return;
    const style=element('style');
    style.textContent=`
      .tflix-caption {position:absolute;left:5%;right:5%;bottom:var(--tflix-caption-bottom,3.5%);z-index:45;text-align:center;white-space:pre-line;pointer-events:none;color:white;font:600 clamp(16px,2vw,28px)/1.4 Arial,sans-serif;text-shadow:0 2px 3px black,0 0 5px black;}
      .tflix-subtitle-panel {position:absolute;z-index:100;right:24px;bottom:100px;width:min(440px,calc(100% - 48px));height:auto!important;max-height:calc(100% - 130px);overflow:auto;background:#181818;color:#eee;border:1px solid #555;border-radius:5px;padding:20px;font:14px/1.6 Arial,sans-serif;pointer-events:auto;}
      .tflix-subtitle-panel[hidden],.tflix-caption[hidden] {display:none!important;}
      .tflix-subtitle-panel h2 {font-size:20px;margin:0 0 12px;}
      .tflix-subtitle-panel button,.tflix-subtitle-panel select {display:block;width:100%;min-height:40px;padding:8px;margin:8px 0;background:#292929;border:1px solid #555;border-radius:3px;color:#eee;white-space:pre-line;text-align:left;font:inherit;cursor:pointer;}
      .tflix-subtitle-panel button:focus-visible {outline:2px solid white;}
      .tflix-subtitle-panel p {color:#bbb;font-size:12px;}
      media-controller div[noautohide][style*="--subtitle-overlay-bottom"] {display:none!important;}
    `;
    controller.appendChild(style);
    caption=element('div','','tflix-caption');caption.hidden=true;controller.appendChild(caption);
    panel=element('section','','tflix-subtitle-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',words.title);
    panel.appendChild(element('h2',words.title));
    const close=element('button',words.close);close.type='button';close.onclick=closePanel;panel.appendChild(close);
    const off=element('button',words.off);off.type='button';off.onclick=()=>{session.stop();selectTrack(null);remember('off');closePanel();};panel.appendChild(off);
    languages=element('select');languages.setAttribute('aria-label',zh?'字幕语言':'Subtitle language');
    for(const [code,name] of [['zh','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['es','Español'],['de','Deutsch'],['ar','العربية'],['pt','Português'],['ru','Русский']]) {
      const option=element('option',name);option.value=code;languages.appendChild(option);
    }
    languages.value=preferred==='off'?'en':preferred;if(!languages.value)languages.value='en';
    languages.onchange=()=>{session.stop();selectTrack(null);loadCatalog();};panel.appendChild(languages);
    status=element('p',stateText());status.setAttribute('role','status');panel.appendChild(status);
    catalogStatus=element('p');panel.appendChild(catalogStatus);
    list=element('div');panel.appendChild(list);controller.appendChild(panel);
    panel.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();closePanel();return;}
      const controls=Array.from(panel.querySelectorAll('button,select')).filter(x=>!x.disabled);
      const index=controls.indexOf(document.activeElement);
      if(event.key==='Tab') {
        if(event.shiftKey && index===0){event.preventDefault();controls.at(-1)?.focus();}
        else if(!event.shiftKey && index===controls.length-1){event.preventDefault();controls[0]?.focus();}
      } else if(['ArrowDown','ArrowUp'].includes(event.key) && event.target.tagName!=='SELECT') {
        event.preventDefault();controls[Math.max(0,Math.min(controls.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();
      }
    });
  }
  function sourceChanged() {
    const source=video?.currentSrc||video?.src||'';
    if(source===lastSource) return;
    lastSource=source;sourceSerial++;
    catalogSerial++;catalogRequest?.abort();session.reset(`source-${sourceSerial}`);
    selectTrack(null);if(panel)panel.hidden=true;
    if(preferred!=='off') {const native=nativeTracks().find(t=>(t.language||'').toLowerCase().split(/[-_]/)[0]===preferred.toLowerCase().split(/[-_]/)[0]);if(native)chooseNative(native);}
  }
  function scan() {
    const next=document.querySelector('media-controller'),media=next?.querySelector('video');
    if(next!==controller || media!==video) {
      session.reset(`source-${++sourceSerial}`);catalogSerial++;catalogRequest?.abort();
      panel?.remove();caption?.remove();panel=null;caption=null;
      controller=next;video=media;lastSource='';
      if(video) {
        const owner=video;
        for(const event of ['seeking','seeked','timeupdate'])video.addEventListener(event,()=>{if(video===owner)render();});
        video.addEventListener('loadedmetadata',()=>{if(video===owner)sourceChanged();});
        video.addEventListener('emptied',()=>{if(video===owner){lastSource='';catalogSerial++;catalogRequest?.abort();session.reset(`source-${++sourceSerial}`);selectTrack(null);if(panel)panel.hidden=true;}});
        video.textTracks.addEventListener('change',()=>{if(video===owner && selectedTrack) selectTrack(selectedTrack);});
        video.textTracks.addEventListener('addtrack',()=>{
          if(video!==owner || preferred==='off' || activeState.state!=='off' || selectedTrack) return;
          const native=nativeTracks().find(t=>(t.language||'').toLowerCase().split(/[-_]/)[0]===preferred.toLowerCase().split(/[-_]/)[0]);
          if(native) chooseNative(native);
        });
      }
      buildUi();sourceChanged();
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button[aria-label="Subtitle settings"]');
    if(!button) return;
    event.preventDefault();event.stopImmediatePropagation();scan();if(!panel)return;
    returnFocus=button;panel.hidden=false;loadCatalog();panel.querySelector('button').focus();
  },true);
  new MutationObserver(scan).observe(document,{childList:true,subtree:true});
  scan();
})();
