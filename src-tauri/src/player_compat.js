// CineSrc chooses hls.js before native HLS. On Apple WebViews use the native
// decoder, avoiding Chromium-specific remux assumptions in the MSE path.
(function () {
  'use strict';
  if (location.hostname !== 'cinesrc.st' || navigator.vendor !== 'Apple Computer, Inc.') return;
  const video = document.createElement('video');
  if (!video.canPlayType('application/vnd.apple.mpegurl')) return;
  for (const api of ['MediaSource', 'ManagedMediaSource']) {
    Object.defineProperty(window, api, { configurable: true, value: undefined });
  }
})();
