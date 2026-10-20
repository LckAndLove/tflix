const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=require('node:fs').readFileSync('stream/index.html','utf8');
function failure(auto=true,current=true){
 const elements={};for(const id of ['failure-title','failure-copy','playback-failure','failure-action'])elements[id]={hidden:true,addEventListener(){}};
 const context={$:id=>elements[id],t:k=>k,window:{addEventListener:(name,fn)=>context.receive=fn},isCurrentPlayerFrame:()=>current,clearTimeout(){},sourceCheckTimer:1,sourceRecoveryTimer:2,sourceStatuses:{},state:{server:4},playerMediaDetected:false,autoTryEnabled:auto,updateServerCards(){},updateSourceStatus(){},revealWatchControls(){},openWatchDrawer(){},tryNextSource(){context.next++;},next:0};
 vm.createContext(context);vm.runInContext(html.slice(html.indexOf('function showPlaybackFailure('),html.indexOf('let chromeTimer=')),context);
 return {context,elements};
}
test('permanent refusal advances automatic probing without treating loading as failure',()=>{
 const {context}=failure();context.receive({data:{type:'tflix:embed-blocked'},source:{}});
 assert.equal(context.next,1);assert.equal(context.sourceStatuses[4],'failed');
});
test('manual refusal presents recovery without overriding the manual source',()=>{
 const {context,elements}=failure(false);context.receive({data:{type:'tflix:embed-blocked'},source:{}});
 assert.equal(context.next,0);assert.equal(elements['playback-failure'].hidden,false);assert.equal(context.state.server,4);
});
test('stale or unrelated frames cannot stop current playback',()=>{
 const {context,elements}=failure(true,false);context.receive({data:{type:'tflix:embed-blocked'},source:{}});
 assert.equal(context.next,0);assert.equal(elements['playback-failure'].hidden,true);
});
