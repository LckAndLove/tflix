const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('stream/index.html','utf8');
const sources=require('../stream/source-config.js');

test('cross-source fallback adds only the destination provider start-time parameter',()=>{
  const start=html.indexOf('function sourceUrlFor('),end=html.indexOf('\n/* ─── PLAYER ─── */',start);
  const context={
    URL,location:{href:'https://tflix.example/stream/index.html'},SERVERS:sources,
    serverUrlResolvers:Object.fromEntries(sources.map(source=>[source.id,source])),
    state:{type:'movie',id:'1288069',server:6},pendingSourceSeek:{time:156.8,fromServer:4},
    sourceTimeParameterApplied:false
  };
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const raw=context.sourceUrlFor(6),url=new URL(raw);
  assert.equal(url.searchParams.get('startAt'),'156');
  assert.equal(context.sourceTimeParameterApplied,true);

});

function progressListener(parameterApplied){
  const start=html.indexOf('const resumedFrames=new WeakMap();'),end=html.indexOf('\n/* ─── END WATCH PROGRESS ─── */',start);
  let receive;const context={
    state:{type:'movie',id:'1288069',server:6},pendingSourceSeek:{time:120,fromServer:4},
    sourceTimeParameterApplied:parameterApplied,
    window:{addEventListener:(name,listener)=>receive=listener},
    localStorage:{getItem:()=>null,setItem(){}},Date,
    isCurrentPlayerFrame:()=>true,toast(){},currentLang:'en'
  };
  vm.createContext(context);vm.runInContext(html.slice(start,end),context);
  const sent=[],source={postMessage:data=>sent.push(data)};
  receive({source,data:{type:'tflix:media-ready',duration:900,currentTime:0}});
  return {context,sent,receive,source};
}

test('provider URL startAt suppresses a duplicate injected seek',()=>{
  const {context,sent}=progressListener(true);
  assert.equal(sent.length,0);
  assert.equal(context.pendingSourceSeek,null);
});

test('providers without a URL parameter receive a seek command through the bridge',()=>{
  const {context,sent}=progressListener(false);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'tflix:resume',time:120,duration:900}]);
  assert.equal(context.pendingSourceSeek,null);
});

test('an early zero-time ready event does not erase the handoff position',()=>{
  const {context}=progressListener(true);
  assert.equal(context.latestMediaProgress.currentTime,120);
});

test('duplicate readiness cannot erase a retained manual handoff position',()=>{
  const {context,receive,source}=progressListener(true);
  receive({source,data:{type:'tflix:media-ready',duration:900,currentTime:0}});
  assert.equal(context.latestMediaProgress.currentTime,120);
});
