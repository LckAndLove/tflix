// A native WebView loads the provider as its top-level document. Only this
// isolated toolbar belongs to TFLIX; the provider retains its own video player.
(function () {
  'use strict';
  if (window.top !== window.self || !window.__TFLIX_DIRECT_PLAYER__) return;
  function mount() {
    if (!document.body || document.getElementById('tflix-native-controls')) return;
    const host=document.createElement('div');host.id='tflix-native-controls';
    host.style.cssText='position:fixed;inset:0 0 auto;z-index:2147483647;pointer-events:none';
    const root=host.attachShadow({mode:'closed'});
    root.innerHTML='<style>:host{all:initial}nav{height:70px;display:flex;align-items:center;gap:20px;padding:0 24px;background:linear-gradient(#000d,transparent);font:15px Arial,sans-serif;color:white;pointer-events:auto}button{border:0;background:transparent;color:white;font:inherit;padding:12px;cursor:pointer}span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style><nav><button type="button" aria-label="返回"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 6-6 6 6 6"/></svg></button><span></span></nav>';
    root.querySelector('span').textContent=window.__TFLIX_DIRECT_PLAYER__.request.title||'TFLIX';
    root.querySelector('button').addEventListener('click',()=>{location.href='tflix-player://back';});
    document.body.appendChild(host);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
