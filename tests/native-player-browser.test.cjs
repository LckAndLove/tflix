const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const sources=require('../stream/source-config.js');
const html=fs.readFileSync('stream/index.html','utf8');
const block=html.slice(html.indexOf('if (window.TFLIX_NATIVE_PLAYER) {\n  const native='),html.indexOf('/* ─── NAV ─── */'));
function fixture(invoke,close=async()=>{}){
  const events=[],native={update:async model=>events.push(['update',model]),close:async()=>{await close();events.push(['close']);}};
  const state={id:'123542',type:'tv',server:3,season:1,episode:3,title:'时光代理人'};
  vm.runInNewContext(block,{window:{TFLIX_NATIVE_PLAYER:native,__TAURI__:{core:{invoke}}},state,currentLang:'zh',
    sourceUrlFor:id=>sources.find(s=>s.id===id).buildUrl(state.type,state.id,state.season,state.episode),
    nativePlayerModel:()=>({...state}),$:id=>({click:()=>events.push(['click',id])})});
  return {native,state,events};
}
test('browser playback opens the selected episode and restores details only after success',async()=>{
  const calls=[],f=fixture(async(name,args)=>calls.push({name,args}));
  await f.native.onBrowserRequest();
  assert.equal(calls[0].name,'open_player_external');
  assert.equal(calls[0].args.request.url,sources.find(s=>s.id===3).buildUrl('tv','123542',1,3));
  assert.deepEqual(f.events,[['close'],['click','back-btn']]);
});
test('a browser launch failure keeps playback open and reports a friendly retry message',async()=>{
  let attempt=0;
  const f=fixture(async()=>{if(++attempt===1)throw new Error('technical error 403');});
  await f.native.onBrowserRequest();
  assert.equal(f.events.length,1);assert.equal(f.events[0][0],'update');
  assert.equal(f.events[0][1].browserError,'未能打开浏览器，请从播放菜单重试。');
  await f.native.onBrowserRequest();
  assert.equal(attempt,2);assert.equal(f.events.at(-1)[0],'click');
});
test('pending browser launches reject repeated clicks and source changes',async()=>{
  let resolve,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>resolve=r);});
  const pending=f.native.onBrowserRequest();
  await f.native.onBrowserRequest();
  await f.native.onAction({action:'source',server:4});
  assert.equal(calls,1);assert.equal(f.state.server,3);assert.equal(f.events.length,0);
  resolve();await pending;assert.equal(f.events.at(-1)[0],'click');
});

test('remote browser actions cannot launch a browser',async()=>{
  let calls=0;const f=fixture(async()=>calls++);
  await f.native.onAction({action:'browser',url:'https://untrusted.test/'});
  assert.equal(calls,0);assert.equal(f.events.length,0);
});
test('retry after a failed player close does not open another browser tab',async()=>{
  let calls=0,closes=0;
  const f=fixture(async()=>calls++,async()=>{if(++closes===1)throw Error('close failed');});
  await f.native.onBrowserRequest();
  assert.equal(f.events[0][0],'update');
  assert.match(f.events[0][1].browserError,/浏览器已打开/);
  await f.native.onBrowserRequest();
  assert.equal(calls,1);assert.equal(closes,2);assert.equal(f.events.at(-1)[0],'click');
});
