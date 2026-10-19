const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ass = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.25,0:00:04.50,Default,,0,0,0,,{\\i1}Hello, world\\NSecond line';
function install(fetch, document) {
  const window = {fetch};
  vm.runInNewContext(fs.readFileSync('src-tauri/src/subtitle_compat.js', 'utf8'), {
    window, location: {hostname:'cinesrc.st',href:'https://cinesrc.st/embed/tv/123542?s=1&e=1',pathname:'/embed/tv/123542',search:'?s=1&e=1'},
    URL, URLSearchParams, Response, atob, document
  });
  return window.fetch;
}
test('converts ASS timestamps, formatting and dialogue commas to VTT', async () => {
  const fetch = install(async () => new Response(ass));
  const response = await fetch('https://subs.bright67.online/r2/test.ass');
  assert.equal(response.headers.get('content-type'), 'text/vtt; charset=utf-8');
  assert.match(await response.text(), /00:00:01.250 --> 00:00:04.500\nHello, world\nSecond line/);
});
test('retries failed subtitle responses using same-language episode candidates', async () => {
  const seen=[];
  const fetch=install(async url => {
    seen.push(url);
    if(url.includes('/search?')) return Response.json([{language:'fr',r2Url:'https://subs.bright67.online/r2/fr.ass'},{language:'en',r2Url:'https://subs.bright67.online/r2/en.ass'}]);
    return new Response(url.endsWith('en.ass') ? ass : 'CANNOT CONNECT TO DB');
  });
  const url='https://subs.bright67.online/c/test?m='+btoa(JSON.stringify({lang:'en'}));
  assert.match(await (await fetch(url)).text(), /^WEBVTT/);
  assert.equal(seen.length,3);
  assert.match(seen[1], /id=123542&season=1&episode=1/);
  assert.equal(seen[2],'https://subs.bright67.online/r2/en.ass');
});
test('leaves non-subtitle requests unchanged', async () => {
  const original=new Response('original');
  assert.equal(await install(async()=>original)('https://cinesrc.st/api/test'),original);
});

test('warns when a fallback subtitle comes from a different file', async () => {
  const notices=[];
  const document={body:{appendChild:n=>notices.push(n)},getElementById:()=>null,createElement:()=>({style:{},setAttribute(){},addEventListener(){}})};
  const fetch=install(async url => url.includes('/search?')
    ? Response.json([{id:'other-release',language:'en',r2Url:'https://subs.bright67.online/r2/en.ass'}])
    : new Response(url.endsWith('en.ass') ? ass : 'CANNOT CONNECT TO DB'),document);
  await fetch('https://subs.bright67.online/c/test?m='+btoa(JSON.stringify({lang:'en',oid:'original'})));
  assert.equal(notices.length,1);
  assert.match(notices[0].textContent,/Subtitle Sync/);
});
