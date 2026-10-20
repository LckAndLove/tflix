const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function monitor(duration = 120, readyState = 2, text = '') {
  const signals = [], listeners = {};
  const video = { duration, readyState, addEventListener(type, fn) { listeners[type] = fn; } };
  const document = { body: { innerText: text }, querySelectorAll() { return [video]; } };
  const window = { top: { postMessage(data) { signals.push(data.type); } }, self: {} };
  vm.runInNewContext(fs.readFileSync('src-tauri/src/player_monitor.js', 'utf8'), {
    window, document, MutationObserver: class { observe() {} }
  });
  return { signals, listeners };
}

test('reports errors after media readiness even before playback starts', () => {
  const { signals, listeners } = monitor();
  listeners.error();
  listeners.error();
  assert.deepEqual(signals, ['tflix:media-ready', 'tflix:media-error']);
});

test('does not accept an empty video as successful playback', () => {
  const { signals, listeners } = monitor(0, 0);
  listeners.playing();
  assert.deepEqual(signals, []);
});

function playerState() {
  const html = fs.readFileSync('stream/index.html', 'utf8');
  const handler = html.slice(html.indexOf('function onPlayerMediaEvent('), html.indexOf('\nfunction isCurrentPlayerFrame('));
  const cleared = [];
  const context = {
    state: { server: 4 }, sourceStatuses: {}, playerMediaDetected: false, sourceCheckTimer: 42,
    autoTryEnabled: true, sourceRecoveryTimer: null, SOURCE_RECOVERY_TIMEOUT_MS: 12000,
    setTimeout(fn, delay) { context.recovery = fn; context.delay = delay; return 99; },
    clearTimeout(id) { cleared.push(id); }, isCurrentPlayerFrame() { return true; },
    hidePlaybackFailure() {}, updateServerCards() {}, updateSourceStatus() {}, t() { return '%s'; }, serverName() { return 'Ekko'; },
    tryNextSource() { context.nextCalls++; }, nextCalls: 0
  };
  vm.createContext(context);
  vm.runInContext(handler, context);
  const send = type => context.onPlayerMediaEvent({ data: { type }, source: {} });
  return { context, cleared, send };
}

test('readiness preserves a playable source while waiting for a user gesture', () => {
  const { context, cleared, send } = playerState();
  send('tflix:media-ready');
  assert.equal(context.playerMediaDetected, true);
  assert.deepEqual(cleared, [null, 42]);
  send('tflix:media-playing');
  assert.equal(context.playerMediaDetected, true);
  assert.ok(cleared.includes(42));
  send('tflix:media-ready');
  assert.equal(context.sourceStatuses[4], 'playing');
});

test('media errors allow recovery before advancing to the next source', () => {
  const { context, send } = playerState();
  send('tflix:media-ready');
  send('tflix:media-error');
  assert.equal(context.nextCalls, 0);
  assert.equal(context.delay, 12000);
  context.recovery();
  assert.equal(context.nextCalls, 1);
});

test('remote navigation reaches retry and both source columns', () => {
  const html = fs.readFileSync('stream/index.html', 'utf8');
  const start = html.indexOf('  function getSections()');
  const end = html.indexOf('\n  function focusInitial()', start);
  const cards = Array.from({ length: 6 }, (_, id) => ({ id }));
  const retry = { id: 'retry' }, grid = {}, elements = { 'retry-source-btn': retry, 'server-grid': grid };
  const context = {
    $: id => elements[id], vis: Boolean,
    document: { querySelectorAll: () => cards },
    getComputedStyle: () => ({ gridTemplateColumns: '170px 170px' })
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end) + '\nvar sections = getSections();', context);
  assert.equal(context.sections[0].items[0], retry);
  assert.deepEqual(Array.from(context.sections.slice(1), row => Array.from(row.items, card => card.id)), [[0, 1], [2, 3], [4, 5]]);
});

 test('early error pages do not shorten the initial startup timeout', () => {
  const { context, cleared, send } = playerState();
  send('tflix:media-error');
  assert.equal(context.nextCalls, 0);
  assert.deepEqual(cleared, []);
  assert.equal(context.recovery, undefined);
});
test('recovered media cancels the error recovery timer', () => {
  const {context, cleared, send} = playerState();
  send('tflix:media-ready');
  send('tflix:media-error');
  send('tflix:media-playing');
  assert.ok(cleared.includes(99));
  assert.equal(context.sourceRecoveryTimer,null);
  assert.equal(context.nextCalls,0);
});

test('reports explicit sandbox refusal as permanent instead of a transient error',()=>{
 const {signals}=monitor(0,0,"This content can’t be embedded in a sandboxed frame. The player was loaded inside an <iframe sandbox>, which isn’t permitted.");
 assert.deepEqual(signals,['tflix:embed-blocked']);
});
test('does not mistake ordinary sandbox text for a refusal',()=>{
 assert.deepEqual(monitor(0,0,'A sandbox adventure').signals,[]);
});

test('manual playback errors show recovery without changing the chosen source',()=>{
 const {context,send}=playerState();context.autoTryEnabled=false;
 context.showPlaybackFailure=()=>context.failureShown=true;
 send('tflix:media-ready');send('tflix:media-error');
 assert.equal(context.failureShown,true);assert.equal(context.nextCalls,0);
 assert.equal(context.sourceStatuses[4],'failed');
});
