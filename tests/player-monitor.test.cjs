const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function monitor(duration = 120, readyState = 2, text = '') {
  const signals = [], listeners = {};let now=1000;
  const video = { duration, readyState, currentTime:0, paused:false, seeking:false, ended:false, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  const document = { body: { innerText: text }, querySelectorAll() { return [video]; } };
  const window = { top: { postMessage(data) { signals.push(data.type); } }, self: {} };
  vm.runInNewContext(fs.readFileSync('src-tauri/src/player_monitor.js', 'utf8'), {
    window, document, Date:{now:()=>now}, setInterval(fn){listeners.interval=fn;return 1;}, MutationObserver: class { observe() {} }
  });
  return { signals, listeners, video, fire(type){for(const fn of listeners[type]||[])fn();}, setNow(value){now=value;} };
}

test('reports errors after media readiness even before playback starts', () => {
  const { signals, fire } = monitor();
  fire('error');
  fire('error');
  assert.deepEqual(signals, ['tflix:media-ready', 'tflix:media-error']);
});

test('does not accept an empty video as successful playback', () => {
  const { signals, fire } = monitor(0, 0);
  fire('playing');
  assert.deepEqual(signals, []);
});

function playerState() {
  const html=fs.readFileSync('stream/index.html','utf8');
  const handler=html.slice(html.indexOf('function onPlayerMediaEvent('),html.indexOf('\nfunction isCurrentPlayerFrame('));
  const context={state:{server:4},sourceStatuses:{},playerMediaDetected:false,
    isCurrentPlayerFrame:()=>true,$:()=>({classList:{add(){}}}),
    hidePlaybackFailure(){context.failureShown=false;},showPlaybackFailure(){context.failureShown=true;},
    updateServerCards(){},updateSourceStatus(){},t:()=>'%s',serverName:()=> 'Ekko'};
  vm.createContext(context);vm.runInContext(handler,context);
  return {context,send:type=>context.onPlayerMediaEvent({data:{type},source:{}})};
}
test('ready and playing events preserve the manually chosen source',()=>{
  const {context,send}=playerState();send('tflix:media-ready');send('tflix:media-playing');send('tflix:media-ready');
  assert.equal(context.state.server,4);assert.equal(context.playerMediaDetected,true);
  assert.equal(context.sourceStatuses[4],'playing');
});
test('errors keep the selected source and recovered playback clears the failure UI',()=>{
  const {context,send}=playerState();send('tflix:media-ready');send('tflix:media-error');
  assert.equal(context.state.server,4);assert.equal(context.failureShown,true);
  send('tflix:media-playing');assert.equal(context.failureShown,false);assert.equal(context.state.server,4);
});
test('remote navigation reaches manual source cards without an automatic retry action',()=>{
  const html=fs.readFileSync('stream/index.html','utf8');
  const start=html.indexOf('  function getSections()'),end=html.indexOf('\n  function focusInitial()',start);
  const cards=Array.from({length:6},(_,id)=>({id}));
  const context={$:id=>id==='server-grid'?{}:undefined,vis:Boolean,document:{querySelectorAll:()=>cards},getComputedStyle:()=>({gridTemplateColumns:'170px 170px'})};
  vm.createContext(context);vm.runInContext(html.slice(start,end)+'\nvar sections=getSections();',context);
  assert.deepEqual(Array.from(context.sections,row=>Array.from(row.items,card=>card.id)),[[0,1],[2,3],[4,5]]);
});

test('reports explicit sandbox refusal as permanent instead of a transient error',()=>{
 const {signals}=monitor(0,0,"This content can’t be embedded in a sandboxed frame. The player was loaded inside an <iframe sandbox>, which isn’t permitted.");
 assert.deepEqual(signals,['tflix:embed-blocked']);
});
test('does not mistake ordinary sandbox text for a refusal',()=>{
 assert.deepEqual(monitor(0,0,'A sandbox adventure').signals,[]);
});
