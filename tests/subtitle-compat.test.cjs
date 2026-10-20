const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ass='[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.25,0:00:04.50,Default,,0,0,0,,{\\i1}Hello, world\\NSecond line';
function install(fetch){
 const window={fetch};
 vm.runInNewContext(fs.readFileSync('src-tauri/src/subtitle_compat.js','utf8'),{window,location:{hostname:'cinesrc.st',origin:'https://cinesrc.st',href:'https://cinesrc.st/embed/tv/123542?s=1&e=1',pathname:'/embed/tv/123542',search:'?s=1&e=1'},URL,URLSearchParams,Response,TextEncoder,Uint8Array,crypto:webcrypto});
 return {window,api:window.__TFLIX_SUBTITLES__};
}
test('ASS conversion preserves original time values and dialogue commas',()=>{
 const {api}=install(()=>{});
 assert.match(api.normalize(ass),/00:00:01.250 --> 00:00:04.500\nHello, world\nSecond line/);
});
test('SRT normalization preserves timestamps without shifting or scaling',()=>{
 const {api}=install(()=>{});
 assert.equal(api.normalize('1\r\n00:25:09,123 --> 00:25:11,456\r\nDialogue'), 'WEBVTT\n\n00:25:09.123 --> 00:25:11.456\nDialogue\n');
 assert.equal(api.normalize('CANNOT CONNECT TO DB'),null);
});
test('split-disc files are rejected before any download',async()=>{
 let calls=0;const {api}=install(async()=>{calls++;return new Response(ass);});
 for(const c of [{discNumber:1},{discCount:2},{fileName:'The.Godfather.cd2-ENG.srt'},{fileName:'Movie CD1 (EN).srt'}]) {
  assert.equal(api.isSplit(c),true);await assert.rejects(api.download(c),/Split-disc/);
 }
 assert.equal(calls,0);assert.equal(api.isSplit({fileName:'Movie.1080p.WEB-DL.srt',fps:25}),false);
});
test('download retries only addresses belonging to the selected file',async()=>{
 const seen=[];const {api}=install(async url=>{seen.push(url);return new Response(url.includes('/r2/')?'DB ERROR':ass);});
 const file=await api.download({id:'same-file',r2Url:'https://subs.bright67.online/r2/same.ass',url:'https://subs.bright67.online/c/same'});
 assert.equal(file.id,'same-file');assert.equal(file.hash.length,64);assert.equal(file.matchState,'unverified');assert.equal(seen.length,2);
});
test('failed files never trigger a search for an unrelated replacement',async()=>{
 const seen=[];const {api}=install(async url=>{seen.push(url);return new Response('DB ERROR');});
 await assert.rejects(api.download({id:'broken',url:'https://subs.bright67.online/c/broken'}),/could not be loaded/);
 assert.equal(seen.length,1);assert.ok(!seen.some(x=>x.includes('/search')));
});
test('catalog retains split metadata and does not treat likely as verified sync',async()=>{
 let request;const {api}=install(async url=>{request=url;return Response.json([{id:'2486',discNumber:1,syncConfidence:'likely'},{id:'complete',syncConfidence:'likely'}]);});
 const items=await api.catalog('en');assert.equal(items[0].excluded,true);assert.equal(items[1].matchState,'unverified');
 assert.match(request,/id=123542&season=1&episode=1&language=en/);
});
test('remote automatic catalog excludes external files while preserving source tracks',async()=>{
 const {window}=install(async()=>Response.json({subtitles:[{id:'source',source:'builtin'},{id:'unknown',source:'external'}],upstreamStatus:'ok'}));
 const data=await(await window.fetch('/api/subtitles/search')).json();assert.equal(data.subtitles.length,1);assert.equal(data.subtitles[0].id,'source');
});
test('unrelated video requests are left unchanged',async()=>{
 const response=new Response('playlist');const {window}=install(async()=>response);
 assert.equal(await window.fetch('https://cinesrc.st/api/playlist/test'),response);
});

test('empty language catalogs are distinguished from service failures',async()=>{
 const empty=install(async()=>Response.json({message:'No subtitles found'},{status:400}));
 assert.equal((await empty.api.catalog('zh')).length,0);
 const failed=install(async()=>Response.json({message:'Database error'},{status:500}));
 await assert.rejects(failed.api.catalog('zh'),/Subtitle catalog: 500/);
});
