// Subtitle transport and format conversion. Never substitute a different file
// just because its language/title matches; video editions have different clocks.
(function () {
  'use strict';
  if (location.hostname !== 'cinesrc.st' || window.__TFLIX_SUBTITLES__) return;
  const originalFetch = window.fetch.bind(window);
  let sourceCatalog={key:'',items:[]};
  const mediaKey=()=>`${location.pathname}${location.search}|${document.querySelector?.('video')?.currentSrc||''}`;
  const languageKey=value=>String(value||'').toLowerCase().split(/[-_]/)[0];
  const hosts = new Set(['subs.bright67.online', 'sub.wyzie.io']);
  function normalize(input) {
    const text = input.replace(/^\uFEFF/, '').trim();
    // Segmented HLS subtitles need PTS mapping; never parse them as a whole-film file.
    if (/X-TIMESTAMP-MAP\s*=/i.test(text)) return null;
    if (text.startsWith('WEBVTT')) return /\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->/.test(text) ? text : null;
    const events = text.indexOf('[Events]');
    if (events >= 0) {
      let fields = []; const cues = [];
      const stamp = value => {
        const m = value.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/);
        return m ? `${m[1].padStart(2,'0')}:${m[2]}:${m[3]}.${m[4].padEnd(3,'0')}` : null;
      };
      for (const line of text.slice(events).split(/\r?\n/)) {
        if (/^Format:/i.test(line)) fields = line.slice(7).split(',').map(x=>x.trim().toLowerCase());
        if (!/^Dialogue:/i.test(line) || fields.at(-1) !== 'text') continue;
        const values = line.slice(9).split(',');
        const start = stamp(values[fields.indexOf('start')] || ''), end = stamp(values[fields.indexOf('end')] || '');
        const raw = values.slice(fields.length-1).join(',');
        if (!start || !end || /\\p[1-9]/.test(raw)) continue;
        const body = raw.replace(/\{[^}]*\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,' ')
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim();
        if (body) cues.push(`${start} --> ${end}\n${body}`);
      }
      return cues.length ? `WEBVTT\n\n${cues.join('\n\n')}\n` : null;
    }
    // SRT is converted once, preserving its original seconds and cue content.
    const blocks = text.replace(/\r\n?/g,'\n').split(/\n\s*\n/), cues=[];
    for (const block of blocks) {
      const m=block.match(/^(?:\d+\n)?(\d{2}:\d{2}:\d{2})[,.](\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})[,.](\d{3})([^\n]*)\n([\s\S]+)$/);
      if(m) cues.push(`${m[1]}.${m[2]} --> ${m[3]}.${m[4]}\n${m[6]}`);
    }
    return cues.length ? `WEBVTT\n\n${cues.join('\n\n')}\n` : null;
  }
  function isSplit(candidate) {
    const names=[candidate.fileName,candidate.release,...(candidate.releases||[])].filter(x=>typeof x==='string').join(' ');
    return Number(candidate.discNumber)>0 || Number(candidate.discCount)>1 || /(?:^|[\s._\-\[(])(?:cd|disc|disk)[\s._-]*\d+\b/i.test(names);
  }
  function safeUrl(raw) {
    const url=new URL(raw);
    if(url.protocol!=='https:' || !hosts.has(url.hostname) || url.username || url.password || url.port) throw Error('Untrusted subtitle address');
    return url.href;
  }
  async function catalog(language,signal) {
    const match=location.pathname.match(/^\/embed\/(tv|movie)\/(\d+)/);
    if(!match) return [];
    const params=new URLSearchParams(location.search),url=new URL('https://subs.bright67.online/search');
    url.searchParams.set('id',match[2]);
    if(match[1]==='tv') {url.searchParams.set('season',params.get('s')||'1');url.searchParams.set('episode',params.get('e')||'1');}
    if(language) url.searchParams.set('language',language);
    // A directory captured before the very first media URL can bind once to
    // that video's first loaded source, never to a subsequent source switch.
    if(sourceCatalog.key===`${location.pathname}${location.search}|` && document.querySelector?.('video')?.currentSrc)sourceCatalog.key=mediaKey();
    const builtins=sourceCatalog.key===mediaKey()?sourceCatalog.items.filter(x=>!language || languageKey(x.language)===languageKey(language)):[];
    if(builtins.length)return builtins;
    let response;
    try {response=await originalFetch(url.href,{signal,credentials:'omit'});}catch(error){if(signal?.aborted || !builtins.length)throw error;return builtins;}

    const data=await response.json();
    // This API uses HTTP 400 for an empty language catalog, not only bad input.
    if(response.status===400 && data?.message==='No subtitles found') return builtins;
    if(!response.ok) {if(builtins.length)return builtins;throw Error(`Subtitle catalog: ${response.status}`);}
    if(!Array.isArray(data)) throw Error('Invalid subtitle catalog');
    // Keep all metadata: an IMDb match or upstream "likely" is NOT sync proof.
    return [...builtins,...data.map(x=>({...x,excluded:isSplit(x),matchState:'unverified'}))];
  }
  async function download(candidate,signal) {
    if(isSplit(candidate)) throw Error('Split-disc subtitle cannot be used with a complete video');
    const sourceTrack=candidate.matchState==='source-track' && sourceCatalog.key===mediaKey() && sourceCatalog.items.some(x=>x.id===candidate.id && x.url===candidate.url);
    if(candidate.matchState==='source-track' && !sourceTrack)throw Error('Video source changed; reopen subtitles');
    const urls=sourceTrack?[candidate.url]:[candidate.r2Url,candidate.url].filter(Boolean).map(safeUrl);
    for(const url of new Set(urls)) {
      try {
        const response=await originalFetch(url,{signal,credentials:'omit'});
        const text=response.ok ? normalize(await response.text()) : null;
        if(text) {
          const bytes=new TextEncoder().encode(text);
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
          return {text,hash,id:String(candidate.id),matchState:sourceTrack?'source-track':'unverified'};
        }
      } catch(error) {if(signal?.aborted) throw error;}
    }
    throw Error('The selected subtitle file could not be loaded');
  }
  window.__TFLIX_SUBTITLES__={normalize,isSplit,catalog,download};
  window.fetch=async function(input,init) {
    const url=new URL(typeof input==='string'||input instanceof URL ? input : input.url,location.href);
    const isSearch=url.origin===location.origin && url.pathname==='/api/subtitles/search';
    let builtins=[];
    if(isSearch)try{const payload=JSON.parse(init?.body||'{}');
      const match=location.pathname.match(/^\/embed\/(tv|movie)\/(\d+)/),params=new URLSearchParams(location.search);
      if(!match || String(payload.tmdbId)!==match[2] || match[1]==='tv' && (Number(payload.season)!==Number(params.get('s')||1) || Number(payload.episode)!==Number(params.get('e')||1)))throw Error('Stale subtitle catalog');
        builtins=(Array.isArray(payload.builtInSubtitles)?payload.builtInSubtitles:[]).flatMap((item,index)=>{
          try{const address=new URL(item.url);if(address.protocol!=='https:' || address.username || address.password)return [];
            return [{...item,id:`source-${index}`,fileName:item.display||item.label||item.language||'Source track',url:address.href,matchState:'source-track',excluded:false}];
          }catch{return [];}
        });
      sourceCatalog={key:mediaKey(),items:builtins};
    }catch{}
    const response=await originalFetch(input,init);
    // The local controller owns external subtitle selection. Prevent the remote
    // player from restoring files or applying its own saved timing offset. Source
    // bundled tracks are offered by the same local controller instead.
    if(url.origin===location.origin && url.pathname==='/api/subtitles/search' && response.ok) {
      try {
        const data=await response.clone().json();
        if(Array.isArray(data.subtitles)) return new Response(JSON.stringify({...data,subtitles:[]}),{status:200,headers:{'Content-Type':'application/json'}});
      } catch {
        // Some providers return an HTML/empty 200 response when their subtitle
        // service is unavailable. Keep the remote player alive with a valid
        // empty catalog instead of surfacing a JSON parse rejection.
        return new Response(JSON.stringify({subtitles:[],upstreamStatus:'invalid'}),{status:200,headers:{'Content-Type':'application/json'}});
      }
    }
    if(hosts.has(url.hostname) && url.pathname==='/search' && response.ok) return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
    return response;
  };
})();
