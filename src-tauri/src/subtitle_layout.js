// Keep CineSrc captions near the bottom of the visible video, including
// letterboxed video and fullscreen, instead of its fixed 100/180px lift.
(function () {
  'use strict';
  if (location.hostname !== 'cinesrc.st') return;
  let controller, video;
  const resize = new ResizeObserver(position);
  function position() {
    if (!controller || !video) return;
    const frame = controller.getBoundingClientRect();
    const box = video.getBoundingClientRect();
    const ratio = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9;
    const height = Math.min(box.height, box.width / ratio);
    const bottom = Math.max(0, frame.bottom - box.bottom) + (box.height - height) / 2 + Math.max(12, height * 0.035);
    const value = `${Math.round(bottom)}px`;
    if (controller.style.getPropertyValue('--tflix-caption-bottom') !== value) controller.style.setProperty('--tflix-caption-bottom', value);
  }
  function scan() {
    if (!document.getElementById('tflix-caption-layout') && document.head) {
      const style = document.createElement('style');
      style.id = 'tflix-caption-layout';
      style.textContent = ':root:not(:has(:fullscreen)) .notflix-controller > media-control-bar.top-0 { visibility:hidden !important; pointer-events:none !important; } .notflix-timeline-progress { background:#e50914 !important; } .notflix-timeline-thumb { background:#e50914 !important; } media-controller div[noautohide][style*="--subtitle-overlay-bottom"] > div { bottom:var(--tflix-caption-bottom, 3.5%) !important; top:auto !important; left:0 !important; right:0 !important; width:auto !important; max-width:none !important; transform:none !important; display:flex !important; flex-direction:column !important; align-items:center !important; }';
      document.head.appendChild(style);
    }
    const next = document.querySelector('media-controller');
    const media = next?.querySelector('video');
    if (next !== controller || media !== video) {
      resize.disconnect();
      video?.removeEventListener('loadedmetadata', position);
      controller = next;
      video = media;
      if (controller) resize.observe(controller);
      if (video) {
        resize.observe(video);
        video.addEventListener('loadedmetadata', position);
      }
    }
    position();
  }
  new MutationObserver(scan).observe(document, { childList:true, subtree:true });
  window.addEventListener('resize', position);
  document.addEventListener('fullscreenchange', position);
  scan();
})();
