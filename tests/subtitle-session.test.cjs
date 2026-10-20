const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(download,prepare){const states=[],window={};vm.runInNewContext(fs.readFileSync('src-tauri/src/subtitle_session.js','utf8'),{window,AbortController});return {states,session:window.createTflixSubtitleSession({download,prepare,onState:s=>states.push(s)})};}
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};}
test('track activates only after the native parser finishes loading',async()=>{
 const loaded=deferred();let active=0;const {session,states}=setup(async()=>({id:'one',text:'WEBVTT'}),()=>loaded.promise);
 session.reset('video-A');const pending=session.select({id:'one'});await Promise.resolve();assert.equal(active,0);assert.equal(states.at(-1).state,'loading');
 loaded.resolve({activate(){active++;},dispose(){}});await pending;assert.equal(active,1);assert.equal(states.at(-1).state,'ready');
});
test('switching video rejects late subtitle fetch results',async()=>{
 const file=deferred();let prepared=0;const {session,states}=setup(()=>file.promise,async()=>{prepared++;});
 session.reset('video-A');const pending=session.select({id:'old'});session.reset('video-B');file.resolve({id:'old'});await pending;
 assert.equal(prepared,0);assert.equal(states.at(-1).sourceKey,'video-B');assert.equal(states.at(-1).state,'off');
});
test('switching selection disposes late track loads without activating them',async()=>{
 const loaded=deferred(),entered=deferred();let activated=0,disposed=0;const {session}=setup(async()=>({id:'old'}),()=>{entered.resolve();return loaded.promise;});
 const pending=session.select({id:'old'});await entered.promise;session.stop();loaded.resolve({activate(){activated++;},dispose(){disposed++;}});await pending;
 assert.equal(activated,0);assert.equal(disposed,1);
});
test('a failed parser never reports a subtitle as ready',async()=>{
 const {session,states}=setup(async()=>({id:'bad'}),async()=>{throw Error('parser failed');});await session.select({id:'bad'});
 assert.equal(states.at(-1).state,'error');assert.ok(!states.some(x=>x.state==='ready'));
});
