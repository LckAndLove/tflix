// Normalize subtitle responses inside CineSrc before its SRT/VTT-only parser.
(function () {
  'use strict';
  if (location.hostname !== 'cinesrc.st' || window.__TFLIX_SUBTITLE_COMPAT__) return;
  window.__TFLIX_SUBTITLE_COMPAT__ = true;
  const originalFetch = window.fetch.bind(window);
  const hosts = new Set(['subs.bright67.online', 'sub.wyzie.io']);

  function normalize(text) {
    text = text.replace(/^\uFEFF/, '').trim();
    if (text.startsWith('WEBVTT') || /\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->/.test(text)) return text;
    const events = text.indexOf('[Events]');
    if (events < 0) return null;
    let fields = [], cues = [];
    const stamp = value => {
      const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/);
      if (!match) return null;
      return match[1].padStart(2, '0') + ':' + match[2] + ':' + match[3] + '.' + match[4].padEnd(3, '0');
    };
    for (const line of text.slice(events).split(/\r?\n/)) {
      if (/^Format:/i.test(line)) fields = line.slice(7).split(',').map(x => x.trim().toLowerCase());
      if (!/^Dialogue:/i.test(line) || fields.at(-1) !== 'text') continue;
      const values = line.slice(9).split(',');
      const start = stamp(values[fields.indexOf('start')] || '');
      const end = stamp(values[fields.indexOf('end')] || '');
      const raw = values.slice(fields.length - 1).join(',');
      if (!start || !end || /\\p[1-9]/.test(raw)) continue;
      const body = raw.replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
      if (body) cues.push(start + ' --> ' + end + '\n' + body);
    }
    return cues.length ? 'WEBVTT\n\n' + cues.join('\n\n') + '\n' : null;
  }

  function warnFallback() {
    // A matching episode/language does not guarantee a matching video edit.
    // Keep this visible until dismissed so a replacement never looks verified.
    if (typeof document === 'undefined' || !document.body || document.getElementById('tflix-subtitle-fallback')) return;
    const notice = document.createElement('button');
    notice.id = 'tflix-subtitle-fallback';
    notice.type = 'button';
    notice.textContent = '备用字幕可能与片源不同步 · 字幕设置 → Customize → Subtitle Sync 可校准（点击关闭）';
    notice.setAttribute('aria-label', notice.textContent);
    notice.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;z-index:2147483647;background:#211b0eee;color:#ffe3a0;border:1px solid #746039;border-radius:8px;padding:10px;font:13px sans-serif;cursor:pointer';
    notice.addEventListener('click', () => notice.remove());
    document.body.appendChild(notice);
  }

  async function read(response) {
    return response.ok ? normalize(await response.clone().text()) : null;
  }

  window.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (!hosts.has(url.hostname) || !/^\/(?:c\/|r2\/|download)/.test(url.pathname)) return originalFetch(input, init);
    const signal = init?.signal || (typeof input === 'object' ? input.signal : undefined);
    const response = await originalFetch(input, init);
    let text = await read(response);
    if (!text) {
      // Retry real files from the same episode/language, never a different episode.
      const match = location.pathname.match(/^\/embed\/(tv|movie)\/(\d+)/);
      if (match) {
        const params = new URLSearchParams(location.search);
        const search = new URL('https://subs.bright67.online/search');
        search.searchParams.set('id', match[2]);
        if (match[1] === 'tv') {
          search.searchParams.set('season', params.get('s') || '1');
          search.searchParams.set('episode', params.get('e') || '1');
        }
        try {
          const metadata = JSON.parse(atob(url.searchParams.get('m') || ''));
          const result = await originalFetch(search.href, { signal, credentials: 'omit' });
          const candidates = result.ok ? await result.json() : [];
          if (Array.isArray(candidates) && typeof metadata.lang === 'string') {
            const sameLanguage = candidates.filter(x => x.language === metadata.lang);
            for (const candidate of sameLanguage.slice(0, 8)) {
              const alternate = new URL(candidate.r2Url || candidate.url);
              if (!hosts.has(alternate.hostname) || alternate.protocol !== 'https:') continue;
              text = await read(await originalFetch(alternate.href, { signal, credentials: 'omit' }));
              if (text) {
                if (String(candidate.id) !== String(metadata.oid)) warnFallback();
                break;
              }
            }
          }
        } catch (error) {
          if (signal?.aborted) throw error;
        }
      }
    }
    if (!text) return response;
    // New bodies need new headers; old lengths/encodings describe the remote body.
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/vtt; charset=utf-8' } });
  };
})();
