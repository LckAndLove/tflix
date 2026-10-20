// Own external subtitle selection, native-track loading and rendering. Timing
// offsets are applied to cue lookup without frame-rate guesses or remote state.
(function () {
  'use strict';
  if(location.hostname!=='cinesrc.st' || !window.__TFLIX_SUBTITLES__ || window.__TFLIX_SUBTITLE_CONTROLLER__) return;
  window.__TFLIX_SUBTITLE_CONTROLLER__=true;
  const transport=window.__TFLIX_SUBTITLES__;
  const zh=(navigator.language||'').startsWith('zh');
  const words=zh?{
    title:'字幕',off:'关闭字幕',native:'片源内置',external:'外挂字幕',unknown:'版本未验证',loading:'正在查找字幕…',
    ready:'字幕已开启',empty:'没有找到可用字幕',blocked:'已排除分盘字幕',
    hint:'选择字幕轨道',close:'关闭',language:'字幕语言',sync:'字幕同步',syncHint:'正值延后，负值提前',aligned:'同步（0.0 秒）',advanceLabel:'提前 10 秒',delayLabel:'延后 10 秒',advanceBy:'提前字幕',delayBy:'延后字幕',seconds:'秒',advance:'字幕提前 0.1 秒',delay:'字幕延后 0.1 秒',reset:'重置',error:'字幕加载失败，请重选。'
  }:{title:'Subtitles',off:'Off',native:'Source',external:'External',unknown:'Edition unverified',loading:'Finding subtitles…',
    ready:'Subtitles on',empty:'No subtitles found',blocked:'Split-disc subtitles excluded',
    hint:'Choose a subtitle track',close:'Close',language:'Language',sync:'Subtitle sync',syncHint:'Positive delays · negative advances',aligned:'In sync (0.0 s)',advanceLabel:'Advance 10 s',delayLabel:'Delay 10 s',advanceBy:'Advance subtitles',delayBy:'Delay subtitles',seconds:'s',advance:'Advance subtitles 0.1 seconds',delay:'Delay subtitles 0.1 seconds',reset:'Reset',error:'Subtitle failed. Choose another.'};
  let video,controller,panel,caption,status,catalogStatus,list,languages,syncInput,syncSlider,syncReadout,syncAdvance,syncDelay,syncReset,returnFocus,selectedTrack=null;
  let subtitleOffset=0;
  let sourceSerial=0,lastSource='',catalogRequest=null,catalogSerial=0,activeState={state:'off'};
  let preferred;
  try {preferred=localStorage.getItem('tflix_subtitle_language');} catch {}
  preferred=preferred||((navigator.language||'en').split('-')[0]);
  const session=window.createTflixSubtitleSession({download:transport.download,prepare,onState:state=>{
    activeState=state;
    window.__TFLIX_SUBTITLE_STATE__=Object.freeze({...state});
    if(state.state==='off') {selectedTrack=null;subtitleOffset=0;render();}
    if(status) status.textContent=stateText();
    updateSyncControls();
  }});
  function stateText() {return activeState.state==='loading'?words.loading:activeState.state==='ready'?words.ready:activeState.state==='error'?words.error:words.hint;}
  function remember(language) {preferred=language;try{localStorage.setItem('tflix_subtitle_language',language);}catch{}}
  function render() {
    if(!caption) return;
    // During an HLS seek WebKit may retain the previous activeCues until
    // decoded media catches up. Never display that old line at the new time.
    const cues=video && !video.seeking && video.readyState>=2 ? selectedTrack?.cues : null;
    const subtitleTime=video ? video.currentTime-subtitleOffset : 0;
    caption.textContent=cues ? Array.from(cues).filter(cue=>cue.startTime<=subtitleTime && subtitleTime<cue.endTime).map(cue=>cue.getCueAsHTML?.().textContent||cue.text).join('\n') : '';
    caption.hidden=!caption.textContent;
  }
  function selectTrack(track) {
    selectedTrack=track;
    for(const other of video.textTracks) if(other!==track && other.mode!=='disabled') other.mode='disabled';
    if(track && track.mode!=='hidden') track.mode='hidden';
    restoreSubtitleOffset();
    render();
  }
  function subtitleOffsetKey() {
    if(!selectedTrack)return null;
    const trackId=activeState.id||selectedTrack.id||selectedTrack.label||selectedTrack.language||'track';
    return `tflix_subtitle_offset_v1:${location.host}:${location.pathname}${location.search}:${trackId}`;
  }
  function updateSyncControls() {
    if(!syncInput)return;
    syncInput.value=subtitleOffset.toFixed(1);
    syncSlider.value=String(Math.max(-10,Math.min(10,subtitleOffset)));
    syncReadout.textContent=subtitleOffset===0?words.aligned:`${subtitleOffset>0?words.delayBy:words.advanceBy} ${Math.abs(subtitleOffset).toFixed(1)} ${words.seconds}`;
    for(const control of [syncInput,syncAdvance,syncDelay,syncReset]) if(control)control.disabled=!selectedTrack;
    if(syncSlider)syncSlider.disabled=!selectedTrack;
    if(syncReset)syncReset.disabled=!selectedTrack||subtitleOffset===0;
  }
  function restoreSubtitleOffset() {
    const key=subtitleOffsetKey();subtitleOffset=0;
    if(key)try{const saved=Number(localStorage.getItem(key));if(Number.isFinite(saved))subtitleOffset=Math.max(-600,Math.min(600,saved));}catch{}
    updateSyncControls();
  }
  function setSubtitleOffset(value) {
    if(!selectedTrack)return;
    const next=Number(value);if(!Number.isFinite(next))return;
    subtitleOffset=Math.round(Math.max(-600,Math.min(600,next))*10)/10;
    const key=subtitleOffsetKey();if(key)try{localStorage.setItem(key,String(subtitleOffset));}catch{}
    updateSyncControls();render();
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
  function choice(label,id,selected,onChoose) {
    const button=element('button',label,'tflix-subtitle-option');button.type='button';
    button.setAttribute('aria-pressed',String(selected));
    if(selected) button.dataset.selected='true';
    button.onclick=onChoose;
    return button;
  }
  async function loadCatalog() {
    catalogRequest?.abort();catalogRequest=new AbortController();
    const ticket=++catalogSerial,signal=catalogRequest.signal;
    list.replaceChildren();status.textContent=stateText();catalogStatus.textContent=words.loading;
    list.appendChild(choice(words.off,'off',!selectedTrack,()=>{session.stop();selectTrack(null);remember('off');closePanel();}));
    for(const track of nativeTracks()) {
      const button=choice(`${words.native} · ${track.label||track.language}`,track.label||track.language,selectedTrack===track,()=>{chooseNative(track);closePanel();});
      list.appendChild(button);
    }
    try {
      const candidates=await transport.catalog(languages.value,signal);
      if(signal.aborted || ticket!==catalogSerial) return;
      const available=candidates.filter(x=>!x.excluded);
      catalogStatus.textContent=available.length?words.external:words.empty;
      if(candidates.some(x=>x.excluded)) list.appendChild(element('p',words.blocked));
      for(const candidate of available) {
        const name=candidate.fileName||candidate.release||candidate.display||String(candidate.id);
        const button=choice(`${name}\n${candidate.matchState==='source-track'?words.native:words.unknown}`,candidate.id,activeState.state==='ready' && String(activeState.id)===String(candidate.id),()=>{session.select(candidate);closePanel();});
        list.appendChild(button);
      }
    } catch(error) {if(!signal.aborted && ticket===catalogSerial) catalogStatus.textContent=words.error;}
  }
  function buildUi() {
    if(!controller || panel) return;
    const style=element('style');
    style.textContent=`
      .tflix-caption {position:absolute;left:5%;right:5%;bottom:var(--tflix-caption-bottom,3.5%);z-index:45;text-align:center;white-space:pre-line;pointer-events:none;color:white;font:600 clamp(16px,2vw,28px)/1.4 Arial,sans-serif;text-shadow:0 2px 3px black,0 0 5px black;}
      .tflix-subtitle-panel {box-sizing:border-box;position:absolute;z-index:100;right:20px;bottom:72px;display:flex;flex-direction:column;width:min(320px,calc(100% - 32px));height:auto!important;max-height:calc(100% - 96px);overflow:hidden;background:rgba(24,24,24,.98);color:#eee;border:1px solid #444;border-radius:4px;padding:14px;font:14px/1.45 Arial,sans-serif;pointer-events:auto;box-shadow:0 8px 28px rgba(0,0,0,.55);}
      .tflix-subtitle-panel[hidden],.tflix-caption[hidden] {display:none!important;}
      .tflix-subtitle-heading {display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
      .tflix-subtitle-panel h2 {font-size:16px;font-weight:700;margin:0;}
      .tflix-subtitle-panel .tflix-subtitle-close {width:30px;min-height:30px;padding:0;margin:0;border:0;background:transparent;text-align:center;font-size:22px;line-height:1;color:#bbb;}
      .tflix-subtitle-language {display:flex;align-items:center;gap:10px;margin-bottom:8px;color:#bbb;font-size:12px;}
      .tflix-subtitle-panel select {flex:1;min-width:0;min-height:34px;padding:5px 8px;margin:0;background:#292929;border:1px solid #555;border-radius:3px;color:#eee;font:inherit;cursor:pointer;}
      .tflix-subtitle-sync {margin:10px 0;padding:9px 0;border-top:1px solid #3c3c3c;border-bottom:1px solid #3c3c3c;}
      .tflix-subtitle-sync-label {display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;color:#bbb;font-size:12px;}
      .tflix-subtitle-sync-readout {color:#eee;font-weight:600;}
      .tflix-subtitle-sync-range {display:flex;align-items:center;gap:7px;color:#999;font-size:10px;}
      .tflix-subtitle-sync-range input {flex:1;min-width:0;margin:0;accent-color:#e50914;cursor:pointer;}
      .tflix-subtitle-sync-controls {display:flex;align-items:center;gap:5px;}
      .tflix-subtitle-panel .tflix-subtitle-sync-controls button,.tflix-subtitle-panel .tflix-subtitle-sync-controls input {box-sizing:border-box;min-width:0;min-height:32px;margin:0;padding:5px 7px;border:1px solid #555;border-radius:3px;background:#292929;color:#eee;font:inherit;text-align:center;}
      .tflix-subtitle-panel .tflix-subtitle-sync-controls button {cursor:pointer;white-space:nowrap;}
      .tflix-subtitle-panel .tflix-subtitle-sync-controls input {width:64px;}
      .tflix-subtitle-panel .tflix-subtitle-sync-controls button:last-child {margin-left:auto;}
      .tflix-subtitle-panel button:disabled,.tflix-subtitle-panel input:disabled {opacity:.45;cursor:default;}
      .tflix-subtitle-status,.tflix-subtitle-catalog-status {margin:7px 0;color:#aaa;font-size:12px;}
      .tflix-subtitle-options {flex:1 1 auto;min-height:40px;max-height:min(260px,34vh);overflow-y:auto;scrollbar-width:none;}
      .tflix-subtitle-options::-webkit-scrollbar {display:none;}
      .tflix-subtitle-panel .tflix-subtitle-option {box-sizing:border-box;display:block;width:100%;min-height:38px;padding:8px 10px;margin:2px 0;background:transparent;border:0;border-radius:3px;color:#eee;white-space:pre-line;text-align:left;font:inherit;cursor:pointer;}
      .tflix-subtitle-panel .tflix-subtitle-option:hover,.tflix-subtitle-panel .tflix-subtitle-option[data-selected="true"] {background:#333;}
      .tflix-subtitle-panel .tflix-subtitle-option[data-selected="true"] {box-shadow:inset 3px 0 #e50914;font-weight:600;}
      .tflix-subtitle-panel button:focus-visible,.tflix-subtitle-panel select:focus-visible,.tflix-subtitle-panel input:focus-visible {outline:2px solid white;outline-offset:1px;}
      .tflix-subtitle-panel p {color:#aaa;font-size:11px;}
      media-controller div[noautohide][style*="--subtitle-overlay-bottom"] {display:none!important;}
    `;
    controller.appendChild(style);
    caption=element('div','','tflix-caption');caption.hidden=true;controller.appendChild(caption);
    panel=element('section','','tflix-subtitle-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',words.title);
    const heading=element('div','','tflix-subtitle-heading');heading.appendChild(element('h2',words.title));
    const close=element('button','×','tflix-subtitle-close');close.type='button';close.setAttribute('aria-label',words.close);close.onclick=closePanel;heading.appendChild(close);panel.appendChild(heading);
    const languageRow=element('label','','tflix-subtitle-language');languageRow.appendChild(element('span',words.language));
    languages=element('select');languages.setAttribute('aria-label',zh?'字幕语言':'Subtitle language');
    for(const [code,name] of [['zh','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['es','Español'],['de','Deutsch'],['ar','العربية'],['pt','Português'],['ru','Русский']]) {
      const option=element('option',name);option.value=code;languages.appendChild(option);
    }
    languages.value=preferred==='off'?'en':preferred;if(!languages.value)languages.value='en';
    languages.onchange=()=>{session.stop();selectTrack(null);loadCatalog();};languageRow.appendChild(languages);panel.appendChild(languageRow);
    const sync=element('div','','tflix-subtitle-sync');
    const syncLabel=element('div','','tflix-subtitle-sync-label');syncLabel.append(element('span',words.sync),element('span',words.syncHint));sync.appendChild(syncLabel);
    const syncRange=element('label','','tflix-subtitle-sync-range');syncRange.appendChild(element('span',words.advanceLabel));
    syncSlider=element('input');syncSlider.type='range';syncSlider.min='-10';syncSlider.max='10';syncSlider.step='0.1';syncSlider.value='0';syncSlider.setAttribute('aria-label',words.sync);syncSlider.oninput=()=>setSubtitleOffset(syncSlider.value);
    syncRange.append(syncSlider,element('span',words.delayLabel));sync.appendChild(syncRange);
    syncReadout=element('div','','tflix-subtitle-sync-label tflix-subtitle-sync-readout');syncReadout.textContent=words.aligned;sync.appendChild(syncReadout);
    const syncControls=element('div','','tflix-subtitle-sync-controls');
    syncAdvance=element('button','−0.1');syncAdvance.type='button';syncAdvance.setAttribute('aria-label',words.advance);syncAdvance.onclick=()=>setSubtitleOffset(subtitleOffset-0.1);
    syncInput=element('input');syncInput.type='number';syncInput.min='-600';syncInput.max='600';syncInput.step='0.1';syncInput.value='0.0';syncInput.setAttribute('aria-label',words.sync);syncInput.onchange=()=>setSubtitleOffset(syncInput.value);
    syncDelay=element('button','+0.1');syncDelay.type='button';syncDelay.setAttribute('aria-label',words.delay);syncDelay.onclick=()=>setSubtitleOffset(subtitleOffset+0.1);
    syncReset=element('button',words.reset);syncReset.type='button';syncReset.onclick=()=>setSubtitleOffset(0);
    syncControls.append(syncAdvance,syncInput,syncDelay,syncReset);sync.appendChild(syncControls);panel.appendChild(sync);updateSyncControls();
    status=element('p',stateText(),'tflix-subtitle-status');status.setAttribute('role','status');panel.appendChild(status);
    catalogStatus=element('p','','tflix-subtitle-catalog-status');panel.appendChild(catalogStatus);
    list=element('div','','tflix-subtitle-options');panel.appendChild(list);controller.appendChild(panel);
    panel.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();closePanel();return;}
      const controls=Array.from(panel.querySelectorAll('button,select,input[type="number"],input[type="range"]')).filter(x=>!x.disabled);
      const index=controls.indexOf(document.activeElement);
      if(event.key==='Tab') {
        if(event.shiftKey && index===0){event.preventDefault();controls.at(-1)?.focus();}
        else if(!event.shiftKey && index===controls.length-1){event.preventDefault();controls[0]?.focus();}
      } else if(['ArrowDown','ArrowUp'].includes(event.key) && !['SELECT','INPUT'].includes(event.target.tagName)) {
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
    returnFocus=button;panel.hidden=false;loadCatalog();panel.querySelector('.tflix-subtitle-close').focus();
  },true);
  new MutationObserver(scan).observe(document,{childList:true,subtree:true});
  scan();
})();
