// This script is installed in every webview frame, but only reports media
// readiness from embedded player frames. No media URLs or page content leave
// the WebView; the top frame receives only media state signals.
(function () {
  'use strict';
  if (window.top === window.self || window.__TFLIX_MEDIA_MONITOR__) return;
  window.__TFLIX_MEDIA_MONITOR__ = true;
  let failureReported = false;

  function report(type) {
    try { window.top.postMessage({ type: type }, '*'); } catch (_) {}
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
    let hasMedia = false;
    function ready() {
      if (Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 2) {
        failureReported = false;
        hasMedia = true;
        report('tflix:media-ready');
      }
    }
    video.addEventListener('loadedmetadata', ready, { passive: true });
    video.addEventListener('canplay', ready, { passive: true });
    video.addEventListener('playing', function () {
      if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
        failureReported = false;
        hasMedia = true;
        report('tflix:media-playing');
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
