// Source page is a top-level document. TFLIX's controls live in an isolated
// shadow root and never replace the provider's video or extract media URLs.
(function () {
  'use strict';
  const config=window.__TFLIX_DIRECT_PLAYER__;
  if(window.top!==window.self || !config)return;
  let model=config.request.model||{},root,host,panel='',idle=null,playing=false,synchronized=false;
  let frameSerial=0,lastReady=null,channel=Promise.resolve();
  const frameIds=new Map(),frameNumbers=new WeakMap();
  const escapeIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 6-6 6 6 6"/></svg>';
  function send(payload){channel=channel.catch(()=>{}).then(()=>window.__TAURI__.core.invoke('native_player_event',{payload})).catch(()=>{});}
  function currentFrame(source){
    const pending=[window],visited=new Set();
    while(pending.length){const frame=pending.pop();if(frame===source)return true;if(!frame||visited.has(frame))continue;visited.add(frame);try{for(let i=0;i<frame.frames.length;i++)pending.push(frame.frames[i]);}catch{}}
    return false;
  }
  window.__TFLIX_NATIVE_SEND__=({frameId,command})=>{
    const frame=frameIds.get(frameId);
    if(frame && currentFrame(frame) && command?.type==='tflix:resume')frame.postMessage(command,'*');
  };
  window.addEventListener('message',event=>{
    if(!currentFrame(event.source))return;
    const data=event.data;
    if(data?.type==='cinesrc:nextepisode' && event.source===window && location.hostname==='cinesrc.st') {
      send({action:'provider-episode',season:data.season,episode:data.episode});return;
    }
    if(!['tflix:media-ready','tflix:media-playing','tflix:media-paused','tflix:media-progress','tflix:media-resumed','tflix:interaction'].includes(data?.type))return;
    if(data.type==='tflix:media-playing')playing=true;
    if(data.type==='tflix:media-paused')playing=false;
    if(['tflix:interaction','tflix:media-playing','tflix:media-paused'].includes(data.type))reveal();
    if(!frameNumbers.has(event.source)){frameNumbers.set(event.source,++frameSerial);frameIds.set(frameSerial,event.source);}
    const report={type:data.type,frameId:frameNumbers.get(event.source),currentTime:data.currentTime,duration:data.duration,ended:!!data.ended,mediaType:data.mediaType,mediaId:data.mediaId,season:data.season,episode:data.episode};
    if(data.type==='tflix:media-ready')lastReady=report;
    send(report);
  });
  function word(zh,en){return model.language==='zh'?zh:en;}
  function action(name,detail={}){send({action:name,...detail});}
  function button(label,click){const el=document.createElement('button');el.type='button';el.textContent=label;el.addEventListener('click',click);return el;}
  function close(){const trigger=panel==='sources'?root.querySelector('#source'):root.querySelector('#episodes');panel='';renderPanels();trigger?.focus();reveal();}
  function toggle(value){panel=panel===value?'':value;renderPanels();reveal();const list=root.querySelector(panel==='sources'?'#sources-menu':'#episodes-menu');list?.querySelector('[aria-current="true"],select,button')?.focus();}
  function reveal(){
    if(!root)return;
    root.querySelector('nav').classList.remove('idle');clearTimeout(idle);
    idle=setTimeout(()=>{if(playing && !panel && !root.activeElement)root.querySelector('nav').classList.add('idle');},3500);
  }
  function renderPanels(){
    const sources=root.querySelector('#sources-menu'),episodes=root.querySelector('#episodes-menu');
    sources.hidden=panel!=='sources';episodes.hidden=panel!=='episodes';
    root.querySelector('#source').setAttribute('aria-expanded',String(panel==='sources'));
    root.querySelector('#episodes').setAttribute('aria-expanded',String(panel==='episodes'));
    if(panel==='sources'){
      sources.replaceChildren();
      for(const source of model.sources||[]){const el=button(source.name,()=>{action('source',{server:source.id});close();});el.setAttribute('aria-current',String(source.id===model.server));sources.appendChild(el);}
      const browser=button(word('在浏览器播放','Play in browser'),()=>{browser.disabled=true;action('browser');});browser.className='browser';sources.appendChild(browser);
      if(model.browserError){const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=model.browserError;sources.appendChild(error);}
    }
    if(panel==='episodes'){
      episodes.replaceChildren();
      const heading=document.createElement('div');heading.className='panel-title';heading.textContent=word('选集','Episodes');heading.appendChild(button('×',close));episodes.appendChild(heading);
      const select=document.createElement('select');select.setAttribute('aria-label',word('季','Season'));
      for(const season of model.seasons||[]){const option=document.createElement('option');option.value=season.number;option.textContent=word('季 ','Season ')+season.number;select.appendChild(option);}
      select.value=String(model.season);select.addEventListener('change',()=>action('season',{season:Number(select.value)}));episodes.appendChild(select);
      if(model.episodeStatus){const status=document.createElement('p');status.textContent=model.episodeStatus;episodes.appendChild(status);}
      if(model.retry)episodes.appendChild(button(word('重试本季','Retry season'),()=>action('season',{season:model.retrySeason||model.season})));
      for(const episode of model.episodes||[]){
        const row=button('',()=>{action('episode',{episode:episode.number});close();});row.className='episode';row.setAttribute('aria-current',String(episode.number===model.episode));
        const still=document.createElement('span');still.className='still';still.textContent=episode.number;
        if(episode.still){const image=document.createElement('img');image.src=episode.still;image.alt='';image.loading='lazy';still.appendChild(image);}
        const copy=document.createElement('span'),name=document.createElement('strong'),summary=document.createElement('span');
        name.textContent=episode.number+'. '+episode.name;summary.textContent=episode.overview;copy.append(name,summary);row.append(still,copy);episodes.appendChild(row);
      }
      const next=button(word('下一集','Next episode'),()=>{action('next');close();});next.disabled=!model.hasNext;episodes.appendChild(next);
    }
  }
  function render(){
    if(!root)return;
    const title=(model.title||'TFLIX')+(model.type==='tv'?` · S${model.season} E${model.episode}`:'');
    root.querySelector('#title').textContent=title;
    document.title=title+' — TFLIX';
    root.querySelector('#back').setAttribute('aria-label',word('返回','Back'));
    root.querySelector('#episodes').textContent=word('选集','Episodes');root.querySelector('#episodes').hidden=model.type!=='tv';
    root.querySelector('#source').textContent=(model.sources||[]).find(x=>x.id===model.server)?.name||'Ekko';
    root.querySelector('#language').textContent=model.language==='zh'?'中':'EN';
    renderPanels();reveal();
  }
  window.__TFLIX_UPDATE_PLAYER__=value=>{model=value;render();if(lastReady)send(lastReady);};
  function mount(){
    if(!document.body)return;
    document.documentElement.dataset.tflixNativePlayer='true';
    if(!host){
      host=document.createElement('div');host.id='tflix-native-controls';host.style.cssText='position:fixed;inset:0 0 auto;z-index:2147483647;pointer-events:none';
      root=host.attachShadow({mode:'closed'});
      root.innerHTML=`<style>
        :host{all:initial}*{box-sizing:border-box;-webkit-user-select:none;user-select:none}[hidden]{display:none!important}
        nav{height:76px;display:flex;align-items:center;gap:16px;padding:0 24px;background:linear-gradient(#000d,transparent);font:14px Arial,sans-serif;color:#eee;pointer-events:auto;transition:opacity .2s}nav.idle{opacity:0;pointer-events:none}button,select{font:inherit;color:inherit}button{border:0;background:transparent;padding:10px;cursor:pointer;border-radius:3px}button:hover{background:#ffffff18}button:disabled{opacity:.4;cursor:default}button:focus-visible,select:focus-visible{outline:2px solid white;outline-offset:2px}#title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#source-wrap{position:relative}#source{width:110px}#source:after{content:'⌄';margin-left:10px}
        #sources-menu,#episodes-menu{font:14px Arial,sans-serif;color:#eee;background:#181818fa;border-radius:4px;box-shadow:0 12px 40px #0008;pointer-events:auto}#sources-menu{position:absolute;right:0;top:calc(100% + 6px);width:110px;padding:6px}#sources-menu button{display:block;width:100%;text-align:left;font-size:12px}#sources-menu .browser{border-top:1px solid #ffffff20;border-radius:0;margin-top:6px;padding-top:12px}button[aria-current=true]{background:#ffffff18}
        #episodes-menu{position:fixed;right:24px;top:84px;width:min(480px,calc(100vw - 48px));max-height:calc(100vh - 108px);overflow:auto;scrollbar-width:none;padding:16px}#episodes-menu::-webkit-scrollbar{display:none}.panel-title{display:flex;align-items:center;justify-content:space-between;font-size:18px;font-weight:600}select{margin:12px 0;padding:8px;background:#292929;border:1px solid #555;border-radius:3px}p{font-size:13px;color:#aaa}.episode{display:flex;gap:14px;width:100%;padding:12px 8px;text-align:left}.still{position:relative;display:grid;place-items:center;flex:0 0 108px;aspect-ratio:16/9;background:#292929;border-radius:3px;overflow:hidden}.still img{position:absolute;width:100%;height:100%;object-fit:cover}.episode strong{display:block;font-size:14px;margin-bottom:7px}.episode span span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#aaa;font-size:12px;line-height:1.5}#episodes-menu>button:last-child{float:right}
        @media(max-width:700px){nav{padding:0 12px;gap:4px}#source{width:86px}#sources-menu{width:86px}.still{flex-basis:80px}}
        @media(prefers-reduced-motion:reduce){nav{transition:none}}
      </style><nav><button id="back" type="button">${escapeIcon}</button><span id="title"></span><button id="episodes" type="button" aria-haspopup="dialog" aria-expanded="false"></button><div id="source-wrap"><button id="source" type="button" aria-haspopup="menu" aria-expanded="false"></button><div id="sources-menu" role="menu" hidden></div></div><button id="language" type="button" aria-label="Language / 语言"></button></nav><section id="episodes-menu" role="dialog" hidden></section>`;
      root.querySelector('#back').addEventListener('click',()=>action('back'));
      root.querySelector('#episodes').addEventListener('click',()=>toggle('episodes'));
      root.querySelector('#source').addEventListener('click',()=>toggle('sources'));
      root.querySelector('#language').addEventListener('click',()=>action('language'));
      root.addEventListener('keydown',event=>{
        if(event.key==='Escape' && panel){event.preventDefault();event.stopPropagation();close();}
        if(event.key==='Tab' && panel){const list=root.querySelector(panel==='sources'?'#sources-menu':'#episodes-menu');const items=[...list.querySelectorAll('button,select')].filter(x=>!x.disabled);if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey && root.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && root.activeElement===last){event.preventDefault();first.focus();}}
      });
      document.addEventListener('pointerdown',event=>{if(panel && !event.composedPath().includes(host))close();},true);
      for(const event of ['pointermove','pointerdown','keydown'])document.addEventListener(event,reveal,{passive:true,capture:true});
    }
    const fullscreen=document.fullscreenElement||document.webkitFullscreenElement;
    const parent=fullscreen && !['VIDEO','IFRAME'].includes(fullscreen.tagName)?fullscreen:document.body;
    if(host.parentNode!==parent)parent.appendChild(host);
    render();
    if(!synchronized){synchronized=true;action('sync');}
  }
  document.addEventListener('fullscreenchange',mount);
  document.addEventListener('webkitfullscreenchange',mount);
  new MutationObserver(()=>{if(!host?.isConnected)mount();}).observe(document,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
