// Keep the desktop app's UI and embedded player pages from selecting display
// text or opening the WebView context menu. Editable fields remain selectable.
(function () {
  'use strict';
  if (window.__TFLIX_INTERACTION_GUARD__) return;
  window.__TFLIX_INTERACTION_GUARD__ = true;

  const installStyle = () => {
    const root = document.head || document.documentElement;
    if (!root) return false;
    const style = document.createElement('style');
    style.textContent = `
      html, html *, html *::before, html *::after {
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      html input, html textarea,
      html [contenteditable]:not([contenteditable="false"]),
      html [contenteditable]:not([contenteditable="false"]) * {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
    `;
    root.appendChild(style);
    return true;
  };
  if (!installStyle()) document.addEventListener('DOMContentLoaded', installStyle, {once:true});

  document.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
