// This script is installed in every webview frame, but only reports media
// readiness from embedded player frames. No media URLs or page content leave
// the WebView; the top frame receives only media state signals.
(function () {
  'use strict';
  if (window.top === window.self || window.__TFLIX_MEDIA_MONITOR__) return;
  window.__TFLIX_MEDIA_MONITOR__ = true;
  const STALL_TIMEOUT_MS = 8000;
  let failureReported = false;

  function report(type, detail = {}) {
    try { window.top.postMessage({ type: type, ...detail }, '*'); } catch (_) {}
  }

  function reportFailure() {
    if (failureReported) return;
    failureReported = true;
    report('tflix:media-error');
  }

  function inspectErrorPage() {
    const text = (document.body && document.body.innerText || '').slice(0, 3000);
    if (/please disable sandbox|can[’']t be embedded in a sandboxed frame|iframe sandbox[^\n]{0,100}(?:isn[’']t|not) permitted/i.test(text)) {
      if (!failureReported) { failureReported = true; report('tflix:embed-blocked'); }
      return;
    }
    if (/status code\s*404/i.test(text) || /404[\s\S]{0,100}something went wrong/i.test(text) || /this video(?: file)? (?:is )?unavailable/i.test(text)) {
      reportFailure();
    }
  }

  function inspect(video) {
    if (video.__tflixObserved) return;
    video.__tflixObserved = true;
    let hasMedia = false,lastProgress=0,resumeTarget=null,lastAdvanceAt=Date.now(),lastVideoTime=video.currentTime||0;
    function identity(){if(typeof location==='undefined' || location.hostname!=='cinesrc.st')return {};const match=location.pathname.match(/^\/embed\/(tv|movie)\/(\d+)/);if(!match)return {};const params=new URLSearchParams(location.search);return {mediaType:match[1],mediaId:match[2],season:Number(params.get('s')||1),episode:Number(params.get('e')||1)};}
    let mediaIdentity=identity();
    const progress=()=>({...mediaIdentity,currentTime:video.currentTime,duration:video.duration});
    const trackTime=()=>{
      const now=Date.now(),current=video.currentTime||0;
      if(Math.abs(current-lastVideoTime)>.05){lastVideoTime=current;lastAdvanceAt=now;}
      if(hasMedia && now-lastProgress>=5000){lastProgress=now;report('tflix:media-progress',progress());}
    };
    video.addEventListener('timeupdate',trackTime);
    video.addEventListener('playing',()=>{lastVideoTime=video.currentTime||0;lastAdvanceAt=Date.now();}, {passive:true});
    video.addEventListener('seeking',()=>{lastVideoTime=video.currentTime||0;lastAdvanceAt=Date.now();}, {passive:true});
    video.addEventListener('seeked',()=>{lastVideoTime=video.currentTime||0;lastAdvanceAt=Date.now();}, {passive:true});
    setInterval(()=>{
      if(!hasMedia || video.paused || video.seeking || video.ended){lastVideoTime=video.currentTime||0;lastAdvanceAt=Date.now();return;}
      trackTime();
      if(Date.now()-lastAdvanceAt>=STALL_TIMEOUT_MS)reportFailure();
    },1000);
    video.addEventListener('pause',()=>{if(hasMedia)report('tflix:media-progress',progress());});
    video.addEventListener('ended',()=>{if(hasMedia)report('tflix:media-progress',{...progress(),ended:true});});
    video.addEventListener('seeked',()=>{if(resumeTarget!==null && Math.abs(video.currentTime-resumeTarget)<1){resumeTarget=null;report('tflix:media-resumed',progress());}});
    if(window.addEventListener)window.addEventListener('message',event=>{
      if(event.source!==window.top || event.data?.type!=='tflix:resume' || video.isConnected===false || video.readyState<2) return;
      const {time,duration}=event.data;
      if(!Number.isFinite(time)||!Number.isFinite(duration)||Math.abs(video.duration-duration)>2 || time<5 || time>video.duration-5) return;
      try{resumeTarget=time;video.currentTime=time;}catch{resumeTarget=null;}
    });
    function ready() {
      if (Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 2) {
        failureReported = false;
        hasMedia = true;
        report('tflix:media-ready',progress());
      }
    }
    video.addEventListener('loadedmetadata',()=>{mediaIdentity=identity();ready();}, { passive: true });
    video.addEventListener('canplay', ready, { passive: true });
    video.addEventListener('playing', function () {
      if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
        failureReported = false;
        hasMedia = true;
        report('tflix:media-playing',progress());
      }
    }, { passive: true });
    video.addEventListener('pause', function () { report('tflix:media-paused'); }, { passive: true });
    video.addEventListener('error', function () {
      // Include failures after canplay but before the first playing event.
      if (hasMedia) reportFailure();
    }, { passive: true });
    ready();
  }

  function scan(node) {
    if (node && node.nodeType === 1 && node.matches && node.matches('video')) inspect(node);
    if (node && node.querySelectorAll) node.querySelectorAll('video').forEach(inspect);
  }

  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(scan);
    });
    inspectErrorPage();
  }).observe(document, { childList: true, characterData: true, subtree: true });
  let lastInteraction = 0;
  if (document.addEventListener) for (const name of ['pointermove','pointerdown','keydown']) document.addEventListener(name, function () {
    const now = Date.now();
    if (now - lastInteraction < 800) return;
    lastInteraction = now;
    report('tflix:interaction');
  }, { passive:true });
  scan(document);
  inspectErrorPage();
})();
