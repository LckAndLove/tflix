const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function renderer(){
 const code=fs.readFileSync('src-tauri/src/subtitle_controller.js','utf8');const start=code.indexOf('  function render()'),end=code.indexOf('  function selectTrack',start);
 const context={caption:{textContent:'old subtitle',hidden:false},video:{seeking:false,readyState:2,currentTime:127.5},selectedTrack:{cues:[{startTime:127.377,endTime:129.755,text:'current dialogue'}]},subtitleOffset:0};
 vm.createContext(context);vm.runInContext(code.slice(start,end),context);return context;
}
test('HLS seeking hides the old caption immediately and restores only the current cue after seeked',()=>{
 const c=renderer();c.video.seeking=true;c.render();assert.equal(c.caption.hidden,true);assert.equal(c.caption.textContent,'');
 c.video.seeking=false;c.render();assert.equal(c.caption.textContent,'current dialogue');assert.equal(c.caption.hidden,false);
});
test('late cuechange from an old playback position cannot display at a new media time',()=>{
 const c=renderer();c.video.currentTime=3841;c.render();assert.equal(c.caption.textContent,'');assert.equal(c.caption.hidden,true);
 c.selectedTrack.cues=[{startTime:3840.716,endTime:3844.635,text:'middle dialogue'}];c.render();assert.equal(c.caption.textContent,'middle dialogue');
});
test('captions stay hidden while the destination has no decoded media',()=>{
 const c=renderer();c.video.readyState=1;c.render();assert.equal(c.caption.hidden,true);
});
